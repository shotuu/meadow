import { prisma } from "@finance-app/db";
import { normalizeMerchantKey } from "@finance-app/finance-logic";

/**
 * Mirrors apps/web/src/lib/categorization.ts's rule pass. Duplicated (not
 * imported) because apps/web isn't a workspace dependency other packages or
 * apps/worker can pull from — this package is the shared surface between
 * web and worker instead. Keep the two in sync if the matching logic changes.
 */
export async function applyCategorizationRules(
  userId: string,
  merchantName: string | null,
  description: string
): Promise<string | null> {
  const rules = await prisma.categorizationRule.findMany({
    where: { userId, isActive: true },
    orderBy: { priority: "desc" },
  });

  const normalizedMerchant = merchantName ? normalizeMerchantKey(merchantName) : null;
  const haystack = `${merchantName ?? ""} ${description}`.toLowerCase();

  for (const rule of rules) {
    let matched = false;
    if (rule.matchType === "exact_merchant") {
      matched = normalizedMerchant !== null && normalizedMerchant === normalizeMerchantKey(rule.pattern);
    } else if (rule.matchType === "contains") {
      matched = haystack.includes(rule.pattern.toLowerCase());
    } else if (rule.matchType === "regex") {
      try {
        matched = new RegExp(rule.pattern, "i").test(haystack);
      } catch {
        matched = false;
      }
    }

    if (matched) {
      await prisma.categorizationRule.update({
        where: { id: rule.id },
        data: { matchCount: { increment: 1 }, lastMatchedAt: new Date() },
      });
      return rule.categoryId;
    }
  }

  return null;
}
