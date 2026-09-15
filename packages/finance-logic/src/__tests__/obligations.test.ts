import { describe, expect, it } from "vitest";
import { advanceObligationDueDate, classifyFundingStatus } from "../obligations";

describe("classifyFundingStatus", () => {
  it("is unfunded when nothing has been contributed", () => {
    expect(classifyFundingStatus(1000, 0)).toBe("unfunded");
  });

  it("is unfunded for a negative fundedAmount (defensive)", () => {
    expect(classifyFundingStatus(1000, -1)).toBe("unfunded");
  });

  it("is partially funded when some but not all has been contributed", () => {
    expect(classifyFundingStatus(1000, 500)).toBe("partially_funded");
  });

  it("is fully funded exactly at the boundary (fundedAmount === amount)", () => {
    expect(classifyFundingStatus(1000, 1000)).toBe("fully_funded");
  });

  it("is fully funded when overfunded", () => {
    expect(classifyFundingStatus(1000, 1200)).toBe("fully_funded");
  });
});

describe("advanceObligationDueDate", () => {
  it("returns null for one_time -- nothing to advance to", () => {
    expect(advanceObligationDueDate(new Date("2026-09-01"), "one_time")).toBeNull();
  });

  it("advances weekly by 7 days", () => {
    const result = advanceObligationDueDate(new Date("2026-09-01"), "weekly");
    expect(result!.toISOString().slice(0, 10)).toBe("2026-09-08");
  });

  it("advances biweekly by 14 days", () => {
    const result = advanceObligationDueDate(new Date("2026-09-01"), "biweekly");
    expect(result!.toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("advances monthly by one calendar month", () => {
    const result = advanceObligationDueDate(new Date("2026-09-01"), "monthly");
    expect(result!.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("advances quarterly by three calendar months", () => {
    const result = advanceObligationDueDate(new Date("2026-09-01"), "quarterly");
    expect(result!.toISOString().slice(0, 10)).toBe("2026-12-01");
  });

  it("advances semiannual by six calendar months", () => {
    const result = advanceObligationDueDate(new Date("2026-01-31"), "semiannual");
    // Jan 31 + 6 months = Jul 31 (no clamping needed here, but confirms the
    // addMonthsClamped path is actually wired through).
    expect(result!.toISOString().slice(0, 10)).toBe("2026-07-31");
  });

  it("advances annual by twelve calendar months, clamping Feb 29 in a leap year to Feb 28", () => {
    const result = advanceObligationDueDate(new Date("2028-02-29"), "annual");
    expect(result!.toISOString().slice(0, 10)).toBe("2029-02-28");
  });
});
