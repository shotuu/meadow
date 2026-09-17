export type ReversalMatchStatus = "pending" | "confirmed" | "dismissed";

export interface ReversalCandidateRecord {
  id: string;
  chargeTransactionId: string;
  reversalTransactionId: string;
  status: ReversalMatchStatus;
}

export interface ReversalCandidateMatch {
  chargeTransactionId: string;
  reversalTransactionId: string;
  confidenceScore: number;
  daysApart: number;
}

export interface ReversalCandidateSyncPlan {
  toCreate: ReversalCandidateMatch[];
  toUpdate: { id: string; confidenceScore: number; daysApart: number }[];
  stalePendingIds: string[];
}

/**
 * Pure reconciliation between what a fresh matchReversals run just
 * computed and what's already persisted -- deciding exactly what to
 * create/update/delete, without touching the database itself. Extracted
 * as a pure function (mirrors this package's existing philosophy) so the
 * lifecycle properties that actually matter -- idempotency, pruning a
 * pending suggestion the data no longer supports, and never silently
 * overwriting a user's confirm/dismiss decision -- have real unit tests
 * instead of only being provable against a real database.
 *
 * - A match with no existing row -> create (pending).
 * - A match whose existing row is still pending -> update score/daysApart
 *   in place (the pairing is still proposed, just possibly refined).
 * - A match whose existing row is confirmed or dismissed -> untouched,
 *   always, regardless of what this run recomputed.
 * - An existing pending row this run did not reproduce -> pruned (the
 *   underlying transactions changed, or a better pairing displaced it).
 *   Confirmed/dismissed rows are never pruned, reproduced or not.
 */
export function planReversalCandidateSync(
  existing: ReversalCandidateRecord[],
  matches: ReversalCandidateMatch[]
): ReversalCandidateSyncPlan {
  const key = (chargeId: string, reversalId: string) => `${chargeId}:${reversalId}`;
  const existingByKey = new Map(existing.map((c) => [key(c.chargeTransactionId, c.reversalTransactionId), c]));
  const matchedKeys = new Set(matches.map((m) => key(m.chargeTransactionId, m.reversalTransactionId)));

  const toCreate: ReversalCandidateMatch[] = [];
  const toUpdate: { id: string; confidenceScore: number; daysApart: number }[] = [];
  for (const match of matches) {
    const existingRow = existingByKey.get(key(match.chargeTransactionId, match.reversalTransactionId));
    if (!existingRow) {
      toCreate.push(match);
    } else if (existingRow.status === "pending") {
      toUpdate.push({ id: existingRow.id, confidenceScore: match.confidenceScore, daysApart: match.daysApart });
    }
  }

  const stalePendingIds = existing
    .filter((c) => c.status === "pending" && !matchedKeys.has(key(c.chargeTransactionId, c.reversalTransactionId)))
    .map((c) => c.id);

  return { toCreate, toUpdate, stalePendingIds };
}
