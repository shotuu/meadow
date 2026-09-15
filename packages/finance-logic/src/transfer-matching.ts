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

  const candidates: TransferMatchResult[] = [];

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];

      if (options?.eligiblePair && !options.eligiblePair(a, b)) continue;
      if (a.accountId === b.accountId) continue;
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
