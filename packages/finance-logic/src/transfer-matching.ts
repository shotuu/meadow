export interface MoneyMovementEvent {
  id: string;
  accountId: string;
  /** Signed: negative = money out, positive = money in. */
  amount: number;
  currency: string;
  date: Date;
}

export interface TransferMatchResult {
  aId: string;
  bId: string;
  confidenceScore: number;
  daysApart: number;
}

export interface MatchTransfersOptions {
  /** Maximum days apart to even consider a pair, covering ACH/settlement lag. */
  maxDateDistanceDays?: number;
  /** Filter unsupported pairs before greedy selection consumes either event. */
  eligiblePair?: (a: MoneyMovementEvent, b: MoneyMovementEvent) => boolean;
  /** Minimum confidence required to accept a pair at all. */
  minConfidence?: number;
  /**
   * Defaults to false: a transfer moves money between two of the user's
   * DIFFERENT accounts. Set true to instead require the SAME account --
   * a different question (e.g. a same-account reversal/refund pair),
   * reusing the identical amount/date scoring rather than a second
   * algorithm.
   */
  sameAccount?: boolean;
}

const DEFAULT_MAX_DATE_DISTANCE_DAYS = 5;
const DEFAULT_MIN_CONFIDENCE = 0.6;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(Math.round((b.getTime() - a.getTime()) / msPerDay));
}

/**
 * Detects likely internal-transfer pairs among a set of money-movement
 * events (bank transactions and/or IBKR deposit/withdrawal rows, mixed
 * together in one call -- deliberately NOT run as two separate passes, to
 * avoid an ordering bias where whichever pass runs first can greedily
 * consume a transaction that would have been a *better* match in the other
 * pass). Same-currency only (never FX-tolerant -- a cross-currency transfer
 * should be surfaced for manual review elsewhere, not auto-matched here),
 * opposite-signed, different accounts, within a bounded date window.
 * Confidence = 0.7 * amount-closeness + 0.3 * date-closeness. Pairs are
 * greedily accepted in descending confidence order, each event usable in at
 * most one accepted pair, so no single transaction is proposed twice in one
 * run. Returns only pairs meeting `minConfidence`, to avoid flooding a
 * review queue with noise.
 */
export function matchTransfers(
  events: MoneyMovementEvent[],
  options?: MatchTransfersOptions
): TransferMatchResult[] {
  const maxDateDistanceDays = options?.maxDateDistanceDays ?? DEFAULT_MAX_DATE_DISTANCE_DAYS;
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const sameAccount = options?.sameAccount ?? false;

  const candidates: TransferMatchResult[] = [];

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];

      if (options?.eligiblePair && !options.eligiblePair(a, b)) continue;
      if (sameAccount ? a.accountId !== b.accountId : a.accountId === b.accountId) continue;
      if (a.currency !== b.currency) continue;
      if (a.amount === 0 || b.amount === 0) continue;
      // Opposite signs: one outflow, one inflow.
      if (!((a.amount < 0 && b.amount > 0) || (a.amount > 0 && b.amount < 0))) continue;

      const daysApart = daysBetween(a.date, b.date);
      if (daysApart > maxDateDistanceDays) continue;

      const absA = Math.abs(a.amount);
      const absB = Math.abs(b.amount);
      const amountScore = clamp01(1 - Math.abs(absA - absB) / Math.max(absA, absB));
      const dateScore = clamp01(1 - daysApart / maxDateDistanceDays);
      const confidenceScore = clamp01(0.7 * amountScore + 0.3 * dateScore);

      if (confidenceScore < minConfidence) continue;

      candidates.push({ aId: a.id, bId: b.id, confidenceScore, daysApart });
    }
  }

  candidates.sort((x, y) => {
    if (y.confidenceScore !== x.confidenceScore) return y.confidenceScore - x.confidenceScore;
    if (x.daysApart !== y.daysApart) return x.daysApart - y.daysApart;
    // Final deterministic tiebreak so equal-confidence, equal-distance pairs
    // don't depend on array insertion order.
    const xKey = `${x.aId}:${x.bId}`;
    const yKey = `${y.aId}:${y.bId}`;
    return xKey < yKey ? -1 : xKey > yKey ? 1 : 0;
  });

  const used = new Set<string>();
  const accepted: TransferMatchResult[] = [];
  for (const candidate of candidates) {
    if (used.has(candidate.aId) || used.has(candidate.bId)) continue;
    used.add(candidate.aId);
    used.add(candidate.bId);
    accepted.push(candidate);
  }

  return accepted;
}

export interface ReversalCandidateEvent {
  id: string;
  accountId: string;
  /** Signed: negative = money out, positive = money in. */
  amount: number;
  currency: string;
  date: Date;
  /** Normalized merchant/description key (see normalizeMerchantKey) -- null if there's nothing to compare. */
  merchantKey: string | null;
  pending: boolean;
}

export interface ReversalMatchResult {
  aId: string;
  bId: string;
  confidenceScore: number;
  daysApart: number;
}

const REVERSAL_MAX_DATE_DISTANCE_DAYS = 10;
const REVERSAL_MIN_CONFIDENCE = 0.65;

