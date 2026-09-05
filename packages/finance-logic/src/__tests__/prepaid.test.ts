import { describe, expect, it } from "vitest";
import { computePrepaidCoverageStatus } from "../prepaid";

describe("computePrepaidCoverageStatus", () => {
  it("reports an unknown (not overdue) state when no payment has ever occurred", () => {
    const result = computePrepaidCoverageStatus(
      { coverageMonths: 6 },
      { lastPaymentDate: null, lastPaymentAmount: null },
      new Date(Date.UTC(2026, 7, 15))
    );
    expect(result.paidThrough).toBeNull();
    expect(result.daysRemaining).toBeNull();
    expect(result.isOverdue).toBe(false);
  });

  it("reports in-coverage when the projected paid-through date is still ahead", () => {
    const result = computePrepaidCoverageStatus(
      { coverageMonths: 6 },
      { lastPaymentDate: new Date(Date.UTC(2026, 7, 10)), lastPaymentAmount: 2904.13 },
      new Date(Date.UTC(2026, 9, 1))
    );
    expect(result.paidThrough?.toISOString()).toBe(new Date(Date.UTC(2027, 1, 10)).toISOString());
    expect(result.isOverdue).toBe(false);
    expect(result.daysRemaining).toBeGreaterThan(0);
  });

  it("reports overdue once asOfDate has passed the projected paid-through date", () => {
    const result = computePrepaidCoverageStatus(
      { coverageMonths: 3 },
      { lastPaymentDate: new Date(Date.UTC(2026, 0, 1)), lastPaymentAmount: 1200 },
      new Date(Date.UTC(2026, 6, 1))
    );
    expect(result.isOverdue).toBe(true);
    expect(result.daysRemaining).toBeLessThan(0);
  });

  it("treats the exact paid-through day as not yet overdue (daysRemaining === 0)", () => {
    const result = computePrepaidCoverageStatus(
      { coverageMonths: 1 },
      { lastPaymentDate: new Date(Date.UTC(2026, 0, 1)), lastPaymentAmount: 100 },
      new Date(Date.UTC(2026, 1, 1))
    );
    expect(result.daysRemaining).toBe(0);
    expect(result.isOverdue).toBe(false);
  });

  it("clamps month-end overflow the same way addMonthsClamped does", () => {
    const result = computePrepaidCoverageStatus(
      { coverageMonths: 1 },
      { lastPaymentDate: new Date(Date.UTC(2026, 0, 31)), lastPaymentAmount: 50 },
      new Date(Date.UTC(2026, 1, 1))
    );
    expect(result.paidThrough?.toISOString()).toBe(new Date(Date.UTC(2026, 1, 28)).toISOString());
  });
});
