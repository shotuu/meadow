import { prisma, type FinancialAccount } from "@finance-app/db";
import { computeAccountBalance, convertCurrency } from "@finance-app/finance-logic";
import { readUsdRates, requireConversion } from "./fx";

/** One complete report per account, including zero-position closing reports. */
export async function readCurrentHoldings(userId: string, accountIds?: string[]) {
  const dates = await prisma.investmentHolding.groupBy({
    by: ["accountId"], where: { account: { userId, isArchived: false }, ...(accountIds ? { accountId: { in: accountIds } } : {}) },
    _max: { asOfDate: true },
  });
  return prisma.investmentHolding.findMany({ where: {
    account: { userId, isArchived: false },
    OR: dates.flatMap((d) => d._max.asOfDate ? [{ accountId: d.accountId, asOfDate: d._max.asOfDate }] : []),
  } });
}

export async function readAccountBalances(userId: string, suppliedAccounts?: FinancialAccount[]) {
  const accounts = suppliedAccounts ?? await prisma.financialAccount.findMany({ where: { userId, isArchived: false } });
  if (accounts.some((a) => a.userId !== userId)) throw new Error("Account ownership mismatch");
  const ids = accounts.map((a) => a.id);
  const [sums, holdings, rates] = await Promise.all([
    prisma.transaction.groupBy({ by: ["accountId", "currency"], where: { userId, accountId: { in: ids } }, _sum: { amount: true } }),
    readCurrentHoldings(userId, ids), readUsdRates(),
  ]);
  // A single account whose currency has no FX rate must not take down every
  // other account's (correctly computable) balance in this same batch, so
  // skip just that account (callers already treat a missing map entry as
  // "unknown," not as a silent zero) rather than letting requireConversion's
  // throw propagate out of the whole Map construction.
  return new Map(accounts.flatMap((account) => {
    try {
      const positions = holdings.filter((h) => h.accountId === account.id);
      const holdingsSum = account.syncSource !== "ibkr_flex" ? 0 : positions.reduce((sum, h) => sum + requireConversion(Number(h.marketValue), h.currency, account.currency, rates), 0);
      const usesFallback = account.syncSource !== "ibkr_flex" && !(["plaid", "finverse"].includes(account.syncSource) && account.currentBalance !== null);
      const transactionSum = !usesFallback ? 0 : sums.filter((s) => s.accountId === account.id).reduce((sum, s) =>
        sum + requireConversion(Number(s._sum.amount ?? 0), s.currency, account.currency, rates), 0);
      let currentBalance = account.currentBalance === null ? null : Number(account.currentBalance);
      // Old Plaid records used provider signs; new ingestion explicitly marks canonical balances.
      if (currentBalance !== null && account.syncSource === "plaid" && !account.balanceIsCanonical &&
        (account.type === "credit_card" || account.type === "loan")) currentBalance = -currentBalance;
      // Finverse's debt-balance sign convention has not been verified against
      // a real credit_card/loan account (see PROGRESS.md), unlike Plaid's,
      // which is a documented API convention. Guessing a flip here risks
      // introducing the exact class of sign bug this sprint just fixed for
      // Plaid, so this is left unflipped and flagged rather than guessed.
      if (currentBalance !== null && account.syncSource === "finverse" &&
        (account.type === "credit_card" || account.type === "loan")) {
        console.warn(
          `[finance-data] readAccountBalances: account ${account.id} is a Finverse ${account.type} using an unverified institution-reported sign convention`
        );
      }
      const computed = computeAccountBalance({ syncSource: account.syncSource, transactionSum, currentBalance, holdingsSum });
      const sourceAsOf = computed.method === "institution_reported" ? account.balanceAsOf :
        computed.method === "holdings_derived" ? positions[0]?.asOfDate ?? null : null;
      return [[account.id, { ...computed, sourceAsOf, isComplete: computed.method === "institution_reported" && sourceAsOf !== null }]] as const;
    } catch (err) {
      console.error(`[finance-data] readAccountBalances: account ${account.id} balance unavailable`, err);
      return [];
    }
  }));
}

/** Value each day's latest complete account report in a single reporting currency. */
export async function readPortfolioHistory(userId: string, currency: string, accountIds?: string[], symbol?: string) {
  const rows = await prisma.investmentHolding.findMany({
    where: { account: { userId, isArchived: false }, ...(accountIds ? { accountId: { in: accountIds } } : {}) },
    orderBy: { asOfDate: "asc" },
  });
  const byDay = new Map<string, typeof rows>();
  for (const row of rows) {
    const day = row.asOfDate.toISOString().slice(0, 10);
    const group = byDay.get(day) ?? [];
    group.push(row); byDay.set(day, group);
  }
  const latestByAccount = new Map<string, typeof rows>();
  const result: { asOfDate: Date; value: number | null }[] = [];
  for (const [day, dailyRows] of byDay) {
    for (const id of new Set(dailyRows.map((r) => r.accountId))) {
      latestByAccount.set(id, dailyRows.filter((r) => r.accountId === id));
    }
    const asOfDate = new Date(day);
    const rates = await readUsdRates(asOfDate);
    const converted = [...latestByAccount.values()].flat().filter((r) => !symbol || r.symbol === symbol)
      .map((r) => convertCurrency(Number(r.marketValue), r.currency, currency, rates));
    const value = converted.some((v) => v === null) ? null : converted.reduce<number>((sum, v) => sum + v!, 0);
    result.push({ asOfDate, value });
  }
  return result;
}
