import "server-only";
import { prisma, type AccountType } from "@finance-app/db";
import {
  readAccountBalances,
  readCurrentHoldings,
  readPortfolioHistory,
  readUsdRates,
  computeRecurringBudgetProgress,
} from "@finance-app/finance-data";
import {
  convertCurrency,
  computeCurrentAllocation,
  computePortfolioDrift,
  resolveBucketName,
  classifyFundingStatus,
  computeUncommittedCash,
  computeInvestableCash,
  addMonthsClamped,
} from "@finance-app/finance-logic";
import { requireUserId } from "@/lib/session";
import { SCHEMA_VERSION, type AiFinancialContextExport, type ExportAccount, type ExportTransaction, type ExportMonthlyCategorySummary, type ExportBudget, type ExportRecurringCharge, type ExportHolding, type ExportObligation, type ExportIncomeStream, type ExportCashReserve, type ExportNetWorthSnapshot } from "./schema";
import { toDecimalString } from "./decimal";
import {
  TRANSACTION_SELECT,
  CATEGORY_SELECT,
  BUDGET_SELECT,
  RECURRING_SERIES_SELECT,
  TARGET_ALLOCATION_SELECT,
  OBLIGATION_SELECT,
  INCOME_STREAM_SELECT,
  CASH_RESERVE_SELECT,
  buildCategoryPath,
  buildAccountLabel,
} from "./allowlist";

const RECENT_WINDOW_MONTHS = 12;

// Only checking/savings/cash accounts feed the cash-policy calculations --
// same set the dashboard already uses for this exact purpose.
const CASH_ACCOUNT_TYPES: AccountType[] = ["checking", "savings", "cash"];

/**
 * Builds the AI Financial Context export for the signed-in user. Runs
 * everything inside one RepeatableRead transaction so a transaction (or
 * anything else) written mid-generation can't appear in one section's
 * totals but not another's -- a "consistent database snapshot," per
 * ARCHITECTURE_FIXES.md's own stated requirement for this feature.
 */
