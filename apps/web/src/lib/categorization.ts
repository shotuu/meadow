import "server-only";
import { prisma } from "@finance-app/db";
import { normalizeMerchantKey } from "@finance-app/finance-logic";
import { matchesRule } from "@/lib/categorization-rules";

/**
 * Rule pass — step 1 of the categorization pipeline. Runs synchronously on
 * every import/manual entry, cheap enough to never need the AI fallback for
 * a merchant the user has already taught the app about.
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

  for (const rule of rules) {
    if (matchesRule(rule, merchantName, description)) {
      await prisma.categorizationRule.update({
        where: { id: rule.id },
        data: { matchCount: { increment: 1 }, lastMatchedAt: new Date() },
      });
      return rule.categoryId;
    }
  }

  return null;
}

/**
 * Active-learning loop — whenever a user confirms/corrects a transaction's
 * category, teach the rule engine so the same merchant isn't asked about
 * again (and, later, doesn't need an AI call at all).
 */
export async function recordCategoryCorrection(
  userId: string,
  merchantName: string | null,
  categoryId: string
): Promise<void> {
  if (!merchantName) return;
  const normalizedMerchant = normalizeMerchantKey(merchantName);
  if (!normalizedMerchant) return;

  const existing = await prisma.categorizationRule.findFirst({
    where: { userId, matchType: "exact_merchant", pattern: normalizedMerchant },
  });

  if (existing) {
    if (existing.categoryId !== categoryId) {
      await prisma.categorizationRule.update({
        where: { id: existing.id },
        data: { categoryId },
      });
    }
    return;
  }

  await prisma.categorizationRule.create({
    data: {
      userId,
      matchType: "exact_merchant",
      pattern: normalizedMerchant,
      categoryId,
      source: "learned_from_correction",
    },
  });
}
