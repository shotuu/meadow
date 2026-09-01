import { normalizeMerchantKey } from "@finance-app/finance-logic";

export interface MatchableRule {
  matchType: "exact_merchant" | "contains" | "regex";
  pattern: string;
}

/**
 * Pure matching logic for one categorization rule against one transaction's
 * merchant/description -- split out of applyCategorizationRules so it's
 * testable without a database.
 */
export function matchesRule(rule: MatchableRule, merchantName: string | null, description: string): boolean {
  const normalizedMerchant = merchantName ? normalizeMerchantKey(merchantName) : null;
  const haystack = `${merchantName ?? ""} ${description}`.toLowerCase();

  if (rule.matchType === "exact_merchant") {
    return normalizedMerchant !== null && normalizedMerchant === normalizeMerchantKey(rule.pattern);
  }
  if (rule.matchType === "contains") {
    return haystack.includes(rule.pattern.toLowerCase());
  }
  if (rule.matchType === "regex") {
    try {
      return new RegExp(rule.pattern, "i").test(haystack);
    } catch {
      return false;
    }
  }
  return false;
}
