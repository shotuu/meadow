import { describe, expect, it } from "vitest";
import { netSpendByCategory, summarizeSpendByCategory } from "../spend";

describe("summarizeSpendByCategory", () => {
  it("returns an empty array for empty input", () => {
    expect(summarizeSpendByCategory([])).toEqual([]);
  });

  it("returns no Other bucket when fewer than topN categories", () => {
    const result = summarizeSpendByCategory(
      [
        { categoryId: "a", categoryName: "Groceries", amount: 300 },
        { categoryId: "b", categoryName: "Rent", amount: 1200 },
      ],
      4
    );
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.categoryId)).not.toContain("__other__");
    expect(result[0]).toMatchObject({ categoryId: "b", amount: 1200 });
    expect(result[1]).toMatchObject({ categoryId: "a", amount: 300 });
  });

  it("returns no Other bucket when exactly topN categories", () => {
    const result = summarizeSpendByCategory(
      [
        { categoryId: "a", categoryName: "Groceries", amount: 100 },
        { categoryId: "b", categoryName: "Rent", amount: 200 },
        { categoryId: "c", categoryName: "Dining", amount: 50 },
        { categoryId: "d", categoryName: "Gas", amount: 75 },
      ],
      4
    );
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.categoryId)).not.toContain("__other__");
  });

  it("folds categories past topN into a single Other bucket, sorted last isn't assumed", () => {
    const result = summarizeSpendByCategory(
      [
        { categoryId: "a", categoryName: "Rent", amount: 1000 },
        { categoryId: "b", categoryName: "Groceries", amount: 300 },
        { categoryId: "c", categoryName: "Dining", amount: 150 },
        { categoryId: "d", categoryName: "Gas", amount: 100 },
        { categoryId: "e", categoryName: "Subscriptions", amount: 50 },
        { categoryId: "f", categoryName: "Coffee", amount: 20 },
      ],
      4
    );
    expect(result).toHaveLength(5);
    const other = result.find((r) => r.categoryId === "__other__");
    expect(other).toBeDefined();
    expect(other?.categoryName).toBe("Other");
    expect(other?.amount).toBe(70); // 50 (Subscriptions) + 20 (Coffee)
  });

  it("groups multiple rows with the same categoryId before ranking", () => {
    const result = summarizeSpendByCategory(
      [
        { categoryId: "a", categoryName: "Groceries", amount: 40 },
        { categoryId: "a", categoryName: "Groceries", amount: 60 },
        { categoryId: "b", categoryName: "Rent", amount: 90 },
      ],
      4
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ categoryId: "a", amount: 100 });
  });

  it("computes percent of total across all buckets, including Other", () => {
    const result = summarizeSpendByCategory(
      [
        { categoryId: "a", categoryName: "Rent", amount: 75 },
        { categoryId: "b", categoryName: "Groceries", amount: 15 },
        { categoryId: "c", categoryName: "Dining", amount: 10 },
      ],
      2
    );
    const total = result.reduce((sum, r) => sum + r.percent, 0);
    expect(total).toBeCloseTo(100, 5);
  });
});

describe("netSpendByCategory", () => {
  it("nets a refund against its own category instead of adding to spend", () => {
    // A $2904.13 charge followed by a $395.06 partial refund/credit should
    // read as ~$2509.07 of net spend, not $3299.19 (summing abs(amount) per
    // transaction before netting double-counts the refund as extra spend).
    const result = netSpendByCategory([
      { categoryId: "a", categoryName: "Car Insurance", amount: -2904.13 },
      { categoryId: "a", categoryName: "Car Insurance", amount: 395.06 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBeCloseTo(2509.07, 2);
  });

  it("keeps categories separate", () => {
    const result = netSpendByCategory([
      { categoryId: "a", categoryName: "Groceries", amount: -100 },
      { categoryId: "b", categoryName: "Rent", amount: -1200 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.categoryId === "a")?.amount).toBe(100);
    expect(result.find((r) => r.categoryId === "b")?.amount).toBe(1200);
  });

  it("returns a positive magnitude even when refunds exceed spend in the period", () => {
    const result = netSpendByCategory([
      { categoryId: "a", categoryName: "Travel", amount: -50 },
      { categoryId: "a", categoryName: "Travel", amount: 200 },
    ]);
    expect(result[0].amount).toBe(150);
  });
});
