export interface SpendByCategoryRow {
  categoryId: string;
  categoryName: string;
  amount: number;
}

export interface SignedTransactionRow {
  categoryId: string;
  categoryName: string;
  /** Signed: negative = money out, positive = a refund/credit back. */
  amount: number;
}

/**
 * Nets signed per-transaction amounts within each category before taking a
 * magnitude, so a refund/credit offsets its own category's spend instead of
 * adding to it (summing abs(amount) per transaction first would count a
 * refund as additional spend rather than money back). Feed the result into
 * summarizeSpendByCategory for top-N ranking.
 */
export function netSpendByCategory(rows: SignedTransactionRow[]): SpendByCategoryRow[] {
  const byCategory = new Map<string, { categoryName: string; amount: number }>();
  for (const row of rows) {
    const existing = byCategory.get(row.categoryId);
    if (existing) existing.amount += row.amount;
    else byCategory.set(row.categoryId, { categoryName: row.categoryName, amount: row.amount });
  }
  return [...byCategory.entries()].map(([categoryId, v]) => ({
    categoryId,
    categoryName: v.categoryName,
    amount: Math.abs(v.amount),
  }));
}

export interface SpendByCategoryBucket extends SpendByCategoryRow {
  percent: number;
}

const OTHER_CATEGORY_ID = "__other__";

/**
 * Groups per-transaction rows by category, sorts descending by amount, and
 * folds anything past topN into a single "Other" bucket — never generates a
 * new categorical color slot beyond the fixed chart-1..N palette.
 */
export function summarizeSpendByCategory(rows: SpendByCategoryRow[], topN = 4): SpendByCategoryBucket[] {
  const byCategory = new Map<string, { categoryName: string; amount: number }>();
  for (const row of rows) {
    const existing = byCategory.get(row.categoryId);
    if (existing) existing.amount += row.amount;
    else byCategory.set(row.categoryId, { categoryName: row.categoryName, amount: row.amount });
  }

  const sorted = [...byCategory.entries()]
    .map(([categoryId, v]) => ({ categoryId, categoryName: v.categoryName, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  const total = sorted.reduce((sum, r) => sum + r.amount, 0);
  if (total === 0) return [];

  const buckets: SpendByCategoryRow[] = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  if (rest.length > 0) {
    buckets.push({
      categoryId: OTHER_CATEGORY_ID,
      categoryName: "Other",
      amount: rest.reduce((sum, r) => sum + r.amount, 0),
    });
  }

  return buckets.map((b) => ({ ...b, percent: (b.amount / total) * 100 }));
}
