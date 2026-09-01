export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual" | "irregular";

export interface RecurringDetectionInput {
  /** Ascending order, same normalized merchant, transfers excluded. */
  occurrenceDates: Date[];
  /** Same order/length as occurrenceDates. */
  amounts: number[];
}

export interface RecurringDetectionResult {
  cadence: Cadence;
  cadenceConfidence: number;
  amountConfidence: number;
  combinedConfidence: number;
  medianAmount: number;
  medianIntervalDays: number;
  occurrenceCount: number;
}

export type RecurringClassification = "active" | "possible" | "discard";

const MIN_OCCURRENCES = 3;
const ACTIVE_THRESHOLD = 0.6;
const POSSIBLE_THRESHOLD = 0.35;
const AMOUNT_CV_NORMALIZER = 0.2;
const COUNT_BONUS_SATURATION = 8;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Median absolute deviation — robust to one-off outliers, unlike stddev. */
function medianAbsoluteDeviation(values: number[], med: number): number {
  return median(values.map((v) => Math.abs(v - med)));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

const CADENCE_BUCKETS: Array<[Cadence, number, number]> = [
  ["weekly", 5, 9],
  ["biweekly", 11, 17],
  ["monthly", 26, 34],
  ["quarterly", 81, 101],
  ["annual", 350, 380],
];

function bucketCadence(medianIntervalDays: number): Cadence {
  for (const [name, lo, hi] of CADENCE_BUCKETS) {
    if (medianIntervalDays >= lo && medianIntervalDays <= hi) return name;
  }
  return "irregular";
}

/**
 * Scores a group of same-merchant transactions for how likely they represent
 * a recurring subscription/charge. Returns null if there isn't enough
 * history to judge (fewer than 3 occurrences).
 */
export function detectRecurring(input: RecurringDetectionInput): RecurringDetectionResult | null {
  const { occurrenceDates, amounts } = input;
  if (occurrenceDates.length < MIN_OCCURRENCES || occurrenceDates.length !== amounts.length) {
    return null;
  }

  const intervals: number[] = [];
  for (let i = 1; i < occurrenceDates.length; i++) {
    intervals.push(daysBetween(occurrenceDates[i - 1], occurrenceDates[i]));
  }
  const medianInterval = median(intervals);
  const madInterval = medianAbsoluteDeviation(intervals, medianInterval);
  const cadenceConfidence =
    medianInterval === 0 ? 0 : clamp01(1 - madInterval / medianInterval);

  const absAmounts = amounts.map(Math.abs);
  const medAmount = median(absAmounts);
  const madAmount = medianAbsoluteDeviation(absAmounts, medAmount);
  const coefficientOfVariation = medAmount === 0 ? 0 : madAmount / medAmount;
  const amountConfidence = clamp01(1 - Math.min(1, coefficientOfVariation / AMOUNT_CV_NORMALIZER));

  const countBonus = clamp01(occurrenceDates.length / COUNT_BONUS_SATURATION);
  const combinedConfidence = clamp01(
    0.5 * cadenceConfidence + 0.3 * amountConfidence + 0.2 * countBonus
  );

  return {
    cadence: bucketCadence(medianInterval),
    cadenceConfidence,
    amountConfidence,
    combinedConfidence,
    medianAmount: medAmount,
    medianIntervalDays: medianInterval,
    occurrenceCount: occurrenceDates.length,
  };
}

export function classifyConfidence(combinedConfidence: number): RecurringClassification {
  if (combinedConfidence >= ACTIVE_THRESHOLD) return "active";
  if (combinedConfidence >= POSSIBLE_THRESHOLD) return "possible";
  return "discard";
}

/** Calendar-aware "next expected date" — adds whole calendar units, not raw day counts. */
export function computeNextExpectedDate(lastSeenDate: Date, cadence: Cadence): Date | null {
  const next = new Date(lastSeenDate);
  switch (cadence) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case "biweekly":
      next.setUTCDate(next.getUTCDate() + 14);
      return next;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      return next;
    case "annual":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      return next;
    case "irregular":
      return null;
  }
}

/** True when a series should be flagged "missed" — i.e. overdue past a 1.5x-interval grace window. */
export function isMissed(nextExpectedDate: Date, cadence: Cadence, asOfDate: Date): boolean {
  if (cadence === "irregular") return false;
  const intervalDays: Record<Exclude<Cadence, "irregular">, number> = {
    weekly: 7,
    biweekly: 14,
    monthly: 30,
    quarterly: 91,
    annual: 365,
  };
  const graceDays = intervalDays[cadence] * 1.5;
  const graceDeadline = new Date(nextExpectedDate);
  graceDeadline.setUTCDate(graceDeadline.getUTCDate() + graceDays);
  return asOfDate > graceDeadline;
}

/**
 * Converts a recurring amount to its monthly-equivalent value (e.g. an
 * annual charge divided by 12). `irregular` has no fixed period, so callers
 * should exclude those series before calling this rather than passing them
 * in.
 */
export function computeMonthlyEquivalent(amount: number, cadence: Exclude<Cadence, "irregular">): number {
  const monthsPerOccurrence: Record<Exclude<Cadence, "irregular">, number> = {
    weekly: 12 / 52,
    biweekly: 12 / 26,
    monthly: 1,
    quarterly: 3,
    annual: 12,
  };
  return amount / monthsPerOccurrence[cadence];
}

/** Normalizes a raw merchant/description string into a stable grouping key. */
export function normalizeMerchantKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^(sq|tst|sp|pp|paypal)\s*[\*#]\s*/i, "")
    .replace(/[\*#]\s*\d+.*/g, "")
    .replace(/\b\d{3,}\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
