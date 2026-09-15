import { withAdvisoryLock, prisma, type InvestmentTradeType } from "@finance-app/db";
import { decryptSecret } from "@finance-app/crypto";
import { fetchFlexStatement } from "./client";
import { asArray, parseIbkrDate, parseIbkrDateTime, parseCashReportRows } from "./parse";

export interface SyncResult {
  holdings: number;
  transactions: number;
}

/**
 * Synthetic per-currency symbol for a Cash Report row, stored alongside
 * real positions in InvestmentHolding rather than a separate model -- a
 * cash balance is valued and displayed exactly like a holding (current
 * amount, no cost basis), so it rides the existing balance/allocation/
 * history machinery for free. ":" can't collide with a real IBKR ticker,
 * which never contains one.
 */
export function cashSymbolFor(currency: string): string {
  return `CASH:${currency}`;
}

/**
 * Maps IBKR's free-text CashTransaction `type` field onto our fixed
 * InvestmentTradeType enum. Deposits/withdrawals are handled separately by
 * the caller (direction comes from the signed amount, not the type
 * string). Anything unrecognized returns null so the caller can skip it
 * rather than mis-tagging it as something it isn't.
 */
export function mapCashTransactionType(rawType: string): InvestmentTradeType | null {
  const t = rawType.toLowerCase();
  if (t.includes("dividend")) return "dividend";
  if (t.includes("interest")) return "interest";
  if (t.includes("fee") || t.includes("withholding") || t.includes("commission")) return "fee";
  return null;
}

/**
 * Runs one account's configured Flex Query and upserts the result:
 * OpenPosition -> InvestmentHolding (+ an InvestmentHoldingHistory row for
 * the same date, append-only point-in-time tracking), Trade and
 * CashTransaction -> InvestmentTransaction. Trades and cash transactions
 * are treated as immutable once executed (upsert with an empty `update`)
 * — IBKR doesn't retroactively change a settled transaction's economics,
 * only whether it appears in a given report window.
 */
export async function syncIbkrFlexConfig(configId: string): Promise<SyncResult> {
  return withAdvisoryLock(`ibkr-sync:${configId}`, () => syncUnlocked(configId));
}

