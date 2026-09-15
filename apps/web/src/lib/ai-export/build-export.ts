import "server-only";
import { prisma, type AccountType } from "@finance-app/db";
import {
  readAccountBalances,
  readCurrentHoldings,
  readPortfolioHistory,
  readUsdRates,
  computeRecurringBudgetProgress,
  computePrepaidCoverageProgress,
} from "@finance-app/finance-data";
import {
  convertCurrency,
  computeCurrentAllocation,
  computePortfolioDrift,
  classifyFundingStatus,
  computeUncommittedCash,
  computeInvestableCash,
  computeRequiredContribution,
  addMonthsClamped,
  matchReversals,
  normalizeMerchantKey,
  classifyInstrumentType,
  instrumentTypeLabel,
  type InstrumentType,
  type ReversalCandidateEvent,
} from "@finance-app/finance-logic";
import { requireUserId } from "@/lib/session";
import {
  SCHEMA_VERSION,
  type AiFinancialContextExport,
  type ExportMode,
  type ExportAccount,
  type ExportTransaction,
  type ExportMonthlyCategorySummary,
  type ExportBudget,
  type ExportSinkingFund,
  type ExportPrepaidCoverage,
  type ExportRecurringCharge,
  type ExportHolding,
  type ExportObligation,
  type ExportIncomeStream,
  type ExportCashReserve,
  type ExportCashPolicy,
  type ExportNetWorthSnapshot,
} from "./schema";
import { toDecimalString, roundMoney, roundPct } from "./decimal";
import { classifyIncome, isLikelyRefundText } from "./income-classify";
import { redactReferenceNumbers } from "./redact";
import {
  TRANSACTION_SELECT,
  CATEGORY_SELECT,
  BUDGET_SELECT,
  SINKING_FUND_SELECT,
  PREPAID_COVERAGE_SELECT,
  RECURRING_SERIES_SELECT,
  TARGET_ALLOCATION_SELECT,
  OBLIGATION_SELECT,
  INCOME_STREAM_SELECT,
  CASH_RESERVE_SELECT,
  buildCategoryPath,
  buildAccountLabel,
} from "./allowlist";

