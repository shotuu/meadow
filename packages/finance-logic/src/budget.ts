import type { BudgetPeriodKind } from "./period";
import { countPeriodsUntil } from "./period";

export const MAX_ROLLOVER_LOOKBACK_PERIODS = 24;

export interface BudgetConfig {
  amount: number;
  period: BudgetPeriodKind;
  rolloverEnabled: boolean;
  rolloverCap?: number | null;
}

export interface PeriodActuals {
  periodStart: Date;
  periodEnd: Date;
  spent: number;
}

export interface BudgetComputationResult {
  periodStart: Date;
  periodEnd: Date;
  allotted: number;
  rolledOverAmount: number;
  spent: number;
  remaining: number;
}

/** budget_type = monthly_reset: no carryover between periods. */
export function computeMonthlyResetBudget(
  config: Pick<BudgetConfig, "amount">,
  actuals: PeriodActuals
): BudgetComputationResult {
  return {
    periodStart: actuals.periodStart,
    periodEnd: actuals.periodEnd,
    allotted: config.amount,
    rolledOverAmount: 0,
    spent: actuals.spent,
    remaining: config.amount - actuals.spent,
  };
}

/**
 * budget_type = rollover_envelope: unspent (or overspent) amount carries into
 * the next period. `periodsAscending` must be oldest-first and end at the
 * period being computed; callers should build it via `buildPeriodChain`
 * capped at MAX_ROLLOVER_LOOKBACK_PERIODS.
 */
export function computeRolloverEnvelopeBudget(
  config: Pick<BudgetConfig, "amount" | "rolloverCap">,
  periodsAscending: PeriodActuals[]
): BudgetComputationResult {
  if (periodsAscending.length === 0) {
    throw new Error("periodsAscending must contain at least the target period");
  }
  const periods = periodsAscending.slice(-MAX_ROLLOVER_LOOKBACK_PERIODS);

  let rolledOver = 0;
  let result: BudgetComputationResult | undefined;
  for (const p of periods) {
    const remaining = config.amount + rolledOver - p.spent;
    result = {
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      allotted: config.amount,
      rolledOverAmount: rolledOver,
      spent: p.spent,
      remaining,
    };
    rolledOver =
      config.rolloverCap != null ? Math.min(remaining, config.rolloverCap) : remaining;
  }
  return result!;
}

export interface SinkingFundConfig {
  targetAmount: number;
  currentBalance: number;
  deadlineDate: Date;
}

/**
 * budget_type = sinking_fund: deadline-based, not period-based. Returns the
 * contribution needed per `period` to reach targetAmount by deadlineDate.
 */
export function computeRequiredContribution(
  config: SinkingFundConfig,
  asOfDate: Date,
  period: BudgetPeriodKind
): number {
  const remainingAmount = config.targetAmount - config.currentBalance;
  if (remainingAmount <= 0) return 0;
  const periodsRemaining = countPeriodsUntil(period, asOfDate, config.deadlineDate);
  if (periodsRemaining <= 0) return remainingAmount;
  return remainingAmount / periodsRemaining;
}

/** Remaining flexible budget / days left in the period — the "safe to spend today" figure. */
export function computeSafeToSpendPerDay(remaining: number, periodEnd: Date, asOfDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(1, Math.ceil((periodEnd.getTime() - asOfDate.getTime()) / msPerDay));
  return remaining / daysRemaining;
}