async function syncUnlocked(configId: string): Promise<SyncResult> {
  const config = await prisma.ibkrFlexConfig.findUniqueOrThrow({ where: { id: configId } });
  const response = await fetchFlexStatement(decryptSecret(config.flexToken), config.flexQueryId);

  const statements = asArray(response.FlexStatements?.FlexStatement);
  if (statements.length === 0) {
    throw new Error("IBKR Flex Query returned no FlexStatement");
  }
  if (statements.length > 1) throw new Error("Configure one IBKR account per Flex Query");
  const statement = statements[0];
  if (!("OpenPositions" in statement)) throw new Error("Flex Query must include the complete Open Positions section");
  const reportDate = parseIbkrDate(String(statement["@_toDate"]));
  if (!Number.isFinite(reportDate.getTime())) throw new Error("Invalid IBKR report date");
  return prisma.$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM app.ibkr_flex_configs WHERE id = ${config.id} FOR UPDATE`;
    const latestConfig = await db.ibkrFlexConfig.findUniqueOrThrow({ where: { id: config.id } });
    if (latestConfig.lastReportDate && reportDate < latestConfig.lastReportDate) throw new Error("IBKR report is older than the last successful report");
    const positions = asArray(statement.OpenPositions?.OpenPosition);
    const symbols = new Set(positions.map((p) => String(p["@_symbol"])));
    if (symbols.size !== positions.length) throw new Error("Flex Query must aggregate positions by symbol");
    for (const pos of positions) {
      if (!pos["@_symbol"] || !pos["@_currency"] || !Number.isFinite(Number(pos["@_position"])) || !Number.isFinite(Number(pos["@_positionValue"]))) {
        throw new Error("Invalid IBKR position row");
      }
      if (pos["@_reportDate"] && parseIbkrDate(String(pos["@_reportDate"])).getTime() !== reportDate.getTime()) {
        throw new Error("Flex Query positions must all belong to the ending report date");
      }
    }
    const cashRows = parseCashReportRows(statement.CashReport);
    const cashSymbols = cashRows.map((r) => cashSymbolFor(r.currency));

    const previous = await db.investmentHolding.findMany({ where: { accountId: config.accountId }, orderBy: { asOfDate: "desc" }, distinct: ["symbol"] });
    const currentSymbols = new Set([...symbols, ...cashSymbols]);
    for (const old of previous) {
      if (currentSymbols.has(old.symbol)) continue;
      const key = { accountId: config.accountId, symbol: old.symbol, asOfDate: reportDate };
      await db.investmentHolding.upsert({ where: { accountId_symbol_asOfDate: key },
        create: { ...key, securityType: old.securityType, currency: old.currency, quantity: 0, marketValue: 0 },
        update: { quantity: 0, marketValue: 0 } });
      await db.investmentHoldingHistory.upsert({ where: { accountId_symbol_asOfDate: key },
        create: { ...key, quantity: 0, marketValue: 0 }, update: { quantity: 0, marketValue: 0 } });
    }

    const result: SyncResult = { holdings: 0, transactions: 0 };

    for (const pos of positions) {
      const symbol = String(pos["@_symbol"]);
      const asOfDate = reportDate;
      const shared = {
        quantity: Number(pos["@_position"]),
        marketValue: Number(pos["@_positionValue"]),
      };

      await db.investmentHolding.upsert({
        where: { accountId_symbol_asOfDate: { accountId: config.accountId, symbol, asOfDate } },
        create: {
          accountId: config.accountId,
          symbol,
          securityType: String(pos["@_assetCategory"]),
          currency: String(pos["@_currency"]),
          avgCost: pos["@_costBasisPrice"] ? Number(pos["@_costBasisPrice"]) : null,
          asOfDate,
          ...shared,
        },
        update: {
          securityType: String(pos["@_assetCategory"]),
          currency: String(pos["@_currency"]),
          avgCost: pos["@_costBasisPrice"] ? Number(pos["@_costBasisPrice"]) : null,
          ...shared,
        },
      });

      await db.investmentHoldingHistory.upsert({
        where: { accountId_symbol_asOfDate: { accountId: config.accountId, symbol, asOfDate } },
        create: { accountId: config.accountId, symbol, asOfDate, ...shared },
        update: shared,
      });

      result.holdings++;
    }

    for (const row of cashRows) {
      const symbol = cashSymbolFor(row.currency);
      const asOfDate = reportDate;
      // No unit-price concept for cash -- quantity and marketValue are both
      // just the currency amount, which also keeps the "quantity !== 0"
      // exited-position filter used throughout the app correct for free.
      const shared = { quantity: row.endingCash, marketValue: row.endingCash };

      await db.investmentHolding.upsert({
        where: { accountId_symbol_asOfDate: { accountId: config.accountId, symbol, asOfDate } },
        create: { accountId: config.accountId, symbol, securityType: "CASH", currency: row.currency, avgCost: null, asOfDate, ...shared },
        update: { securityType: "CASH", currency: row.currency, avgCost: null, ...shared },
      });

      await db.investmentHoldingHistory.upsert({
        where: { accountId_symbol_asOfDate: { accountId: config.accountId, symbol, asOfDate } },
        create: { accountId: config.accountId, symbol, asOfDate, ...shared },
        update: shared,
      });

      result.holdings++;
    }

    for (const trade of asArray(statement.Trades?.Trade)) {
      const externalId = String(trade["@_transactionID"]);
      const tradeType: InvestmentTradeType = trade["@_buySell"] === "SELL" ? "sell" : "buy";

      await db.investmentTransaction.upsert({
        where: { accountId_externalId: { accountId: config.accountId, externalId } },
        create: {
          accountId: config.accountId,
          symbol: String(trade["@_symbol"]),
          tradeType,
          quantity: Number(trade["@_quantity"]),
          price: Number(trade["@_tradePrice"]),
          amount: Number(trade["@_netCash"]),
          currency: String(trade["@_currency"]),
          tradeDate: parseIbkrDate(String(trade["@_tradeDate"])),
          externalId,
        },
        update: {},
      });
      result.transactions++;
    }

    for (const ct of asArray(statement.CashTransactions?.CashTransaction)) {
      const rawType = String(ct["@_type"]);
      const amount = Number(ct["@_amount"]);
      let tradeType = mapCashTransactionType(rawType);
      if (!tradeType) {
        if (rawType.toLowerCase().includes("deposit") || rawType.toLowerCase().includes("withdrawal")) {
          tradeType = amount >= 0 ? "deposit" : "withdrawal";
        } else {
          continue; // unrecognized cash-transaction type — skip, don't mis-tag
        }
      }

      const externalId = String(ct["@_transactionID"]);
      const symbol = ct["@_symbol"] ? String(ct["@_symbol"]) : null;
      const tradeDateRaw = ct["@_dateTime"] || ct["@_settleDate"];

      await db.investmentTransaction.upsert({
        where: { accountId_externalId: { accountId: config.accountId, externalId } },
        create: {
          accountId: config.accountId,
          symbol,
          tradeType,
          amount,
          currency: String(ct["@_currency"]),
          tradeDate: parseIbkrDateTime(String(tradeDateRaw)),
          externalId,
        },
        update: {},
      });
      result.transactions++;
    }

    await db.ibkrFlexConfig.update({
      where: { id: config.id },
      data: {
        lastRunAt: new Date(),
        lastReportDate: parseIbkrDate(String(statement["@_toDate"])),
      },
    });

    return result;
  }, { timeout: 60000 });
}
