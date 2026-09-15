import { describe, expect, it, vi } from "vitest";
vi.mock("@finance-app/db", () => ({ prisma: {} }));
import { requireConversion } from "../fx";

describe("valuation boundary", () => {
  it("converts SGD to USD before aggregation", () => {
    expect(requireConversion(100, "USD", "USD", { SGD: 2 }) + requireConversion(100, "SGD", "USD", { SGD: 2 })).toBe(150);
  });
  it.each([{}, { SGD: 0 }, { SGD: -1 }, { SGD: Number.NaN }])("rejects missing or invalid FX (%j)", (rates) => {
    expect(() => requireConversion(100, "SGD", "USD", rates)).toThrow();
  });
});
