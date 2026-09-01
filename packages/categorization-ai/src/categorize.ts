import { GoogleGenAI, Type } from "@google/genai";
import { prisma } from "@finance-app/db";

const MODEL = "gemini-flash-lite-latest";
const BATCH_SIZE = 50;
const LEARNED_EXAMPLE_LIMIT = 20;

// A suggestion at or above this confidence is applied without flagging it
// for human review; below it, the UI surfaces the transaction on the
// Needs Review tab even though a category was still assigned.
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

let client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY must be set");
  client = new GoogleGenAI({ apiKey });
  return client;
}

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      transactionId: { type: Type.STRING },
      categoryId: {
        type: Type.STRING,
        description: "One of the provided category ids, or the literal string \"none\" if nothing fits.",
      },
      confidence: { type: Type.NUMBER, description: "0 to 1." },
    },
    required: ["transactionId", "categoryId", "confidence"],
  },
};

interface AiSuggestion {
  transactionId: string;
  categoryId: string;
  confidence: number;
}

/**
 * The AI fallback for whatever the synchronous rule pass (applyCategorizationRules,
 * run on every manual/CSV/Plaid transaction) left uncategorized. Batches all of a
 * user's uncategorized transactions into one Gemini call (structured JSON output,
 * not free-text parsing) rather than one call per transaction — this is the free
 * tier, so minimizing request count matters.
 *
 * Shared between apps/worker (nightly cron, all users) and apps/web (the
 * Accounts "Sync now" button, current user only, via runCategorizationBatchForUser
 * directly) -- lives here rather than in either app since they can't import
 * from each other, same reasoning as packages/plaid-sync and packages/ibkr-sync.
 */
export async function runCategorizationBatchForAllUsers(): Promise<void> {
  const userIds = await prisma.appUser.findMany({ select: { id: true } });
  for (const { id: userId } of userIds) {
    try {
      await runCategorizationBatchForUser(userId);
    } catch (err) {
      console.error(`[categorization-ai] user ${userId} failed`, err);
    }
  }
}

export async function runCategorizationBatchForUser(userId: string): Promise<void> {
  const [categories, transactions, learnedExamples] = await Promise.all([
    prisma.category.findMany({
      where: { userId, isArchived: false },
      select: { id: true, name: true, kind: true },
    }),
    prisma.transaction.findMany({
      where: { userId, categorySource: "uncategorized", isTransfer: false },
      select: { id: true, description: true, merchantName: true, amount: true },
      take: BATCH_SIZE,
      orderBy: { date: "desc" },
    }),
    // Past manual confirmations/corrections, given to the model as
    // precedent -- the exact-merchant rule engine (recordCategoryCorrection)
    // already short-circuits repeat merchants before this ever runs, so
    // these examples exist to help Gemini generalize to a *similar* but
    // not identical merchant/description, which the rule engine can't do.
    prisma.transaction.findMany({
      where: { userId, categorySource: "manual", categoryId: { not: null } },
      select: { description: true, merchantName: true, amount: true, categoryId: true },
      take: LEARNED_EXAMPLE_LIMIT,
      orderBy: { date: "desc" },
    }),
  ]);

  if (transactions.length === 0 || categories.length === 0) return;

  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: JSON.stringify({
      categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
      learnedExamples: learnedExamples.map((t) => ({
        description: t.description,
        merchant: t.merchantName,
        amount: Number(t.amount),
        categoryId: t.categoryId,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        description: t.description,
        merchant: t.merchantName,
        amount: Number(t.amount),
      })),
    }),
    config: {
      systemInstruction:
        "You categorize personal finance transactions. For each transaction, pick the single " +
        "best-fitting category id from the provided list based on its description/merchant. " +
        "Negative amounts are money leaving the account (expenses); positive are income. Only " +
        "use category ids from the provided list, or the literal string \"none\" if nothing " +
        "fits well. The learnedExamples array shows transactions this user has manually " +
        "confirmed or corrected before -- use them as precedent for categorizing similar " +
        "(not necessarily identical) merchants or descriptions. Return one entry per " +
        "transaction in the transactions array, in the same order given.",
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    console.error(`[categorization-ai] empty response for user ${userId}`);
    return;
  }

  let suggestions: AiSuggestion[];
  try {
    suggestions = JSON.parse(text);
  } catch {
    console.error(`[categorization-ai] unparseable response for user ${userId}`);
    return;
  }

  const validCategoryIds = new Set(categories.map((c) => c.id));
  const validTransactionIds = new Set(transactions.map((t) => t.id));

  for (const s of suggestions) {
    if (!validTransactionIds.has(s.transactionId)) continue;
    if (s.categoryId === "none" || !validCategoryIds.has(s.categoryId)) continue;
    const confidence = Math.max(0, Math.min(1, s.confidence));

    await prisma.transaction.update({
      where: { id: s.transactionId },
      data: { categoryId: s.categoryId, categorySource: "ai", categoryConfidence: confidence },
    });
  }
}
