export const SCHEMA_VERSION = 2;

export type ExportMode = "standard" | "privacy_safe";

/**
 * The "AI Financial Context" export -- a JSON snapshot of the user's
 * financial picture, generated on demand for the user to hand to an
 * external AI tool of their choosing (see Settings). Every monetary field
 * is documented as either exact (a Decimal.toString(), safe to trust to
 * the last digit) or approximate (FX-converted and/or rounded, suffixed
 * "InDefaultCurrency"/"Approx" -- never mix the two under one unqualified
 * key name). No internal database ids, no provider/auth credentials: every
 * cross-reference is a human-readable label, not a foreign key.
 *
 * v2: separates instrument type from user-defined strategy bucket, fixes
 * cashPolicy to report null (not a misleading number) when nothing is
 * configured, adds financialPlan/sinkingFunds/prepaidCoverages, adds
 * best-effort income-type and transaction-relationship tagging (always
 * confidence-qualified, never asserted as fact), and a privacy_safe export
 * mode. See ARCHITECTURE_FIXES.md and the AI-export-v2 plan for rationale.
 */
export interface AiFinancialContextExport {
  schemaVersion: typeof SCHEMA_VERSION;
  exportMode: ExportMode;
  generatedAt: string;
  snapshotAsOf: string;
  recentWindow: { startDate: string; endDate: string; months: number };
  profile: { defaultCurrency: string; locale: string; timezone: string };

  accounts: ExportAccount[];
  netWorth: {
    current: { totalAssetsInDefaultCurrency: number | null; totalLiabilitiesInDefaultCurrency: number | null; netWorthInDefaultCurrency: number | null };
    history: ExportNetWorthSnapshot[];
  };

  transactions: {
    recent: ExportTransaction[];
    olderMonthlySummaries: ExportMonthlyCategorySummary[];
  };

  budgets: ExportBudget[];
  sinkingFunds: ExportSinkingFund[];
  prepaidCoverages: ExportPrepaidCoverage[];
  recurringCharges: ExportRecurringCharge[];

  investments: {
    holdings: ExportHolding[];
    /**
     * Instrument-type-based grouping (STK/BOND/CASH/etc, from the
     * provider's own data). No targets/drift here -- TargetAllocation rows
     * are always strategy-bucket-named (e.g. "core"), so comparing them
     * against instrument-type weights would silently show meaningless
     * drift. Target comparison lives on strategyAllocation below, the
     * matching dimension.
     */
    allocation: {
      current: { bucketName: string; marketValueInDefaultCurrencyApprox: number; currentWeightPct: number }[];
    };
    /** Strategy-bucket-based grouping (user-defined, e.g. "core"/"satellite") -- answers "how far from my target?" and "how concentrated?" */
    strategyAllocation: {
      current: { bucketName: string; marketValueInDefaultCurrencyApprox: number; currentWeightPct: number }[];
      targets: { bucketName: string; targetWeightPct: number; driftThresholdPct: number }[];
      drift: { bucketName: string; currentWeightPct: number; targetWeightPct: number; driftPct: number; isDrifted: boolean }[];
    };
    portfolioHistoryRecent: { asOfDate: string; valueInDefaultCurrencyApprox: number | null; hasGap: boolean }[];
  };

  obligations: ExportObligation[];
  incomeStreams: ExportIncomeStream[];
  cashReserves: ExportCashReserve[];
  cashPolicy: ExportCashPolicy;

  /** A curated cross-reference of policy-layer data already itemized elsewhere -- not a new data source, just gathered in one place. */
  financialPlan: {
    cashReserves: ExportCashReserve[];
    portfolioTargets: { bucketName: string; targetWeightPct: string; driftThresholdPct: string }[];
    recurringCommitments: { merchantDisplayName: string; expectedAmount: string; currency: string; cadence: string }[];
    upcomingObligations: ExportObligation[];
    note: string;
  };

  categories: { path: string; kind: string; budgetType: string }[];

  dataCoverage: {
    hasCashReserves: boolean;
    hasObligations: boolean;
    hasTargetAllocation: boolean;
    hasSinkingFunds: boolean;
    hasPrepaidCoverage: boolean;
    netWorthHistoryDays: number;
  };
  calculationWarnings: string[];

  meta: {
    exportNote: string;
    knownDataGaps: string[];
  };
}

export interface ExportAccount {
  label: string;
  institutionName: string | null;
  type: string;
  classification: string;
  currency: string;
  syncSource: string;
  balance: { amount: string | null; currency: string; asOfDate: string | null; method: string; isComplete: boolean };
  balanceInDefaultCurrencyApprox: number | null;
  caveat: string | null;
}

