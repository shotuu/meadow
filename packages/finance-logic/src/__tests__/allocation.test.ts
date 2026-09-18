import { describe, expect, it } from "vitest";
import {
  activeStrategyBucketNames,
  computeCurrentAllocation,
  computePortfolioDrift,
  latestHoldingsBySymbol,
  partitionStrategyTargets,
  resolveStrategyBucketName,
  splitInvestedFromBrokerageCash,
} from "../allocation";

describe("computeCurrentAllocation", () => {
  it("groups by bucket and computes % of total", () => {
    const result = computeCurrentAllocation([
      { bucketName: "Stocks", marketValue: 300 },
      { bucketName: "Stocks", marketValue: 200 },
      { bucketName: "Bonds", marketValue: 500 },
    ]);
    expect(result).toHaveLength(2);
    const stocks = result.find((b) => b.bucketName === "Stocks")!;
    const bonds = result.find((b) => b.bucketName === "Bonds")!;
    expect(stocks.marketValue).toBe(500);
    expect(stocks.currentWeightPct).toBeCloseTo(50, 5);
    expect(bonds.currentWeightPct).toBeCloseTo(50, 5);
  });

  it("returns an empty array for no holdings", () => {
    expect(computeCurrentAllocation([])).toEqual([]);
  });

  it("does not divide by zero when total value is zero", () => {
    const result = computeCurrentAllocation([{ bucketName: "Cash", marketValue: 0 }]);
    expect(result[0].currentWeightPct).toBe(0);
  });
});

describe("computePortfolioDrift", () => {
  it("reports no drift when current matches target within threshold", () => {
    const result = computePortfolioDrift(
      [{ bucketName: "Stocks", marketValue: 600, currentWeightPct: 60 }],
      [{ bucketName: "Stocks", targetWeightPct: 60, driftThresholdPct: 5 }]
    );
    expect(result[0].isDrifted).toBe(false);
    expect(result[0].driftPct).toBe(0);
  });

  it("flags drift once it exceeds the threshold", () => {
    const result = computePortfolioDrift(
      [{ bucketName: "Stocks", marketValue: 800, currentWeightPct: 80 }],
      [{ bucketName: "Stocks", targetWeightPct: 60, driftThresholdPct: 5 }]
    );
    expect(result[0].driftPct).toBe(20);
    expect(result[0].isDrifted).toBe(true);
  });

  it("evaluates a target bucket at 0% when the user holds none of it", () => {
    const result = computePortfolioDrift(
      [{ bucketName: "Stocks", marketValue: 1000, currentWeightPct: 100 }],
      [{ bucketName: "Bonds", targetWeightPct: 20, driftThresholdPct: 5 }]
    );
    expect(result[0].currentWeightPct).toBe(0);
    expect(result[0].driftPct).toBe(-20);
    expect(result[0].isDrifted).toBe(true);
  });

  it("ignores a currently-held bucket that has no target configured", () => {
    const result = computePortfolioDrift(
      [
        { bucketName: "Stocks", marketValue: 800, currentWeightPct: 80 },
        { bucketName: "Crypto", marketValue: 200, currentWeightPct: 20 },
      ],
      [{ bucketName: "Stocks", targetWeightPct: 80, driftThresholdPct: 5 }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].bucketName).toBe("Stocks");
  });
});

describe("resolveStrategyBucketName", () => {
  it("prefers the user's bucket assignment when one exists for the symbol", () => {
    const overrides = new Map([["IMID", "Core"]]);
    expect(resolveStrategyBucketName("IMID", overrides)).toBe("Core");
  });

  it("falls back to Unclassified when no assignment exists -- never an instrument-type label", () => {
    const overrides = new Map([["IMID", "Core"]]);
    expect(resolveStrategyBucketName("AMD", overrides)).toBe("Unclassified");
  });

  it("falls back correctly with an empty overrides map", () => {
    expect(resolveStrategyBucketName("AMD", new Map())).toBe("Unclassified");
  });
});

