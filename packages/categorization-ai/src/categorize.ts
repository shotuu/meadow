import { GoogleGenAI, Type } from "@google/genai";
import { prisma } from "@finance-app/db";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

export { LOW_CONFIDENCE_THRESHOLD };

const MODEL = "gemini-flash-lite-latest";
const BATCH_SIZE = 50;
const LEARNED_EXAMPLE_LIMIT = 20;
/**
 * A single run (nightly cron, or a "Sync now" click) keeps calling the batch
 * endpoint until the uncategorized backlog is drained or this cap is hit,
 * instead of processing exactly one BATCH_SIZE-sized page per run. A bulk
 * CSV import or a first Plaid/IBKR/Finverse backfill can easily leave
 * hundreds or thousands of transactions uncategorized at once; at one batch
 * per night that backlog took weeks to clear, and every transaction still
 * sitting at categorySource "uncategorized" is silently excluded from
 * spend-by-category and budget "spent" totals the whole time (those query
 * by categoryId). Capped, not unbounded, so a pathological backlog or a
 * flaky API can't turn one job run into an unbounded loop.
 */
const MAX_BATCHES_PER_RUN = 20;

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
 * run on every manual/CSV/Plaid transaction) left uncategorized. Batches a
 * user's uncategorized transactions into Gemini calls (structured JSON output,
 * not free-text parsing) of BATCH_SIZE each rather than one call per
 * transaction — this is the free tier, so minimizing request count matters —
 * repeating up to MAX_BATCHES_PER_RUN times per call so a real backlog gets
 * cleared in one run instead of one page per night (see that constant's own
 * comment).
 *
 * Shared between apps/worker (nightly cron, all users) and apps/web (the
 * Accounts "Sync now" button, current user only, via runCategorizationBatchForUser
 * directly) -- lives here rather than in either app since they can't import
 * from each other, same reasoning as packages/plaid-sync and packages/ibkr-sync.
 */
export async function runCategorizationBatchForAllUsers(): Promise<void> {
  const userIds = await prisma.appUser.findMany({ select: { id: true } });
  const failures: unknown[] = [];
  for (const { id: userId } of userIds) {
    try {
      await runCategorizationBatchForUser(userId);
    } catch (err) {
      failures.push(err);
      console.error(`[categorization-ai] user ${userId} failed`, err);
    }
  }
  if (failures.length) throw new AggregateError(failures, "User job incomplete");
}

export async function runCategorizationBatchForUser(userId: string): Promise<void> {
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const attempted = await runCategorizationBatchOnce(userId);
    // Fewer than a full page means the backlog is drained; 0 also covers
    // "nothing to do" (no categories) and "this attempt failed" (unparseable/
    // empty response) -- either way, retrying immediately won't help.
    if (attempted < BATCH_SIZE) break;
  }
}

/** Runs one BATCH_SIZE-sized categorization page. Returns how many transactions were sent to Gemini (0 if none were). */
async function runCategorizationBatchOnce(userId: string): Promise<number> {
  const [categories, transactions, learnedExamples] = await Promise.all([
    prisma.category.findMany({
      where: { userId, isArchived: false },
      select: { id: true, name: true, kind: true },
    }),
    prisma.transaction.findMany({
      where: { userId, categorySource: "uncategorized", isTransfer: false },
      select: { id: true, description: true, merchantName: true, amount: true },
      take: BATCH_SIZE,
      orderBy: [{ categorizationAttemptedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
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

  if (transactions.length === 0 || categories.length === 0) return 0;

  const ai = getClient();
  await prisma.transaction.updateMany({
    where: { userId, id: { in: transactions.map((t) => t.id) }, categorySource: "uncategorized", isTransfer: false },
    data: { categorizationAttemptedAt: new Date() },
  });
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
    return 0;
  }

  let suggestions: AiSuggestion[];
  try {
    suggestions = JSON.parse(text);
    if (!Array.isArray(suggestions)) throw new Error("Expected an array");
  } catch {
    console.error(`[categorization-ai] unparseable response for user ${userId}`);
    return 0;
  }

  const validCategoryIds = new Set(categories.map((c) => c.id));
  const validTransactionIds = new Set(transactions.map((t) => t.id));

  for (const s of suggestions) {
    if (!s || typeof s !== "object" || !Number.isFinite(s.confidence)) continue;
    if (!validTransactionIds.has(s.transactionId)) continue;
    validTransactionIds.delete(s.transactionId);
    if (s.categoryId === "none" || !validCategoryIds.has(s.categoryId)) continue;
    const confidence = Math.max(0, Math.min(1, s.confidence));

    await prisma.transaction.updateMany({
      where: { id: s.transactionId, userId, categorySource: "uncategorized", isTransfer: false },
      data: { categoryId: s.categoryId, categorySource: "ai", categoryConfidence: confidence },
    });
  }

  return transactions.length;
}
