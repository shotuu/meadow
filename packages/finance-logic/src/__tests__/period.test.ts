import { describe, expect, it } from "vitest";
import { buildPeriodChain, countPeriodsUntil, getPeriodRange, getPreviousPeriodRange } from "../period";

describe("getPeriodRange", () => {
  it("monthly: bounds a date to the first-of-month..first-of-next-month range", () => {
    const { start, end } = getPeriodRange("monthly", new Date(Date.UTC(2026, 7, 15)));
    expect(start.toISOString()).toBe(new Date(Date.UTC(2026, 7, 1)).toISOString());
    expect(end.toISOString()).toBe(new Date(Date.UTC(2026, 8, 1)).toISOString());
  });

  it("weekly: bounds a Wednesday to the preceding Monday..following Monday range", () => {
    // 2026-08-19 is a Wednesday
    const { start, end } = getPeriodRange("weekly", new Date(Date.UTC(2026, 7, 19)));
    expect(start.toISOString()).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(end.toISOString()).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
  });

  it("quarterly: bounds a date to its calendar quarter", () => {
    const { start, end } = getPeriodRange("quarterly", new Date(Date.UTC(2026, 7, 15)));
    expect(start.toISOString()).toBe(new Date(Date.UTC(2026, 6, 1)).toISOString());
    expect(end.toISOString()).toBe(new Date(Date.UTC(2026, 9, 1)).toISOString());
  });

  it("annual: bounds a date to the calendar year", () => {
    const { start, end } = getPeriodRange("annual", new Date(Date.UTC(2026, 7, 15)));
    expect(start.toISOString()).toBe(new Date(Date.UTC(2026, 0, 1)).toISOString());
    expect(end.toISOString()).toBe(new Date(Date.UTC(2027, 0, 1)).toISOString());
  });
});

describe("getPreviousPeriodRange", () => {
  it("monthly: returns the prior calendar month, including across a year boundary", () => {
    const prev = getPreviousPeriodRange("monthly", new Date(Date.UTC(2026, 0, 1)));
    expect(prev.start.toISOString()).toBe(new Date(Date.UTC(2025, 11, 1)).toISOString());
    expect(prev.end.toISOString()).toBe(new Date(Date.UTC(2026, 0, 1)).toISOString());
  });
});

describe("buildPeriodChain", () => {
  it("builds an oldest-first chain capped at maxPeriods", () => {
    const chain = buildPeriodChain("monthly", new Date(Date.UTC(2026, 7, 15)), 3);
    expect(chain).toHaveLength(3);
    expect(chain[0].start.toISOString()).toBe(new Date(Date.UTC(2026, 5, 1)).toISOString());
    expect(chain[2].start.toISOString()).toBe(new Date(Date.UTC(2026, 7, 1)).toISOString());
  });
});

describe("countPeriodsUntil", () => {
  it("returns 0 once the deadline has passed", () => {
    expect(
      countPeriodsUntil("monthly", new Date(Date.UTC(2026, 7, 15)), new Date(Date.UTC(2026, 6, 1)))
    ).toBe(0);
  });

  it("counts whole monthly periods to a ~12-month-out deadline", () => {
    const count = countPeriodsUntil(
      "monthly",
      new Date(Date.UTC(2026, 7, 15)),
      new Date(Date.UTC(2027, 7, 15))
    );
    expect(count).toBeGreaterThanOrEqual(11);
    expect(count).toBeLessThanOrEqual(13);
  });
});