describe("splitInvestedFromBrokerageCash", () => {
  it("excludes cash holdings from the invested list and sums them separately", () => {
    const result = splitInvestedFromBrokerageCash([
      { bucketName: "Core", marketValue: 800, instrumentType: "etf" },
      { bucketName: "Satellite", marketValue: 200, instrumentType: "stock" },
      { bucketName: "Unclassified", marketValue: 300, instrumentType: "cash" },
    ]);
    expect(result.invested).toEqual([
      { bucketName: "Core", marketValue: 800 },
      { bucketName: "Satellite", marketValue: 200 },
    ]);
    expect(result.brokerageCash).toBe(300);
  });

  it("sums multiple cash holdings across accounts", () => {
    const result = splitInvestedFromBrokerageCash([
      { bucketName: "Unclassified", marketValue: 100, instrumentType: "cash" },
      { bucketName: "Unclassified", marketValue: 50, instrumentType: "cash" },
    ]);
    expect(result.invested).toEqual([]);
    expect(result.brokerageCash).toBe(150);
  });

  it("renormalizes invested weights correctly once cash is excluded from the denominator", () => {
    const { invested } = splitInvestedFromBrokerageCash([
      { bucketName: "Core", marketValue: 900, instrumentType: "etf" },
      { bucketName: "Core", marketValue: 1000, instrumentType: "cash" },
    ]);
    const current = computeCurrentAllocation(invested);
    expect(current).toEqual([{ bucketName: "Core", marketValue: 900, currentWeightPct: 100 }]);
  });

  it("returns zero brokerage cash and every holding invested when nothing is cash", () => {
    const result = splitInvestedFromBrokerageCash([{ bucketName: "Core", marketValue: 500, instrumentType: "stock" }]);
    expect(result.brokerageCash).toBe(0);
    expect(result.invested).toHaveLength(1);
  });
});

describe("activeStrategyBucketNames", () => {
  it("collects bucket names from non-cash holdings only", () => {
    const result = activeStrategyBucketNames([
      { bucketName: "Core", instrumentType: "etf" },
      { bucketName: "Satellite", instrumentType: "stock" },
      { bucketName: "Unclassified", instrumentType: "cash" },
    ]);
    expect(result).toEqual(new Set(["Core", "Satellite"]));
  });

  it("returns an empty set for no holdings", () => {
    expect(activeStrategyBucketNames([])).toEqual(new Set());
  });

  it("returns an empty set when every holding is cash", () => {
    expect(activeStrategyBucketNames([{ bucketName: "Unclassified", instrumentType: "cash" }])).toEqual(new Set());
  });
});

describe("partitionStrategyTargets", () => {
  it("separates a legacy instrument-type-label target from real strategy buckets", () => {
    const targets = [
      { bucketName: "Stocks", targetWeightPct: 100, driftThresholdPct: 5 },
      { bucketName: "Core", targetWeightPct: 90, driftThresholdPct: 5 },
      { bucketName: "Satellite", targetWeightPct: 10, driftThresholdPct: 5 },
    ];
    const result = partitionStrategyTargets(targets, new Set(["Core", "Satellite"]));
    expect(result.active.map((t) => t.bucketName)).toEqual(["Core", "Satellite"]);
    expect(result.legacy.map((t) => t.bucketName)).toEqual(["Stocks"]);
    expect(result.active.reduce((sum, t) => sum + t.targetWeightPct, 0)).toBe(100);
  });

  it("keeps a custom bucket literally named after an instrument-type label when it's genuinely in use", () => {
    // A user-chosen strategy bucket happens to be named "Bonds" and the
    // user actually holds something assigned to it -- must not be treated
    // as legacy just because the name collides with an instrument-type label.
    const targets = [{ bucketName: "Bonds", targetWeightPct: 100, driftThresholdPct: 5 }];
    const result = partitionStrategyTargets(targets, new Set(["Bonds"]));
    expect(result.active).toEqual(targets);
    expect(result.legacy).toEqual([]);
  });

  it("treats every target as active when no target is a legacy instrument-type label", () => {
    const targets = [
      { bucketName: "Growth", targetWeightPct: 70, driftThresholdPct: 5 },
      { bucketName: "Income", targetWeightPct: 30, driftThresholdPct: 5 },
    ];
    const result = partitionStrategyTargets(targets, new Set(["Growth", "Income"]));
    expect(result.active).toEqual(targets);
    expect(result.legacy).toEqual([]);
  });
});

describe("latestHoldingsBySymbol", () => {
  it("excludes symbols missing from the latest complete account report", () => {
    const result = latestHoldingsBySymbol([
      { accountId: "a1", symbol: "AAPL", asOfDate: new Date("2026-01-01"), marketValue: 100 },
      { accountId: "a1", symbol: "AAPL", asOfDate: new Date("2026-02-01"), marketValue: 150 },
      { accountId: "a1", symbol: "MSFT", asOfDate: new Date("2026-01-15"), marketValue: 200 },
    ]);
    expect(result).toHaveLength(1);
    const aapl = result.find((r) => r.symbol === "AAPL")!;
    expect(aapl.marketValue).toBe(150);
  });

  it("treats the same symbol in different accounts as separate entries", () => {
    const result = latestHoldingsBySymbol([
      { accountId: "a1", symbol: "AAPL", asOfDate: new Date("2026-01-01"), marketValue: 100 },
      { accountId: "a2", symbol: "AAPL", asOfDate: new Date("2026-01-01"), marketValue: 50 },
    ]);
    expect(result).toHaveLength(2);
  });
});
