import { prisma, type InvestmentTradeType } from "@finance-app/db";
import { decryptSecret } from "@finance-app/crypto";
import { fetchFlexStatement } from "./client";
import { asArray, parseIbkrDate, parseIbkrDateTime } from "./parse";

export interface SyncResult {
  holdings: number;
  transactions: number;
}

/**
 * Maps IBKR's free-text CashTransaction `type` field onto our fixed
 * InvestmentTradeType enum. Deposits/withdrawals are handled separately by
 * the caller (direction comes from the signed amount, not the type
 * string). Anything unrecognized returns null so the caller can skip it
 * rather than mis-tagging it as something it isn't.
 */
function mapCashTransactionType(rawType: string): InvestmentTradeType | null {
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
  const config = await prisma.ibkrFlexConfig.findUniqueOrThrow({ where: { id: configId } });
  const response = await fetchFlexStatement(decryptSecret(config.flexToken), config.flexQueryId);

  const statements = asArray(response.FlexStatements?.FlexStatement);
  if (statements.length === 0) {
    throw new Error("IBKR Flex Query returned no FlexStatement");
  }
  if (statements.length > 1) {
    console.warn(
      `[ibkr-sync] Flex Query for config ${configId} returned ${statements.length} statements — only the first is processed (one FinancialAccount per IbkrFlexConfig).`
    );
  }
  const statement = statements[0];

  const result: SyncResult = { holdings: 0, transactions: 0 };

  for (const pos of asArray(statement.OpenPositions?.OpenPosition)) {
    const symbol = String(pos["@_symbol"]);
    const asOfDate = parseIbkrDate(String(pos["@_reportDate"]));
    const shared = {
      quantity: Number(pos["@_position"]),
      marketValue: Number(pos["@_positionValue"]),
    };

    await prisma.investmentHolding.upsert({
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

    await prisma.investmentHoldingHistory.upsert({
      where: { accountId_symbol_asOfDate: { accountId: config.accountId, symbol, asOfDate } },
      create: { accountId: config.accountId, symbol, asOfDate, ...shared },
      update: shared,
    });

    result.holdings++;
  }

  for (const trade of asArray(statement.Trades?.Trade)) {
    const externalId = String(trade["@_transactionID"]);
    const tradeType: InvestmentTradeType = trade["@_buySell"] === "SELL" ? "sell" : "buy";

    await prisma.investmentTransaction.upsert({
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

    await prisma.investmentTransaction.upsert({
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

  await prisma.ibkrFlexConfig.update({
    where: { id: config.id },
    data: {
      lastRunAt: new Date(),
      lastReportDate: parseIbkrDate(String(statement["@_toDate"])),
    },
  });

  return result;
}
