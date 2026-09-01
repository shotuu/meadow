import { describe, expect, it } from "vitest";
import { matchesRule } from "../categorization-rules";

describe("matchesRule", () => {
  describe("exact_merchant", () => {
    it("matches when the normalized merchant equals the normalized pattern", () => {
      const rule = { matchType: "exact_merchant" as const, pattern: "Whole Foods" };
      expect(matchesRule(rule, "WHOLE FOODS #4521", "PURCHASE WHOLE FOODS")).toBe(true);
    });

    it("does not match a different merchant", () => {
      const rule = { matchType: "exact_merchant" as const, pattern: "Whole Foods" };
      expect(matchesRule(rule, "Trader Joe's", "PURCHASE")).toBe(false);
    });

    it("does not match when there is no merchant name at all", () => {
      const rule = { matchType: "exact_merchant" as const, pattern: "Whole Foods" };
      expect(matchesRule(rule, null, "some generic description")).toBe(false);
    });
  });

  describe("contains", () => {
    it("matches a substring in the merchant+description haystack, case-insensitively", () => {
      const rule = { matchType: "contains" as const, pattern: "netflix" };
      expect(matchesRule(rule, null, "NETFLIX.COM MONTHLY CHARGE")).toBe(true);
    });

    it("does not match when the substring is absent", () => {
      const rule = { matchType: "contains" as const, pattern: "netflix" };
      expect(matchesRule(rule, null, "Spotify monthly charge")).toBe(false);
    });
  });

  describe("regex", () => {
    it("matches against the merchant+description haystack", () => {
      const rule = { matchType: "regex" as const, pattern: "^uber (eats|trip)" };
      expect(matchesRule(rule, "Uber Eats", "some description")).toBe(true);
    });

    it("treats an invalid pattern as a non-match instead of throwing", () => {
      const rule = { matchType: "regex" as const, pattern: "(unclosed" };
      expect(() => matchesRule(rule, null, "anything")).not.toThrow();
      expect(matchesRule(rule, null, "anything")).toBe(false);
    });
  });
});
