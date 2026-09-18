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

import { stripAccountNumberSuffix } from "./redact";

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

/** JSON-encoded tuple, not a delimited string -- avoids any ambiguity between e.g. institutionName "A" + name "B C" and institutionName "A B" + name "C". */
function accountNameKey(account: { name: string; institutionName?: string | null }): string {
  return JSON.stringify([account.institutionName ?? null, account.name]);
}

export interface AccountLabelResolver {
  /** For data fetched with the account's real id (accounts, investment holdings). */
  byId(accountId: string): string;
  /** For data whose account relation was selected down to name/institutionName only (transactions, cash reserves) -- see TRANSACTION_SELECT/CASH_RESERVE_SELECT. */
  byNameKey(account: { name: string; institutionName?: string | null }): string;
}

/**
 * Builds every account's display label for one export in a single pass, so
 * privacy_safe mode can deterministically disambiguate two accounts that
 * become identical once their account-number suffix is stripped (e.g. two
 * "Chase — Checking" accounts that were "Chase — Checking 3106" and "Chase
 * — Checking 8842" before stripping) as "Chase — Checking 1" / "...2" --
 * never the real last-four, per the privacy_safe account-label
 * requirement. In standard mode, labels are just buildAccountLabel as
 * before (no stripping, so collisions of this kind essentially don't
 * happen since real account names already differ).
 */
export function buildAccountLabelResolver(
  accounts: { id: string; name: string; institutionName: string | null }[],
  privacySafe: boolean
): AccountLabelResolver {
  const rows = accounts.map((a) => ({
    id: a.id,
    key: accountNameKey(a),
    label: buildAccountLabel({ name: privacySafe ? stripAccountNumberSuffix(a.name) : a.name, institutionName: a.institutionName }),
  }));

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.label, (counts.get(r.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  const byId = new Map<string, string>();
  const byKey = new Map<string, string>();
  for (const r of rows) {
    let finalLabel = r.label;
    if (privacySafe && (counts.get(r.label) ?? 0) > 1) {
      const n = (seen.get(r.label) ?? 0) + 1;
      seen.set(r.label, n);
      finalLabel = `${r.label} ${n}`;
    }
    byId.set(r.id, finalLabel);
    byKey.set(r.key, finalLabel);
  }

  return {
    byId: (accountId) => byId.get(accountId) ?? "Unknown account",
    byNameKey: (account) => byKey.get(accountNameKey(account)) ?? buildAccountLabel(account),
  };
}
