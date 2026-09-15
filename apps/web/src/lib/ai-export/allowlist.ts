/**
 * Explicit per-model Prisma `select` clauses for the AI Financial Context
 * export. The `select` clause IS the allowlist -- an excluded field (every
 * internal cuid id/FK, external provider ids, encrypted credentials) is
 * never fetched from Postgres at all, not filtered out after the fact.
 *
 * Some data (accounts, investment holdings) is instead fetched as full
 * rows via existing packages/finance-data readers, because those readers
 * need internal fields (account.id, currentBalance, etc.) to compute a
 * balance. For those, build-export.ts maps the full row to an allowlisted
 * output shape at the very end -- the full row itself never appears in
 * the export.
 */

export const TRANSACTION_SELECT = {
  date: true,
  description: true,
  merchantName: true,
  amount: true,
  currency: true,
  isTransfer: true,
  pending: true,
  notes: true,
  category: { select: { name: true, parentCategory: { select: { name: true } } } },
  account: { select: { name: true, institutionName: true } },
} as const;

export const CATEGORY_SELECT = {
  name: true,
  kind: true,
  budgetType: true,
  parentCategory: { select: { name: true } },
} as const;

export const BUDGET_SELECT = {
  amount: true,
  currency: true,
  period: true,
  rolloverEnabled: true,
  rolloverCap: true,
  effectiveFrom: true,
  // category.id is selected only so computeRecurringBudgetProgress (which
  // needs Pick<Category, "id" | "budgetType">) can be called -- build-export.ts
  // never puts it in the output, only categoryPath/budgetType.
  category: { select: { id: true, budgetType: true, name: true, parentCategory: { select: { name: true } } } },
} as const;

export const RECURRING_SERIES_SELECT = {
  merchantKey: true,
  cadence: true,
  expectedAmount: true,
  currency: true,
  lastSeenDate: true,
  nextExpectedDate: true,
  status: true,
  confidenceScore: true,
  category: { select: { name: true, parentCategory: { select: { name: true } } } },
  transactions: { take: 1, select: { transaction: { select: { merchantName: true } } } },
} as const;

export const TARGET_ALLOCATION_SELECT = {
  bucketName: true,
  targetWeightPct: true,
  driftThresholdPct: true,
} as const;

export const OBLIGATION_SELECT = {
  name: true,
  amount: true,
  currency: true,
  frequency: true,
  nextDueDate: true,
  priority: true,
  fundedAmount: true,
  category: { select: { name: true, parentCategory: { select: { name: true } } } },
} as const;

export const INCOME_STREAM_SELECT = {
  name: true,
  currency: true,
  frequency: true,
  grossAmount: true,
  netAmount: true,
  nextExpectedDate: true,
  confidence: true,
} as const;

export const CASH_RESERVE_SELECT = {
  name: true,
  currency: true,
  targetAmount: true,
  minimumAmount: true,
  account: { select: { name: true, institutionName: true } },
} as const;

export const SINKING_FUND_SELECT = {
  name: true,
  currency: true,
  targetAmount: true,
  currentBalance: true,
  deadlineDate: true,
  recurrence: true,
  category: { select: { name: true, parentCategory: { select: { name: true } } } },
} as const;

export const PREPAID_COVERAGE_SELECT = {
  coverageMonths: true,
  // category.id is selected only so computePrepaidCoverageProgress (which
  // needs a categoryId) can be called -- build-export.ts never puts it in
  // the output, only categoryPath.
  category: { select: { id: true, name: true, parentCategory: { select: { name: true } } } },
} as const;

/** "Housing > Rent", or null for an uncategorized row. */
export function buildCategoryPath(category: { name: string; parentCategory: { name: string } | null } | null): string | null {
  if (!category) return null;
  return category.parentCategory ? `${category.parentCategory.name} > ${category.name}` : category.name;
}

/** "Chase — Checking", falling back to "Manual" when there's no institution. */
export function buildAccountLabel(account: { name: string; institutionName?: string | null }): string {
  return `${account.institutionName ?? "Manual"} — ${account.name}`;
}