/** Jaccard similarity over whitespace-separated tokens -- 0 for no shared words, 1 for identical text. */
function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersectionSize = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersectionSize++;
  const unionSize = tokensA.size + tokensB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Detects likely same-account reversal/refund pairs -- deliberately a
 * separate algorithm from matchTransfers, not a same-account call to it.
 * matchTransfers is tuned for cross-account transfers (amount-closeness +
 * date-closeness is a fine signal there, since a transfer's two legs really
 * are just "money leaving one account, arriving another"). A reversal is a
 * different claim -- "this specific charge got undone" -- and exact opposite
 * amount + nearby date is NOT sufficient evidence for that on its own (an
 * unrelated $15 fee and an unrelated $15 refund three weeks apart can
 * satisfy it by pure coincidence). So this requires, as hard gates before
 * any pair is even scored:
 *   - same account
 *   - EXACT opposite amount (not just close)
 *   - normalized merchant/description keys share at least one real word
 *     (token-overlap similarity > 0 -- catches "Store Purchase" / "Store
 *     Refund" as related, but a totally unrelated pair like an unrelated fee
 *     and an unrelated credit shares nothing and is disqualified outright,
 *     never becoming a scored candidate)
 *   - within a tightened date window (default 10 days, well under
 *     matchTransfers' cross-account default)
 * Merchant similarity is a gate, not a scored dimension -- once a pair has
 * clearly related text (any shared word) and the exact-amount/same-account/
 * date-window requirements, what actually separates a real reversal from a
 * coincidence is timing: date-closeness dominates the score, with a smaller
 * contribution from the pending/posted relationship (both pending on the
 * same day -- e.g. an authorization hold reversed same-day -- is the
 * strongest real-world signal, corroborating a match that's a few days out
 * rather than same-day). Only accepted above a high minimum confidence.
 * Prefers false negatives over false positives by design: a merchant
 * mismatch or a weak score simply produces no match at all, never a
 * low-confidence guess.
 */
export function matchReversals(
  events: ReversalCandidateEvent[],
  options?: { maxDateDistanceDays?: number; minConfidence?: number }
): ReversalMatchResult[] {
  const maxDateDistanceDays = options?.maxDateDistanceDays ?? REVERSAL_MAX_DATE_DISTANCE_DAYS;
  const minConfidence = options?.minConfidence ?? REVERSAL_MIN_CONFIDENCE;

  const candidates: ReversalMatchResult[] = [];

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];

      if (a.accountId !== b.accountId) continue;
      if (a.currency !== b.currency) continue;
      if (a.amount === 0 || b.amount === 0) continue;
      if (a.amount !== -b.amount) continue; // exact opposite required, not merely close
      if (!a.merchantKey || !b.merchantKey) continue;
      if (tokenSimilarity(a.merchantKey, b.merchantKey) <= 0) continue; // hard gate: zero word overlap disqualifies the pair outright

      const daysApart = daysBetween(a.date, b.date);
      if (daysApart > maxDateDistanceDays) continue;

      const dateScore = clamp01(1 - daysApart / maxDateDistanceDays);
      const pendingScore = a.pending && b.pending ? 1 : a.pending !== b.pending ? 0.5 : 0.25;
      const confidenceScore = clamp01(0.85 * dateScore + 0.15 * pendingScore);

      if (confidenceScore < minConfidence) continue;

      candidates.push({ aId: a.id, bId: b.id, confidenceScore, daysApart });
    }
  }

  candidates.sort((x, y) => {
    if (y.confidenceScore !== x.confidenceScore) return y.confidenceScore - x.confidenceScore;
    if (x.daysApart !== y.daysApart) return x.daysApart - y.daysApart;
    const xKey = `${x.aId}:${x.bId}`;
    const yKey = `${y.aId}:${y.bId}`;
    return xKey < yKey ? -1 : xKey > yKey ? 1 : 0;
  });

  const used = new Set<string>();
  const accepted: ReversalMatchResult[] = [];
  for (const candidate of candidates) {
    if (used.has(candidate.aId) || used.has(candidate.bId)) continue;
    used.add(candidate.aId);
    used.add(candidate.bId);
    accepted.push(candidate);
  }

  return accepted;
}

export interface CrossCurrencyTransferCandidate {
  aId: string;
  bId: string;
  daysApart: number;
}

/**
 * Identifies opposite-signed, different-account, DIFFERENT-currency pairs
 * within the date window, purely for a read-only "match manually" display —
 * never for auto-matching. A cross-currency transfer can't be scored on
 * amount closeness the way matchTransfers does (an FX conversion means the
 * two native amounts are never expected to be close), so this only ranks by
 * date proximity and does not return a confidence score.
 */
export function findPossibleCrossCurrencyTransfers(
  events: MoneyMovementEvent[],
  options?: { maxDateDistanceDays?: number; eligiblePair?: (a: MoneyMovementEvent, b: MoneyMovementEvent) => boolean }
): CrossCurrencyTransferCandidate[] {
  const maxDateDistanceDays = options?.maxDateDistanceDays ?? DEFAULT_MAX_DATE_DISTANCE_DAYS;

  const candidates: CrossCurrencyTransferCandidate[] = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];

      if (options?.eligiblePair && !options.eligiblePair(a, b)) continue;
      if (a.accountId === b.accountId) continue;
      if (a.currency === b.currency) continue;
      if (a.amount === 0 || b.amount === 0) continue;
      if (!((a.amount < 0 && b.amount > 0) || (a.amount > 0 && b.amount < 0))) continue;

      const daysApart = daysBetween(a.date, b.date);
      if (daysApart > maxDateDistanceDays) continue;

      candidates.push({ aId: a.id, bId: b.id, daysApart });
    }
  }

  candidates.sort((x, y) => x.daysApart - y.daysApart);

  const used = new Set<string>();
  const accepted: CrossCurrencyTransferCandidate[] = [];
  for (const candidate of candidates) {
    if (used.has(candidate.aId) || used.has(candidate.bId)) continue;
    used.add(candidate.aId);
    used.add(candidate.bId);
    accepted.push(candidate);
  }

  return accepted;
}
