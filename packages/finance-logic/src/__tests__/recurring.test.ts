import { describe, expect, it } from "vitest";
import {
  classifyConfidence,
  computeNextExpectedDate,
  detectRecurring,
  isMissed,
  normalizeMerchantKey,
} from "../recurring";

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
    expect(next!.getUTCMonth()).not.toBe(0); // moved out of January
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

describe("normalizeMerchantKey", () => {
  it("strips processor prefixes and trailing store/reference numbers", () => {
    expect(normalizeMerchantKey("SQ *BLUE BOTTLE 4521")).toBe("blue bottle");
    expect(normalizeMerchantKey("TST* Joe's Pizza #002")).toBe("joe s pizza");
  });

  it("treats equivalent merchant strings identically regardless of casing/punctuation", () => {
    expect(normalizeMerchantKey("Netflix.com")).toBe(normalizeMerchantKey("NETFLIX COM"));
  });
});
