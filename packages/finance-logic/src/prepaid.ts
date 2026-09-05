import { addMonthsClamped } from "./period";

export interface PrepaidCoverageConfig {
  coverageMonths: number;
}

export interface PrepaidCoverageActuals {
  /** Most recent real charge (not a refund/credit) in this category, or null if none has ever occurred. */
  lastPaymentDate: Date | null;
  lastPaymentAmount: number | null;
}

export interface PrepaidCoverageStatus {
  /** Null when there has never been a payment -- nothing to project a coverage window from. */
  paidThrough: Date | null;
  /** Days remaining until paidThrough, negative once lapsed. Null when lastPaymentDate is null. */
  daysRemaining: number | null;
  isOverdue: boolean;
  lastPaymentDate: Date | null;
  lastPaymentAmount: number | null;
}

/**
 * budget_type = prepaid_coverage: instead of a period-reset spending cap,
 * projects coverageMonths forward from the most recent real payment to
 * answer "am I already covered" rather than "how much have I spent this
 * period." The caller must only ever pass a real charge as
 * actuals.lastPaymentDate/lastPaymentAmount, never a refund/credit -- this
 * function has no visibility into transaction sign, so a credit sneaking
 * in here would incorrectly reset the coverage clock.
 */
export function computePrepaidCoverageStatus(
  config: PrepaidCoverageConfig,
  actuals: PrepaidCoverageActuals,
  asOfDate: Date
): PrepaidCoverageStatus {
  if (actuals.lastPaymentDate === null) {
    return {
      paidThrough: null,
      daysRemaining: null,
      // No payment on record is "unknown," not "overdue" -- the UI must
      // treat this as a distinct third state, not red-alarm styling.
      isOverdue: false,
      lastPaymentDate: null,
      lastPaymentAmount: null,
    };
  }

  const paidThrough = addMonthsClamped(actuals.lastPaymentDate, config.coverageMonths);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.floor((paidThrough.getTime() - asOfDate.getTime()) / msPerDay);

  return {
    paidThrough,
    daysRemaining,
    isOverdue: daysRemaining < 0,
    lastPaymentDate: actuals.lastPaymentDate,
    lastPaymentAmount: actuals.lastPaymentAmount,
  };
}
