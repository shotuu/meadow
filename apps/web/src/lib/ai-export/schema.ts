export const SCHEMA_VERSION = 1;

/**
 * The "AI Financial Context" export -- a JSON snapshot of the user's
 * financial picture, generated on demand for the user to hand to an
 * external AI tool of their choosing (see Settings). Every monetary field
 * is documented as either exact (a Decimal.toString(), safe to trust to
 * the last digit) or approximate (FX-converted and/or rounded, suffixed
 * "InDefaultCurrency"/"Approx" -- never mix the two under one unqualified
 * key name). No internal database ids, no provider/auth credentials: every
 * cross-reference is a human-readable label, not a foreign key.
 */
export interface AiFinancialContextExport {
  schemaVersion: typeof SCHEMA_VERSION;
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
  recurringCharges: ExportRecurringCharge[];

  investments: {
    holdings: ExportHolding[];
    allocation: {
      current: { bucketName: string; marketValueInDefaultCurrencyApprox: number; currentWeightPct: number }[];
      targets: { bucketName: string; targetWeightPct: string; driftThresholdPct: string }[];
      drift: { bucketName: string; currentWeightPct: number; targetWeightPct: number; driftPct: number; isDrifted: boolean }[];
    };
    portfolioHistoryRecent: { asOfDate: string; valueInDefaultCurrencyApprox: number | null; hasGap: boolean }[];
  };

  obligations: ExportObligation[];
  incomeStreams: ExportIncomeStream[];
  cashReserves: ExportCashReserve[];
  cashPolicy: { uncommittedCashByCurrency: Record<string, number>; investableCashByCurrency: Record<string, number> };

  categories: { path: string; kind: string; budgetType: string }[];

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
  securityType: string;
  quantity: string;
  avgCost: string | null;
  currency: string;
  marketValue: string;
  asOfDate: string;
  bucketName: string;
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
