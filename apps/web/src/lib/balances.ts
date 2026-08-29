export interface ClassificationSummary {
  assets: number;
  liabilities: number;
}

export function summarizeByClassification(
  rows: { classification: "asset" | "liability"; currency: string; balance: number }[]
): Map<string, ClassificationSummary> {
  const byCurrency = new Map<string, ClassificationSummary>();
  for (const row of rows) {
    const bucket = byCurrency.get(row.currency) ?? { assets: 0, liabilities: 0 };
    if (row.classification === "asset") bucket.assets += row.balance;
    else bucket.liabilities += row.balance;
    byCurrency.set(row.currency, bucket);
  }
  return byCurrency;
}