const RECENT_WINDOW_MONTHS = 12;
const UPCOMING_OBLIGATION_WINDOW_DAYS = 90;

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
export async function buildAiFinancialContextExport(mode: ExportMode): Promise<AiFinancialContextExport> {
  const userId = await requireUserId();
  const now = new Date();
  const recentStart = addMonthsClamped(now, -RECENT_WINDOW_MONTHS);
  const warnings: string[] = [];

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
      if (caveat) warnings.push(`${buildAccountLabel(account)}: ${caveat}`);
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
        balanceInDefaultCurrencyApprox: roundMoney(balanceInDefaultCurrencyApprox),
        caveat,
      };
    });

    const netWorthCurrent = computeNetWorthTotals(accounts, computedBalances, currentRates, defaultCurrency);
    const netWorthHistory = await computeNetWorthHistory(tx, userId, accounts, defaultCurrency);

    // Fetched early: both the income heuristic and the financialPlan
    // section need these.
    const [cashReserveRows, obligationRows, incomeStreamRows, targetRows] = await Promise.all([
      tx.cashReserve.findMany({ where: { userId }, select: CASH_RESERVE_SELECT }),
      tx.obligation.findMany({ where: { userId, isActive: true }, select: OBLIGATION_SELECT }),
      tx.incomeStream.findMany({ where: { userId, isActive: true }, select: INCOME_STREAM_SELECT }),
      tx.targetAllocation.findMany({ where: { userId }, select: TARGET_ALLOCATION_SELECT }),
    ]);
    const activeIncomeStreamNames = incomeStreamRows.map((s) => s.name);

    // id/accountId are selected here ONLY to run the read-only, non-persisted
    // reversal/refund matcher below -- never included in the output, which
    // uses TRANSACTION_SELECT's fields exclusively. Same pattern as
    // BUDGET_SELECT's internal category.id.
    const [recentTransactionRows, olderTransactionRows, recurringLinkedTxIds] = await Promise.all([
      tx.transaction.findMany({
        where: { userId, date: { gte: recentStart } },
        orderBy: { date: "desc" },
        select: { ...TRANSACTION_SELECT, id: true, accountId: true },
      }),
      tx.transaction.findMany({
        where: { userId, date: { lt: recentStart }, isTransfer: false },
        select: { date: true, amount: true, currency: true, category: { select: { name: true, parentCategory: { select: { name: true } } } } },
      }),
      tx.recurringSeriesTransaction.findMany({ where: { recurringSeries: { userId } }, select: { transactionId: true } }),
    ]);
    const recurringLinkedTxIdSet = new Set(recurringLinkedTxIds.map((r) => r.transactionId));

    const reversalEvents: ReversalCandidateEvent[] = recentTransactionRows
      .filter((t) => !t.isTransfer)
      .map((t) => ({
        id: t.id,
        accountId: t.accountId,
        amount: Number(t.amount),
        currency: t.currency,
        date: t.date,
        merchantKey: normalizeMerchantKey(t.merchantName ?? t.description) || null,
        pending: t.pending,
      }));
    const reversalMatches = matchReversals(reversalEvents);
    const reversalByTxId = new Map<string, { partnerDate: Date; confidence: number }>();
    const rowById = new Map(recentTransactionRows.map((t) => [t.id, t]));
    for (const match of reversalMatches) {
      const a = rowById.get(match.aId);
      const b = rowById.get(match.bId);
      if (a) reversalByTxId.set(match.aId, { partnerDate: b!.date, confidence: match.confidenceScore });
      if (b) reversalByTxId.set(match.bId, { partnerDate: a!.date, confidence: match.confidenceScore });
    }

    const redact = (text: string) => (mode === "privacy_safe" ? redactReferenceNumbers(text) : text);

    const recentTransactions: ExportTransaction[] = recentTransactionRows.map((t) => {
      const amount = Number(t.amount);
      const text = `${t.description} ${t.merchantName ?? ""}`;
      const income = classifyIncome({
        amount,
        isTransfer: t.isTransfer,
        description: t.description,
        merchantName: t.merchantName,
        activeIncomeStreamNames,
        isLinkedToRecurringSeries: recurringLinkedTxIdSet.has(t.id),
      });
      const reversal = reversalByTxId.get(t.id);
      const isRefund = reversal !== undefined && amount > 0 && isLikelyRefundText(text);
      return {
        date: t.date.toISOString().slice(0, 10),
        description: redact(t.description),
        merchantName: t.merchantName,
        amount: toDecimalString(t.amount)!,
        currency: t.currency,
        accountLabel: buildAccountLabel(t.account),
        categoryPath: buildCategoryPath(t.category),
        isTransfer: t.isTransfer,
        pending: t.pending,
        notes: mode === "privacy_safe" ? null : t.notes,
        incomeType: income.incomeType,
        incomeTypeConfidence: income.confidence,
        isReversal: reversal !== undefined && !isRefund,
        isRefund,
        linkedTransactionDate: reversal ? reversal.partnerDate.toISOString().slice(0, 10) : null,
        relationshipConfidence: reversal ? Math.round(reversal.confidence * 100) / 100 : null,
      };
    });

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
            spentApprox: roundMoney(progress.spent),
            remainingApprox: roundMoney(progress.remaining),
            rolledOverAmountApprox: roundMoney(progress.rolledOverAmount),
          },
        };
      })
    );

    const sinkingFundRows = await tx.sinkingFund.findMany({ where: { userId }, select: SINKING_FUND_SELECT });
    const sinkingFunds: ExportSinkingFund[] = sinkingFundRows.map((f) => ({
      name: f.name,
      categoryPath: buildCategoryPath(f.category),
      currency: f.currency,
      targetAmount: toDecimalString(f.targetAmount)!,
      currentBalance: toDecimalString(f.currentBalance)!,
      remainingAmount: toDecimalString(f.targetAmount.minus(f.currentBalance))!,
      deadlineDate: f.deadlineDate.toISOString().slice(0, 10),
      recurrence: f.recurrence,
      requiredContributionApprox: roundMoney(
        computeRequiredContribution({ targetAmount: Number(f.targetAmount), currentBalance: Number(f.currentBalance), deadlineDate: f.deadlineDate }, now, "monthly")
      ),
      isReconciled: false,
    }));
    if (sinkingFundRows.length === 0) warnings.push("No sinking funds configured -- planned future purchases funded gradually over time aren't reflected anywhere in this export.");

    const prepaidCoverageRows = await tx.prepaidCoverage.findMany({ where: { userId }, select: PREPAID_COVERAGE_SELECT });
    const prepaidCoverages: ExportPrepaidCoverage[] = await Promise.all(
      prepaidCoverageRows.map(async (p) => {
        const status = await computePrepaidCoverageProgress(userId, p.category.id, p.coverageMonths, now, tx);
        return {
          categoryPath: buildCategoryPath(p.category),
          coverageMonths: p.coverageMonths,
          paidThroughDate: status.paidThrough ? status.paidThrough.toISOString().slice(0, 10) : null,
          daysRemaining: status.daysRemaining,
          isOverdue: status.isOverdue,
          isReconciled: true,
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

    const [holdingRows, bucketAssignments, instrumentTypeOverrideRows] = await Promise.all([
      readCurrentHoldings(userId, undefined, tx),
      tx.holdingBucketAssignment.findMany({ where: { userId } }),
      tx.instrumentTypeOverride.findMany({ where: { userId } }),
    ]);
    const overridesBySymbol = new Map(bucketAssignments.map((a) => [a.symbol, a.bucketName]));
    const instrumentOverridesBySymbol = new Map(instrumentTypeOverrideRows.map((o) => [o.symbol, o.instrumentType as InstrumentType]));
    const activeHoldings = holdingRows.filter((h) => Number(h.quantity) !== 0);
    const classifyHolding = (h: (typeof activeHoldings)[number]) =>
      classifyInstrumentType({
        ibkrAssetCategory: h.securityType,
        ibkrSubCategory: h.ibkrSubCategory,
        manualOverride: instrumentOverridesBySymbol.get(h.symbol) ?? null,
      });
    const holdings: ExportHolding[] = activeHoldings.map((h) => {
      const classification = classifyHolding(h);
      return {
        accountLabel: accountLabelById.get(h.accountId) ?? "Unknown account",
        symbol: h.symbol,
        instrumentType: classification.instrumentType,
        instrumentTypeSource: classification.source,
        instrumentTypeConfidence: classification.confidence,
        ibkrAssetCategory: h.securityType,
        ibkrSubCategory: h.ibkrSubCategory,
        strategyBucket: overridesBySymbol.get(h.symbol) ?? "Unclassified",
        quantity: toDecimalString(h.quantity)!,
        avgCost: toDecimalString(h.avgCost),
        currency: h.currency,
        marketValue: toDecimalString(h.marketValue)!,
        asOfDate: h.asOfDate.toISOString().slice(0, 10),
      };
    });

    // Instrument-type allocation: Meadow's normalized classification (ETF vs.
    // stock vs. ...), never the user's strategy bucket -- see schema.ts's
    // comment on why these are kept separate dimensions.
    const bucketedByInstrumentType = activeHoldings.flatMap((h) => {
      const converted = convertCurrency(Number(h.marketValue), h.currency, defaultCurrency, currentRates);
      return converted === null ? [] : [{ bucketName: instrumentTypeLabel(classifyHolding(h).instrumentType), marketValue: converted }];
    });
    const currentAllocation = computeCurrentAllocation(bucketedByInstrumentType).map((a) => ({
      bucketName: a.bucketName,
      marketValueInDefaultCurrencyApprox: roundMoney(a.marketValue),
      currentWeightPct: roundPct(a.currentWeightPct),
    }));

    // Strategy allocation: the user's own bucket assignments, compared
    // against the user's own TargetAllocation rows -- the matching
    // dimension (see schema.ts's comment on why these were split).
    if (targetRows.length === 0) warnings.push("No portfolio strategy targets configured -- drift cannot be evaluated, only current allocation.");
    const bucketedByStrategy = activeHoldings.flatMap((h) => {
      const converted = convertCurrency(Number(h.marketValue), h.currency, defaultCurrency, currentRates);
      return converted === null ? [] : [{ bucketName: overridesBySymbol.get(h.symbol) ?? "Unclassified", marketValue: converted }];
    });
    const currentStrategyAllocation = computeCurrentAllocation(bucketedByStrategy);
    const strategyTargets = targetRows.map((t) => ({ bucketName: t.bucketName, targetWeightPct: Number(t.targetWeightPct), driftThresholdPct: Number(t.driftThresholdPct) }));
    const strategyDrift = computePortfolioDrift(currentStrategyAllocation, strategyTargets);

    // A target bucket named after a known instrument-type label with no
    // matching current strategy bucket almost always means a leftover
    // target from before instrument type and strategy bucket were split
    // into separate concepts -- flag it by name rather than silently
    // producing a confusing 100%-drift number with no explanation.
    const currentStrategyBucketNames = new Set(currentStrategyAllocation.map((a) => a.bucketName));
    const instrumentLabelSet = new Set((["stock", "etf", "fund", "bond", "cash", "crypto", "option", "other", "unknown"] as InstrumentType[]).map(instrumentTypeLabel));
    for (const target of strategyTargets) {
      if (instrumentLabelSet.has(target.bucketName) && !currentStrategyBucketNames.has(target.bucketName)) {
        warnings.push(
          `Strategy target "${target.bucketName}" looks like a leftover instrument-type label from before strategy buckets and instrument types were separate concepts -- no current holding is assigned to a strategy bucket with that name, so its drift is likely meaningless. Consider renaming/removing it and assigning holdings to real strategy buckets (e.g. Core/Satellite) on the Accounts page.`
        );
      }
    }

    const portfolioHistoryAll = await readPortfolioHistory(userId, defaultCurrency, undefined, undefined, tx);
    const portfolioHistoryRecent = portfolioHistoryAll
      .filter((row) => row.asOfDate >= recentStart)
      .map((row) => ({ asOfDate: row.asOfDate.toISOString().slice(0, 10), valueInDefaultCurrencyApprox: roundMoney(row.value), hasGap: row.value === null }));

    const mapObligation = (o: (typeof obligationRows)[number]): ExportObligation => ({
      name: o.name,
      amount: toDecimalString(o.amount)!,
      currency: o.currency,
      frequency: o.frequency,
      nextDueDate: o.nextDueDate.toISOString().slice(0, 10),
      priority: o.priority,
      fundedAmount: toDecimalString(o.fundedAmount)!,
      fundingStatus: classifyFundingStatus(Number(o.amount), Number(o.fundedAmount)),
      categoryPath: buildCategoryPath(o.category),
    });
    const obligations: ExportObligation[] = obligationRows.map(mapObligation);
    const upcomingWindowEnd = new Date(now.getTime() + UPCOMING_OBLIGATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const upcomingObligations = obligationRows
      .filter((o) => o.nextDueDate <= upcomingWindowEnd)
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
      .map(mapObligation);

    const incomeStreams: ExportIncomeStream[] = incomeStreamRows.map((s) => ({
      name: s.name,
      currency: s.currency,
      frequency: s.frequency,
      grossAmount: toDecimalString(s.grossAmount)!,
      netAmount: toDecimalString(s.netAmount),
      nextExpectedDate: s.nextExpectedDate.toISOString().slice(0, 10),
      confidence: s.confidence,
    }));

    const cashReserves: ExportCashReserve[] = cashReserveRows.map((r) => ({
      name: r.name,
      currency: r.currency,
      targetAmount: toDecimalString(r.targetAmount)!,
      minimumAmount: toDecimalString(r.minimumAmount),
      scope: r.account ? `account:${buildAccountLabel(r.account)}` : `currency:${r.currency}`,
    }));

    const cashPolicy = computeCashPolicy(accounts, computedBalances, cashReserveRows, obligationRows, now, warnings);

    const strategyTargetsOutput = targetRows.map((t) => ({ bucketName: t.bucketName, targetWeightPct: toDecimalString(t.targetWeightPct)!, driftThresholdPct: toDecimalString(t.driftThresholdPct)! }));
    const financialPlan: AiFinancialContextExport["financialPlan"] = {
      cashReserves,
      portfolioTargets: strategyTargetsOutput,
      recurringCommitments: recurringCharges
        .filter((c) => c.status !== "cancelled")
        .map((c) => ({ merchantDisplayName: c.merchantDisplayName, expectedAmount: c.expectedAmount, currency: c.currency, cadence: c.cadence })),
      upcomingObligations,
      note:
        "Meadow does not currently track a standalone monthly-investment-target or named 'emergency fund' concept -- cash reserves above are the closest available data. A dedicated financial-goals feature would need new user-facing data entry, out of scope for this export.",
    };

    const categoryRows = await tx.category.findMany({ where: { userId, isArchived: false }, select: CATEGORY_SELECT });
    const categories = categoryRows.map((c) => ({ path: buildCategoryPath(c)!, kind: c.kind, budgetType: c.budgetType }));

    const earliestSnapshotDate = netWorthHistory[0]?.asOfDate ?? null;

    return {
      schemaVersion: SCHEMA_VERSION,
      exportMode: mode,
      generatedAt: now.toISOString(),
      snapshotAsOf: now.toISOString().slice(0, 10),
      recentWindow: { startDate: recentStart.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10), months: RECENT_WINDOW_MONTHS },
      profile: { defaultCurrency, locale: appUser.locale, timezone: appUser.timezone },
      accounts: exportAccounts,
      netWorth: { current: netWorthCurrent, history: netWorthHistory },
      transactions: { recent: recentTransactions, olderMonthlySummaries },
      budgets,
      sinkingFunds,
      prepaidCoverages,
      recurringCharges,
      investments: {
        holdings,
        allocation: { current: currentAllocation },
        strategyAllocation: {
          current: currentStrategyAllocation.map((a) => ({ bucketName: a.bucketName, marketValueInDefaultCurrencyApprox: roundMoney(a.marketValue), currentWeightPct: roundPct(a.currentWeightPct) })),
          targets: strategyTargets.map((t) => ({ bucketName: t.bucketName, targetWeightPct: roundPct(t.targetWeightPct), driftThresholdPct: roundPct(t.driftThresholdPct) })),
          drift: strategyDrift.map((d) => ({ ...d, currentWeightPct: roundPct(d.currentWeightPct), targetWeightPct: roundPct(d.targetWeightPct), driftPct: roundPct(d.driftPct) })),
        },
        portfolioHistoryRecent,
      },
      obligations,
      incomeStreams,
      cashReserves,
      cashPolicy,
      financialPlan,
      categories,
      dataCoverage: {
        hasCashReserves: cashReserveRows.length > 0,
        hasObligations: obligationRows.length > 0,
        hasTargetAllocation: targetRows.length > 0,
        hasSinkingFunds: sinkingFundRows.length > 0,
        hasPrepaidCoverage: prepaidCoverageRows.length > 0,
        netWorthHistoryDays: netWorthHistory.length,
      },
      calculationWarnings: warnings,
      meta: {
        exportNote:
          "Generated by Meadow at the user's request for sharing with an external AI assistant. Balances and holdings are as of the dates shown, not real-time. Fields suffixed 'Approx' or 'InDefaultCurrency' are FX-converted and rounded for readability; every other monetary field is an exact ledger value in its native currency. incomeType/isReversal/isRefund are best-effort inferences, always paired with a confidence level -- never treat them as confirmed facts." +
          (mode === "privacy_safe"
            ? " Privacy-safe mode: transaction notes are omitted and long digit-containing reference numbers in descriptions are replaced with '[redacted]' on a best-effort basis -- this is not a guarantee every identifier was caught."
            : ""),
        knownDataGaps: [
          earliestSnapshotDate
            ? `Net worth history begins ${earliestSnapshotDate} (the date daily balance snapshots started) -- earlier trend is not available.`
            : "No net worth history is available yet -- daily balance snapshots have not run for this account.",
          "Obligation funding is manually tracked planning data, not a reconciled payment ledger.",
          "Sinking fund currentBalance is a manually-incremented running total, not derived from summing linked transactions.",
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
    totalAssetsInDefaultCurrency: roundMoney(totalAssets),
    totalLiabilitiesInDefaultCurrency: roundMoney(totalLiabilities),
    netWorthInDefaultCurrency: roundMoney(totalAssets + totalLiabilities),
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
      totalAssetsInDefaultCurrencyApprox: hasGap ? null : roundMoney(assets),
      totalLiabilitiesInDefaultCurrencyApprox: hasGap ? null : roundMoney(liabilities),
      netWorthInDefaultCurrencyApprox: hasGap ? null : roundMoney(assets + liabilities),
      hasGap,
    });
  }
  return result;
}

/**
 * The cash/investable-cash fix: a currency is "configured" only if at
 * least one CashReserve or active Obligation exists for it. An empty
 * currency gets null, never a computed full-balance guess -- that's the
 * highest-priority correctness fix in this revision (see the plan).
 */
function computeCashPolicy(
  accounts: { id: string; classification: string; currency: string; type: string }[],
  computedBalances: Awaited<ReturnType<typeof readAccountBalances>>,
  cashReserveRows: { currency: string; targetAmount: import("@finance-app/db").Prisma.Decimal }[],
  obligationRows: { currency: string; amount: import("@finance-app/db").Prisma.Decimal; fundedAmount: import("@finance-app/db").Prisma.Decimal; priority: string; nextDueDate: Date }[],
  now: Date,
  warnings: string[]
): ExportCashPolicy {
  const cashByCurrency = new Map<string, number>();
  for (const account of accounts) {
    if (account.classification === "asset" && CASH_ACCOUNT_TYPES.includes(account.type as AccountType)) {
      const balance = computedBalances.get(account.id)?.balance ?? 0;
      cashByCurrency.set(account.currency, (cashByCurrency.get(account.currency) ?? 0) + balance);
    }
  }

  const configuredCurrencies = new Set([...cashReserveRows.map((r) => r.currency), ...obligationRows.map((o) => o.currency)]);

  const uncommittedRaw = computeUncommittedCash(
    [...cashByCurrency.entries()].map(([currency, balance]) => ({ currency, balance })),
    cashReserveRows.map((r) => ({ currency: r.currency, targetAmount: Number(r.targetAmount) }))
  );
  const investableRaw = computeInvestableCash(
    uncommittedRaw,
    obligationRows.map((o) => ({ currency: o.currency, amount: Number(o.amount), fundedAmount: Number(o.fundedAmount), priority: o.priority as "mandatory" | "planned" | "discretionary", nextDueDate: o.nextDueDate, isActive: true })),
    now
  );

  const cashByCurrencyOutput: Record<string, number> = {};
  const committedCashByCurrency: Record<string, number | null> = {};
  const uncommittedCashByCurrency: Record<string, number | null> = {};
  const investableCashByCurrency: Record<string, number | null> = {};
  const notes: Record<string, string> = {};
  let calculationComplete = true;
  const incompleteCurrencies: string[] = [];

  for (const [currency, balance] of cashByCurrency) {
    cashByCurrencyOutput[currency] = roundMoney(balance);
    if (!configuredCurrencies.has(currency)) {
      committedCashByCurrency[currency] = null;
      uncommittedCashByCurrency[currency] = null;
      investableCashByCurrency[currency] = null;
      notes[currency] =
        `No cash reserves or obligations recorded for ${currency} -- investable cash cannot be determined. Treat all ${currency} cash as reserved/unavailable until obligations or reserves are entered.`;
      calculationComplete = false;
      incompleteCurrencies.push(currency);
    } else {
      const uncommitted = uncommittedRaw[currency] ?? balance;
      const investable = investableRaw[currency] ?? uncommitted;
      committedCashByCurrency[currency] = roundMoney(balance - uncommitted);
      uncommittedCashByCurrency[currency] = roundMoney(uncommitted);
      investableCashByCurrency[currency] = roundMoney(investable);
    }
  }

  if (incompleteCurrencies.length > 0) {
    warnings.push(`Cash policy could not be fully calculated for: ${incompleteCurrencies.join(", ")} -- no reserves or obligations recorded for that currency.`);
  }

  return {
    cashByCurrency: cashByCurrencyOutput,
    committedCashByCurrency,
    uncommittedCashByCurrency,
    investableCashByCurrency,
    calculationComplete,
    notes,
  };
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