export async function buildAiFinancialContextExport(): Promise<AiFinancialContextExport> {
  const userId = await requireUserId();
  const now = new Date();
  const recentStart = addMonthsClamped(now, -RECENT_WINDOW_MONTHS);

  return prisma.$transaction(async (tx) => {
    const appUser = await tx.appUser.findUniqueOrThrow({ where: { id: userId } });
    const defaultCurrency = appUser.defaultCurrency;

    const accounts = await tx.financialAccount.findMany({ where: { userId, isArchived: false } });
    const accountLabelById = new Map(accounts.map((a) => [a.id, buildAccountLabel(a)]));

    const [computedBalances, currentRates] = await Promise.all([
      readAccountBalances(userId, accounts, tx),
      readUsdRates(now, tx),
    ]);

    const exportAccounts: ExportAccount[] = accounts.map((account) => {
      const computed = computedBalances.get(account.id);
      const balanceInDefaultCurrencyApprox = computed
        ? convertCurrency(computed.balance, account.currency, defaultCurrency, currentRates)
        : null;
      // Same condition as finance-data's own runtime warning -- Finverse's
      // debt-balance sign convention has never been verified, unlike
      // Plaid's documented one.
      const caveat =
        account.syncSource === "finverse" && (account.type === "credit_card" || account.type === "loan")
          ? "This account's institution-reported balance sign has not been verified against a real debit/credit for Finverse-synced credit/loan accounts -- it may be inverted."
          : null;
      return {
        label: buildAccountLabel(account),
        institutionName: account.institutionName,
        type: account.type,
        classification: account.classification,
        currency: account.currency,
        syncSource: account.syncSource,
        balance: {
          amount: computed ? String(computed.balance) : null,
          currency: account.currency,
          asOfDate: computed?.sourceAsOf ? computed.sourceAsOf.toISOString().slice(0, 10) : null,
          method: computed?.method ?? "unavailable",
          isComplete: computed?.isComplete ?? false,
        },
        balanceInDefaultCurrencyApprox,
        caveat,
      };
    });

    const netWorthCurrent = computeNetWorthTotals(accounts, computedBalances, currentRates, defaultCurrency);
    const netWorthHistory = await computeNetWorthHistory(tx, userId, accounts, defaultCurrency);

    const [recentTransactionRows, olderTransactionRows] = await Promise.all([
      tx.transaction.findMany({
        where: { userId, date: { gte: recentStart } },
        orderBy: { date: "desc" },
        select: TRANSACTION_SELECT,
      }),
      tx.transaction.findMany({
        where: { userId, date: { lt: recentStart }, isTransfer: false },
        select: { date: true, amount: true, currency: true, category: { select: { name: true, parentCategory: { select: { name: true } } } } },
      }),
    ]);

    const recentTransactions: ExportTransaction[] = recentTransactionRows.map((t) => ({
      date: t.date.toISOString().slice(0, 10),
      description: t.description,
      merchantName: t.merchantName,
      amount: toDecimalString(t.amount)!,
      currency: t.currency,
      accountLabel: buildAccountLabel(t.account),
      categoryPath: buildCategoryPath(t.category),
      isTransfer: t.isTransfer,
      pending: t.pending,
      notes: t.notes,
    }));

    const olderMonthlySummaries = summarizeOlderTransactionsByMonth(olderTransactionRows);

    const budgetRows = await tx.budget.findMany({ where: { userId, effectiveTo: null }, select: BUDGET_SELECT });
    const budgets: ExportBudget[] = await Promise.all(
      budgetRows.map(async (b) => {
        const progress = await computeRecurringBudgetProgress(userId, b.category, b, now, tx);
        const currentPeriod = progress.periods?.at(-1);
        return {
          categoryPath: buildCategoryPath(b.category)!,
          budgetType: b.category.budgetType,
          period: b.period,
          amount: toDecimalString(b.amount)!,
          currency: b.currency,
          rolloverEnabled: b.rolloverEnabled,
          rolloverCap: toDecimalString(b.rolloverCap),
          effectiveFrom: b.effectiveFrom.toISOString().slice(0, 10),
          currentPeriod: {
            periodStart: (currentPeriod?.periodStart ?? progress.periodEnd).toISOString().slice(0, 10),
            periodEnd: progress.periodEnd.toISOString().slice(0, 10),
            spentApprox: progress.spent,
            remainingApprox: progress.remaining,
            rolledOverAmountApprox: progress.rolledOverAmount,
          },
        };
      })
    );

    const recurringRows = await tx.recurringSeries.findMany({ where: { userId }, select: RECURRING_SERIES_SELECT });
    const recurringCharges: ExportRecurringCharge[] = recurringRows.map((s) => ({
      merchantDisplayName: s.transactions[0]?.transaction.merchantName ?? s.merchantKey,
      categoryPath: buildCategoryPath(s.category),
      cadence: s.cadence,
      expectedAmount: toDecimalString(s.expectedAmount)!,
      currency: s.currency,
      status: s.status,
      lastSeenDate: s.lastSeenDate.toISOString().slice(0, 10),
      nextExpectedDate: s.nextExpectedDate ? s.nextExpectedDate.toISOString().slice(0, 10) : null,
      confidenceScore: toDecimalString(s.confidenceScore)!,
    }));

    const [holdingRows, bucketAssignments, targetRows] = await Promise.all([
      readCurrentHoldings(userId, undefined, tx),
      tx.holdingBucketAssignment.findMany({ where: { userId } }),
      tx.targetAllocation.findMany({ where: { userId }, select: TARGET_ALLOCATION_SELECT }),
    ]);
    const overridesBySymbol = new Map(bucketAssignments.map((a) => [a.symbol, a.bucketName]));
    const activeHoldings = holdingRows.filter((h) => Number(h.quantity) !== 0);
    const holdings: ExportHolding[] = activeHoldings.map((h) => ({
      accountLabel: accountLabelById.get(h.accountId) ?? "Unknown account",
      symbol: h.symbol,
      securityType: h.securityType,
      quantity: toDecimalString(h.quantity)!,
      avgCost: toDecimalString(h.avgCost),
      currency: h.currency,
      marketValue: toDecimalString(h.marketValue)!,
      asOfDate: h.asOfDate.toISOString().slice(0, 10),
      bucketName: resolveBucketName(h.symbol, h.securityType, overridesBySymbol),
    }));
    const bucketedForAllocation = activeHoldings.flatMap((h) => {
      const converted = convertCurrency(Number(h.marketValue), h.currency, defaultCurrency, currentRates);
      return converted === null ? [] : [{ bucketName: resolveBucketName(h.symbol, h.securityType, overridesBySymbol), marketValue: converted }];
    });
    const currentAllocation = computeCurrentAllocation(bucketedForAllocation);
    const targets = targetRows.map((t) => ({ bucketName: t.bucketName, targetWeightPct: Number(t.targetWeightPct), driftThresholdPct: Number(t.driftThresholdPct) }));
    const drift = computePortfolioDrift(currentAllocation, targets);

    const portfolioHistoryAll = await readPortfolioHistory(userId, defaultCurrency, undefined, undefined, tx);
    const portfolioHistoryRecent = portfolioHistoryAll
      .filter((row) => row.asOfDate >= recentStart)
      .map((row) => ({ asOfDate: row.asOfDate.toISOString().slice(0, 10), valueInDefaultCurrencyApprox: row.value, hasGap: row.value === null }));

    const obligationRows = await tx.obligation.findMany({ where: { userId, isActive: true }, select: OBLIGATION_SELECT });
    const obligations: ExportObligation[] = obligationRows.map((o) => ({
      name: o.name,
      amount: toDecimalString(o.amount)!,
      currency: o.currency,
      frequency: o.frequency,
      nextDueDate: o.nextDueDate.toISOString().slice(0, 10),
      priority: o.priority,
      fundedAmount: toDecimalString(o.fundedAmount)!,
      fundingStatus: classifyFundingStatus(Number(o.amount), Number(o.fundedAmount)),
      categoryPath: buildCategoryPath(o.category),
    }));

    const incomeStreamRows = await tx.incomeStream.findMany({ where: { userId, isActive: true }, select: INCOME_STREAM_SELECT });
    const incomeStreams: ExportIncomeStream[] = incomeStreamRows.map((s) => ({
      name: s.name,
      currency: s.currency,
      frequency: s.frequency,
      grossAmount: toDecimalString(s.grossAmount)!,
      netAmount: toDecimalString(s.netAmount),
      nextExpectedDate: s.nextExpectedDate.toISOString().slice(0, 10),
      confidence: s.confidence,
    }));

    const cashReserveRows = await tx.cashReserve.findMany({ where: { userId }, select: CASH_RESERVE_SELECT });
    const cashReserves: ExportCashReserve[] = cashReserveRows.map((r) => ({
      name: r.name,
      currency: r.currency,
      targetAmount: toDecimalString(r.targetAmount)!,
      minimumAmount: toDecimalString(r.minimumAmount),
      scope: r.account ? `account:${buildAccountLabel(r.account)}` : `currency:${r.currency}`,
    }));

    const cashBalancesByCurrency = new Map<string, number>();
    for (const account of accounts) {
      if (account.classification === "asset" && CASH_ACCOUNT_TYPES.includes(account.type)) {
        const balance = computedBalances.get(account.id)?.balance ?? 0;
        cashBalancesByCurrency.set(account.currency, (cashBalancesByCurrency.get(account.currency) ?? 0) + balance);
      }
    }
    const uncommittedCashByCurrency = computeUncommittedCash(
      [...cashBalancesByCurrency.entries()].map(([currency, balance]) => ({ currency, balance })),
      cashReserveRows.map((r) => ({ currency: r.currency, targetAmount: Number(r.targetAmount) }))
    );
    const investableCashByCurrency = computeInvestableCash(
      uncommittedCashByCurrency,
      obligationRows.map((o) => ({
        currency: o.currency,
        amount: Number(o.amount),
        fundedAmount: Number(o.fundedAmount),
        priority: o.priority,
        nextDueDate: o.nextDueDate,
        isActive: true,
      })),
      now
    );

    const categoryRows = await tx.category.findMany({ where: { userId, isArchived: false }, select: CATEGORY_SELECT });
    const categories = categoryRows.map((c) => ({ path: buildCategoryPath(c)!, kind: c.kind, budgetType: c.budgetType }));

    const earliestSnapshotDate = netWorthHistory[0]?.asOfDate ?? null;

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: now.toISOString(),
      snapshotAsOf: now.toISOString().slice(0, 10),
      recentWindow: { startDate: recentStart.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10), months: RECENT_WINDOW_MONTHS },
      profile: { defaultCurrency, locale: appUser.locale, timezone: appUser.timezone },
      accounts: exportAccounts,
      netWorth: { current: netWorthCurrent, history: netWorthHistory },
      transactions: { recent: recentTransactions, olderMonthlySummaries },
      budgets,
      recurringCharges,
      investments: {
        holdings,
        allocation: {
          current: currentAllocation.map((a) => ({ bucketName: a.bucketName, marketValueInDefaultCurrencyApprox: a.marketValue, currentWeightPct: a.currentWeightPct })),
          targets: targetRows.map((t) => ({ bucketName: t.bucketName, targetWeightPct: toDecimalString(t.targetWeightPct)!, driftThresholdPct: toDecimalString(t.driftThresholdPct)! })),
          drift,
        },
        portfolioHistoryRecent,
      },
      obligations,
      incomeStreams,
      cashReserves,
      cashPolicy: { uncommittedCashByCurrency, investableCashByCurrency },
      categories,
      meta: {
        exportNote:
          "Generated by Meadow at the user's request for sharing with an external AI assistant. Balances and holdings are as of the dates shown, not real-time. Fields suffixed 'Approx' or 'InDefaultCurrency' are FX-converted and rounded for readability; every other monetary field is an exact ledger value in its native currency.",
        knownDataGaps: [
          earliestSnapshotDate
            ? `Net worth history begins ${earliestSnapshotDate} (the date daily balance snapshots started) -- earlier trend is not available.`
            : "No net worth history is available yet -- daily balance snapshots have not run for this account.",
          "Sinking funds and prepaid-coverage budget categories are not included in this export yet.",
          "Obligation funding is manually tracked planning data, not a reconciled payment ledger.",
        ],
      },
    };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}

