import { describe, expect, it } from "vitest";
import {
  classifyConfidence,
  computeMonthlyEquivalent,
  computeNextExpectedDate,
  detectRecurring,
  isMissed,
  normalizeMerchantKey,
  RECENT_OCCURRENCE_WINDOW,
} from "../recurring";

function addMonthsUtc(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

describe("detectRecurring", () => {
  it("returns null with fewer than 3 occurrences", () => {
    const result = detectRecurring({
      occurrenceDates: [new Date("2026-06-01"), new Date("2026-07-01")],
      amounts: [15.99, 15.99],
    });
    expect(result).toBeNull();
  });

  it("scores a clean monthly subscription with high confidence", () => {
    const result = detectRecurring({
      occurrenceDates: [
        new Date("2026-05-01"),
        new Date("2026-06-01"),
        new Date("2026-07-01"),
        new Date("2026-08-01"),
      ],
      amounts: [15.99, 15.99, 15.99, 15.99],
    });
    expect(result).not.toBeNull();
    expect(result!.cadence).toBe("monthly");
    expect(result!.combinedConfidence).toBeGreaterThan(0.6);
    expect(classifyConfidence(result!.combinedConfidence)).toBe("active");
  });

  it("scores irregular, wildly-varying spending as low confidence", () => {
    const result = detectRecurring({
      occurrenceDates: [new Date("2026-01-03"), new Date("2026-03-22"), new Date("2026-07-11")],
      amounts: [12, 87, 34],
    });
    expect(result).not.toBeNull();
    expect(classifyConfidence(result!.combinedConfidence)).not.toBe("active");
  });

  it("detects an annual charge (e.g. yearly insurance premium) as its own cadence", () => {
    const result = detectRecurring({
      occurrenceDates: [new Date("2024-03-01"), new Date("2025-03-02"), new Date("2026-03-01")],
      amounts: [499.99, 499.99, 499.99],
    });
    expect(result!.cadence).toBe("annual");
  });

  it("reflects a real price change instead of a lifetime median diluted by years at the old price", () => {
    // 30 months at $15.99, then 10 months at $22.99 -- a genuine, permanent
    // price increase, comfortably past the halfway point of the 12-occurrence
    // scoring window. A lifetime median would still report $15.99 here (with
    // 30 old vs. 10 new, the old price is still the majority of all-time
    // occurrences); windowed scoring should already reflect the new price.
    const start = new Date("2023-04-01T00:00:00Z");
    const occurrenceDates: Date[] = [];
    const amounts: number[] = [];
    for (let i = 0; i < 40; i++) {
      occurrenceDates.push(addMonthsUtc(start, i));
      amounts.push(i < 30 ? -15.99 : -22.99);
    }

    const result = detectRecurring({ occurrenceDates, amounts });
    expect(result).not.toBeNull();
    expect(result!.medianAmount).toBeCloseTo(22.99);
    // occurrenceCount still reflects the true lifetime count, not the window.
    expect(result!.occurrenceCount).toBe(40);
  });

  it("recovers full cadence confidence once a formerly-irregular series has been solid for a full window", () => {
    // First 20 occurrences: irregular gaps. Last 12: exact monthly. A
    // lifetime MAD would stay permanently poisoned by the irregular tail;
    // windowed scoring should score on the regular tail alone.
    const occurrenceDates: Date[] = [];
    const amounts: number[] = [];
    let cursor = new Date("2021-01-05T00:00:00Z");
    for (let i = 0; i < 20; i++) {
      cursor = new Date(cursor.getTime() + (20 + ((i * 37) % 50)) * 86400000);
      occurrenceDates.push(new Date(cursor));
      amounts.push(-40 - (i % 3));
    }
    for (let i = 0; i < RECENT_OCCURRENCE_WINDOW; i++) {
      cursor = addMonthsUtc(cursor, 1);
      occurrenceDates.push(new Date(cursor));
      amounts.push(-45);
    }

    const result = detectRecurring({ occurrenceDates, amounts });
    expect(result).not.toBeNull();
    expect(result!.cadenceConfidence).toBeCloseTo(1);
    expect(result!.amountConfidence).toBeCloseTo(1);
  });
});

describe("classifyConfidence", () => {
  it("buckets scores into active/possible/discard", () => {
    expect(classifyConfidence(0.9)).toBe("active");
    expect(classifyConfidence(0.5)).toBe("possible");
    expect(classifyConfidence(0.1)).toBe("discard");
  });
});

describe("computeNextExpectedDate", () => {
  it("adds a calendar month rather than a fixed 30-day offset", () => {
    // Jan 31 + 1 calendar month should land on/around end-of-February, not
    // silently overflow into March via naive day-arithmetic.
    const next = computeNextExpectedDate(new Date(Date.UTC(2026, 0, 31)), "monthly");
    expect(next).not.toBeNull();
    expect(next!.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("rolls a December annual charge into the following January correctly", () => {
    const next = computeNextExpectedDate(new Date(Date.UTC(2025, 11, 15)), "annual");
    expect(next!.getUTCFullYear()).toBe(2026);
    expect(next!.getUTCMonth()).toBe(11);
  });

  it("returns null for irregular cadence", () => {
    expect(computeNextExpectedDate(new Date(), "irregular")).toBeNull();
  });
});

describe("isMissed", () => {
  it("is not missed within the grace window", () => {
    const nextExpected = new Date(Date.UTC(2026, 7, 1));
    const asOf = new Date(Date.UTC(2026, 7, 20)); // 19 days late, monthly grace is 45 days
    expect(isMissed(nextExpected, "monthly", asOf)).toBe(false);
  });

  it("is missed once past the 1.5x-interval grace window", () => {
    const nextExpected = new Date(Date.UTC(2026, 7, 1));
    const asOf = new Date(Date.UTC(2026, 9, 20)); // ~80 days late
    expect(isMissed(nextExpected, "monthly", asOf)).toBe(true);
  });
});

describe("computeMonthlyEquivalent", () => {
  it("passes a monthly amount through unchanged", () => {
    expect(computeMonthlyEquivalent(15.99, "monthly")).toBeCloseTo(15.99);
  });

  it("divides an annual amount by 12", () => {
    expect(computeMonthlyEquivalent(120, "annual")).toBeCloseTo(10);
  });

  it("divides a quarterly amount by 3", () => {
    expect(computeMonthlyEquivalent(90, "quarterly")).toBeCloseTo(30);
  });

  it("scales a weekly amount up by ~52/12", () => {
    expect(computeMonthlyEquivalent(10, "weekly")).toBeCloseTo(43.33, 1);
  });

  it("scales a biweekly amount up by ~26/12", () => {
    expect(computeMonthlyEquivalent(20, "biweekly")).toBeCloseTo(43.33, 1);
  });
});

describe("normalizeMerchantKey", () => {
  it("strips processor prefixes and trailing store/reference numbers", () => {
    expect(normalizeMerchantKey("SQ *BLUE BOTTLE 4521")).toBe("blue bottle");
    expect(normalizeMerchantKey("TST* Joe's Pizza #002")).toBe("joe s pizza");
  });

  it("treats equivalent merchant strings identically regardless of casing/punctuation", () => {
    expect(normalizeMerchantKey("Netflix.com")).toBe(normalizeMerchantKey("NETFLIX COM"));
  });
});
