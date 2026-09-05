import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  buildPeriodChain,
  countPeriodsUntil,
  getPeriodRange,
  getPreviousPeriodRange,
  resolveSpendRange,
} from "../period";

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

describe("resolveSpendRange", () => {
  // 2026-08-19 is a Wednesday, day 19 of the month, day 231 of the year.
  const now = new Date(Date.UTC(2026, 7, 19, 14, 30));

  it("today: is a single calendar day, end exclusive-tomorrow", () => {
    const { start, end } = resolveSpendRange("today", now);
    expect(start.toISOString()).toBe(new Date(Date.UTC(2026, 7, 19)).toISOString());
    expect(end.toISOString()).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
  });

  it("7d: spans the 7 calendar days ending today, inclusive", () => {
    const { start, end } = resolveSpendRange("7d", now);
    expect(start.toISOString()).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(end.toISOString()).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
  });

  it("30d: spans the 30 calendar days ending today, inclusive", () => {
    const { start, end } = resolveSpendRange("30d", now);
    expect(start.toISOString()).toBe(new Date(Date.UTC(2026, 6, 21)).toISOString());
    expect(end.toISOString()).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
  });

  it("mtd: starts on the 1st of the current month, stops today rather than running to month-end", () => {
    const { start, end } = resolveSpendRange("mtd", now);
    expect(start.toISOString()).toBe(new Date(Date.UTC(2026, 7, 1)).toISOString());
    expect(end.toISOString()).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
  });

  it("ytd: starts on January 1st of the current year, stops today", () => {
    const { start, end } = resolveSpendRange("ytd", now);
    expect(start.toISOString()).toBe(new Date(Date.UTC(2026, 0, 1)).toISOString());
    expect(end.toISOString()).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
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

describe("addMonthsClamped", () => {
  it("adds whole months with no day-of-month overflow", () => {
    const result = addMonthsClamped(new Date(Date.UTC(2026, 0, 15)), 6);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 6, 15)).toISOString());
  });

  it("clamps Jan 31 + 1 month to Feb 28 in a non-leap year", () => {
    const result = addMonthsClamped(new Date(Date.UTC(2026, 0, 31)), 1);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 1, 28)).toISOString());
  });

  it("clamps Jan 31 + 1 month to Feb 29 in a leap year", () => {
    const result = addMonthsClamped(new Date(Date.UTC(2028, 0, 31)), 1);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2028, 1, 29)).toISOString());
  });

  it("clamps Aug 31 + 6 months to Feb 28/29 across a year boundary", () => {
    const result = addMonthsClamped(new Date(Date.UTC(2026, 7, 31)), 6);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2027, 1, 28)).toISOString());
  });

  it("rolls the year forward when months overflow past December", () => {
    const result = addMonthsClamped(new Date(Date.UTC(2026, 10, 10)), 3);
    expect(result.toISOString()).toBe(new Date(Date.UTC(2027, 1, 10)).toISOString());
  });
});