function computeNetWorthTotals(
  accounts: { id: string; classification: string; currency: string }[],
  computedBalances: Awaited<ReturnType<typeof readAccountBalances>>,
  rates: Awaited<ReturnType<typeof readUsdRates>>,
  defaultCurrency: string
): AiFinancialContextExport["netWorth"]["current"] {
  let totalAssets = 0;
  let totalLiabilities = 0;
  let complete = true;
  for (const account of accounts) {
    const computed = computedBalances.get(account.id);
    if (!computed) {
      complete = false;
      continue;
    }
    const converted = convertCurrency(computed.balance, account.currency, defaultCurrency, rates);
    if (converted === null) {
      complete = false;
      continue;
    }
    if (account.classification === "asset") totalAssets += converted;
    else totalLiabilities += converted;
  }
  if (!complete) {
    return { totalAssetsInDefaultCurrency: null, totalLiabilitiesInDefaultCurrency: null, netWorthInDefaultCurrency: null };
  }
  return {
    totalAssetsInDefaultCurrency: totalAssets,
    totalLiabilitiesInDefaultCurrency: totalLiabilities,
    netWorthInDefaultCurrency: totalAssets + totalLiabilities,
  };
}

/** Mirrors readPortfolioHistory's per-day historical-rate approach for account balance snapshots. */
async function computeNetWorthHistory(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  accounts: { id: string; classification: string }[],
  defaultCurrency: string
): Promise<ExportNetWorthSnapshot[]> {
  const classificationById = new Map(accounts.map((a) => [a.id, a.classification]));
  const snapshots = await tx.accountBalanceSnapshot.findMany({
    where: { userId },
    orderBy: { asOfDate: "asc" },
    select: { accountId: true, asOfDate: true, balance: true, currency: true },
  });
  const byDay = new Map<string, typeof snapshots>();
  for (const row of snapshots) {
    const day = row.asOfDate.toISOString().slice(0, 10);
    const group = byDay.get(day) ?? [];
    group.push(row);
    byDay.set(day, group);
  }
  const result: ExportNetWorthSnapshot[] = [];
  for (const [day, rows] of byDay) {
    const asOfDate = new Date(day);
    const rates = await readUsdRates(asOfDate, tx);
    let assets = 0;
    let liabilities = 0;
    let hasGap = false;
    for (const row of rows) {
      const classification = classificationById.get(row.accountId);
      if (!classification) continue;
      const converted = convertCurrency(Number(row.balance), row.currency, defaultCurrency, rates);
      if (converted === null) {
        hasGap = true;
        continue;
      }
      if (classification === "asset") assets += converted;
      else liabilities += converted;
    }
    result.push({
      asOfDate: day,
      totalAssetsInDefaultCurrencyApprox: hasGap ? null : assets,
      totalLiabilitiesInDefaultCurrencyApprox: hasGap ? null : liabilities,
      netWorthInDefaultCurrencyApprox: hasGap ? null : assets + liabilities,
      hasGap,
    });
  }
  return result;
}

/** categoryId isn't selected (it's an internal FK) -- the category relation already carries the display name. */
type OlderTransactionRow = {
  date: Date;
  amount: import("@finance-app/db").Prisma.Decimal;
  currency: string;
  category: { name: string; parentCategory: { name: string } | null } | null;
};

function summarizeOlderTransactionsByMonth(rows: OlderTransactionRow[]): ExportMonthlyCategorySummary[] {
  const buckets = new Map<string, { month: string; categoryPath: string | null; totals: Map<string, import("@finance-app/db").Prisma.Decimal> }>();
  for (const row of rows) {
    const month = row.date.toISOString().slice(0, 7);
    const categoryPath = buildCategoryPath(row.category);
    const key = `${month}|${categoryPath ?? ""}`;
    const bucket = buckets.get(key) ?? { month, categoryPath, totals: new Map() };
    const existing = bucket.totals.get(row.currency);
    bucket.totals.set(row.currency, existing ? existing.plus(row.amount) : row.amount);
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((b) => ({
      month: b.month,
      categoryPath: b.categoryPath,
      totalsByCurrency: Object.fromEntries([...b.totals.entries()].map(([currency, total]) => [currency, total.toString()])),
    }));
}