export interface ExportNetWorthSnapshot {
  asOfDate: string;
  totalAssetsInDefaultCurrencyApprox: number | null;
  totalLiabilitiesInDefaultCurrencyApprox: number | null;
  netWorthInDefaultCurrencyApprox: number | null;
  /** true if a rate was missing for some account on this day -- the totals above are null rather than a silently-wrong partial sum. */
  hasGap: boolean;
}

export type IncomeType =
  | "employment_wages"
  | "scholarship_allowance"
  | "reimbursement"
  | "refund"
  | "transfer"
  | "investment_income"
  | "gift"
  | "other";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ExportTransaction {
  date: string;
  description: string;
  merchantName: string | null;
  amount: string;
  currency: string;
  accountLabel: string;
  categoryPath: string | null;
  isTransfer: boolean;
  pending: boolean;
  notes: string | null;
  /** Best-effort semantic classification for positive (incoming) amounts only -- always confidence-qualified, never asserted as fact. */
  incomeType: IncomeType | null;
  incomeTypeConfidence: ConfidenceLevel | null;
  /** A same-account, opposite-sign, short-window match found by the same pairing algorithm the app uses for transfer detection -- read-only, never persisted, never invented when no match is found. */
  isReversal: boolean;
  isRefund: boolean;
  linkedTransactionDate: string | null;
  relationshipConfidence: number | null;
}

export interface ExportMonthlyCategorySummary {
  month: string;
  categoryPath: string | null;
  totalsByCurrency: Record<string, string>;
}

export interface ExportBudget {
  categoryPath: string;
  budgetType: string;
  period: string;
  amount: string;
  currency: string;
  rolloverEnabled: boolean;
  rolloverCap: string | null;
  effectiveFrom: string;
  currentPeriod: { periodStart: string; periodEnd: string; spentApprox: number; remainingApprox: number; rolledOverAmountApprox: number } | null;
}

export interface ExportSinkingFund {
  name: string;
  categoryPath: string | null;
  currency: string;
  targetAmount: string;
  currentBalance: string;
  remainingAmount: string;
  deadlineDate: string;
  recurrence: string;
  requiredContributionApprox: number;
  /** false: currentBalance is a manually-incremented running total, not derived from summing linked transactions. */
  isReconciled: false;
}

export interface ExportPrepaidCoverage {
  categoryPath: string | null;
  coverageMonths: number;
  paidThroughDate: string | null;
  daysRemaining: number | null;
  isOverdue: boolean;
  /** true: computed live from the most recent real charge, not a cached/manual figure. */
  isReconciled: true;
}

export interface ExportRecurringCharge {
  merchantDisplayName: string;
  categoryPath: string | null;
  cadence: string;
  expectedAmount: string;
  currency: string;
  status: string;
  lastSeenDate: string;
  nextExpectedDate: string | null;
  confidenceScore: string;
}

export interface ExportHolding {
  accountLabel: string;
  symbol: string;
  /** The provider's own asset-category (STK/BOND/CASH/etc) -- a fact, not a strategy judgment. */
  instrumentType: string;
  /** User-defined via bucket assignment; "Unclassified" when the user hasn't set one -- never silently defaults to instrumentType. */
  strategyBucket: string;
  quantity: string;
  avgCost: string | null;
  currency: string;
  marketValue: string;
  asOfDate: string;
}

export interface ExportObligation {
  name: string;
  amount: string;
  currency: string;
  frequency: string;
  nextDueDate: string;
  priority: string;
  fundedAmount: string;
  fundingStatus: string;
  categoryPath: string | null;
}

export interface ExportIncomeStream {
  name: string;
  currency: string;
  frequency: string;
  grossAmount: string;
  netAmount: string | null;
  nextExpectedDate: string;
  confidence: string;
}

export interface ExportCashReserve {
  name: string;
  currency: string;
  targetAmount: string;
  minimumAmount: string | null;
  scope: string;
}

export interface ExportCashPolicy {
  /** Always known -- sum of checking/savings/cash account balances, no interpretation applied. */
  cashByCurrency: Record<string, number>;
  /** null for a currency with no reserves or obligations configured -- never a computed guess. */
  committedCashByCurrency: Record<string, number | null>;
  uncommittedCashByCurrency: Record<string, number | null>;
  investableCashByCurrency: Record<string, number | null>;
  /** true only if every currency in cashByCurrency has at least one reserve or obligation recorded. */
  calculationComplete: boolean;
  /** Per-currency explanation, always present when that currency's values are null. */
  notes: Record<string, string>;
}
