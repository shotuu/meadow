import { addMonthsClamped } from "./period";

export type ObligationFrequency =
  | "one_time"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export type ObligationPriority = "mandatory" | "planned" | "discretionary";

export type FundingStatus = "unfunded" | "partially_funded" | "fully_funded";

/** Computed live from amount vs. fundedAmount, never stored -- matches PrepaidCoverage's existing convention. */
export function classifyFundingStatus(amount: number, fundedAmount: number): FundingStatus {
  if (fundedAmount <= 0) return "unfunded";
  if (fundedAmount >= amount) return "fully_funded";
  return "partially_funded";
}

/**
 * Rolls a recurring obligation's due date forward by one interval once
 * marked paid. Returns null for `one_time` -- a one-time obligation has
 * nothing to advance to; the caller should deactivate it instead of
 * rescheduling. Deliberately a separate function from
 * computeNextExpectedDate in recurring.ts (conceptually similar, but that
 * function backs the already-production-running recurring-detection
 * system -- this stays independent so a change here can never regress it).
 */
export function advanceObligationDueDate(currentDueDate: Date, frequency: ObligationFrequency): Date | null {
  const next = new Date(currentDueDate);
  switch (frequency) {
    case "one_time":
      return null;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case "biweekly":
      next.setUTCDate(next.getUTCDate() + 14);
      return next;
    case "monthly":
      return addMonthsClamped(currentDueDate, 1);
    case "quarterly":
      return addMonthsClamped(currentDueDate, 3);
    case "semiannual":
      return addMonthsClamped(currentDueDate, 6);
    case "annual":
      return addMonthsClamped(currentDueDate, 12);
  }
}
