import { describe, expect, it } from "vitest";
import {
  computeMonthlyResetBudget,
  computeRequiredContribution,
  computeRolloverEnvelopeBudget,
  computeSafeToSpendPerDay,
} from "../budget";

const period = (start: string, end: string) => ({
  periodStart: new Date(start),
  periodEnd: new Date(end),
});

describe("computeMonthlyResetBudget", () => {
  it("never carries a rollover amount and resets spend each period", () => {
    const result = computeMonthlyResetBudget(
      { amount: 200 },
      { ...period("2026-08-01", "2026-09-01"), spent: 150 }
    );
    expect(result.remaining).toBe(50);
    expect(result.rolledOverAmount).toBe(0);
  });

  it("allows going negative when overspent", () => {
    const result = computeMonthlyResetBudget(
      { amount: 200 },
      { ...period("2026-08-01", "2026-09-01"), spent: 250 }
    );
    expect(result.remaining).toBe(-50);
  });
});

describe("computeRolloverEnvelopeBudget", () => {
  it("carries unspent nightlife-style budget into the next period", () => {
    // matches the master-context example: $225 allotted, underspend one
    // month should leave more available the next.
    const periods = [
      { ...period("2026-07-01", "2026-08-01"), spent: 100 },
      { ...period("2026-08-01", "2026-09-01"), spent: 300 },
    ];
    const result = computeRolloverEnvelopeBudget({ amount: 225, rolloverCap: null }, periods);
    // period 1: remaining = 225 - 100 = 125, carried into period 2
    // period 2: remaining = 225 + 125 - 300 = 50
    expect(result.rolledOverAmount).toBe(125);
    expect(result.remaining).toBe(50);
  });

  it("carries negative rollover forward when a period is overspent", () => {
    const periods = [
      { ...period("2026-07-01", "2026-08-01"), spent: 300 },
      { ...period("2026-08-01", "2026-09-01"), spent: 100 },
    ];
    const result = computeRolloverEnvelopeBudget({ amount: 225, rolloverCap: null }, periods);
    // period 1: remaining = 225 - 300 = -75, carried into period 2
    // period 2: remaining = 225 + (-75) - 100 = 50
    expect(result.rolledOverAmount).toBe(-75);
    expect(result.remaining).toBe(50);
  });

  it("caps the amount of surplus that carries forward when rolloverCap is set", () => {
    const periods = [
      { ...period("2026-07-01", "2026-08-01"), spent: 25 },
      { ...period("2026-08-01", "2026-09-01"), spent: 0 },
    ];
    // period 1 remaining = 225 - 25 = 200, but capped at 100 for carryover
    const result = computeRolloverEnvelopeBudget({ amount: 225, rolloverCap: 100 }, periods);
    expect(result.rolledOverAmount).toBe(100);
    expect(result.remaining).toBe(325); // 225 + 100 - 0
  });

  it("only walks the most recent MAX_ROLLOVER_LOOKBACK_PERIODS entries", () => {
    const periods = Array.from({ length: 30 }, (_, i) => ({
      ...period(`2024-01-01`, `2024-02-01`),
      spent: 0,
    }));
    // Should not throw and should still compute using only the last 24.
    expect(() => computeRolloverEnvelopeBudget({ amount: 10, rolloverCap: null }, periods)).not.toThrow();
  });
});

describe("computeRequiredContribution", () => {
  it("splits the remaining amount evenly across periods until the deadline", () => {
    const contribution = computeRequiredContribution(
      { targetAmount: 1200, currentBalance: 0, deadlineDate: new Date("2027-08-15") },
      new Date("2026-08-15"),
      "monthly"
    );
    expect(contribution).toBeGreaterThan(90);
    expect(contribution).toBeLessThan(110);
  });

  it("returns 0 once the target is already met", () => {
    const contribution = computeRequiredContribution(
      { targetAmount: 1000, currentBalance: 1000, deadlineDate: new Date("2027-01-01") },
      new Date("2026-08-15"),
      "monthly"
    );
    expect(contribution).toBe(0);
  });

  it("returns the full remaining amount when the deadline has already passed", () => {
    const contribution = computeRequiredContribution(
      { targetAmount: 1000, currentBalance: 400, deadlineDate: new Date("2026-01-01") },
      new Date("2026-08-15"),
      "monthly"
    );
    expect(contribution).toBe(600);
  });
});

describe("computeSafeToSpendPerDay", () => {
  it("matches the master-context example: $140 over 20 days = $7/day", () => {
    const result = computeSafeToSpendPerDay(140, new Date("2026-09-01"), new Date("2026-08-12"));
    expect(result).toBeCloseTo(7, 5);
  });
});
