import { describe, expect, it } from "vitest";
import {
  bucketLabelForSecurityType,
  computeCurrentAllocation,
  computePortfolioDrift,
  latestHoldingsBySymbol,
  resolveBucketName,
} from "../allocation";

describe("bucketLabelForSecurityType", () => {
  it("maps known IBKR asset categories to friendly labels", () => {
    expect(bucketLabelForSecurityType("STK")).toBe("Stocks");
    expect(bucketLabelForSecurityType("BOND")).toBe("Bonds");
    expect(bucketLabelForSecurityType("CASH")).toBe("Cash");
  });

  it("is case-insensitive on the input", () => {
    expect(bucketLabelForSecurityType("stk")).toBe("Stocks");
  });

  it("falls back to a title-cased version of an unrecognized code", () => {
    expect(bucketLabelForSecurityType("XYZ")).toBe("Xyz");
  });
});

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

describe("resolveBucketName", () => {
  it("prefers the user's bucket assignment when one exists for the symbol", () => {
    const overrides = new Map([["IMID", "Core"]]);
    expect(resolveBucketName("IMID", "STK", overrides)).toBe("Core");
  });

  it("falls back to the security-type-derived label when no assignment exists", () => {
    const overrides = new Map([["IMID", "Core"]]);
    expect(resolveBucketName("AMD", "STK", overrides)).toBe("Stocks");
  });

  it("falls back correctly with an empty overrides map", () => {
    expect(resolveBucketName("AMD", "STK", new Map())).toBe("Stocks");
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
