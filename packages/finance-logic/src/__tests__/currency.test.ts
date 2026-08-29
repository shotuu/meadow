import { describe, expect, it } from "vitest";
import { convertCurrency } from "../currency";

const RATES = { EUR: 0.86, JPY: 159.4, GBP: 0.74 };

describe("convertCurrency", () => {
  it("returns the same amount unchanged when from === to", () => {
    expect(convertCurrency(100, "EUR", "EUR", RATES)).toBe(100);
  });

  it("converts USD to a quote currency directly", () => {
    expect(convertCurrency(100, "USD", "EUR", RATES)).toBeCloseTo(86, 5);
  });

  it("converts a quote currency to USD directly", () => {
    expect(convertCurrency(86, "EUR", "USD", RATES)).toBeCloseTo(100, 5);
  });

  it("triangulates between two non-USD currencies through USD", () => {
    // 100 EUR -> USD (100/0.86) -> JPY (* 159.4)
    const expected = (100 / 0.86) * 159.4;
    expect(convertCurrency(100, "EUR", "JPY", RATES)).toBeCloseTo(expected, 5);
  });

  it("returns null when the source currency isn't in the rate map", () => {
    expect(convertCurrency(100, "XYZ", "USD", RATES)).toBeNull();
  });

  it("returns null when the target currency isn't in the rate map", () => {
    expect(convertCurrency(100, "USD", "XYZ", RATES)).toBeNull();
  });

  it("preserves sign (negative amounts convert to negative amounts)", () => {
    expect(convertCurrency(-100, "USD", "EUR", RATES)).toBeCloseTo(-86, 5);
  });
});
