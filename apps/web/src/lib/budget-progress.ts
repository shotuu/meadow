import { prisma, type Budget, type Category } from "@finance-app/db";
import {
  buildPeriodChain,
  computeMonthlyResetBudget,
  computePrepaidCoverageStatus,
  computeRolloverEnvelopeBudget,
  computeSafeToSpendPerDay,
  MAX_ROLLOVER_LOOKBACK_PERIODS,
  type BudgetPeriodKind,
  type PeriodActuals,
  type PrepaidCoverageStatus,
} from "@finance-app/finance-logic";

export interface RecurringBudgetProgress {
  remaining: number;
  rolledOverAmount: number;
  periodEnd: Date;
  spent: number;
  safePerDay: number;
  progressValue: number;
  periods?: PeriodActuals[];
}

function sumExpenseInRange(transactions: Array<{ date: Date; amount: unknown }>, start: Date, end: Date): number {
  return transactions
    .filter((t) => t.date >= start && t.date < end)
    .reduce((sum, t) => sum - Number(t.amount), 0); // expenses are stored as negative amounts; spend is positive
}

/**
 * Shared by budgets/page.tsx (every recurring budget) and dashboard/page.tsx
 * (pinned ones only) so the two pages can never silently disagree on what
 * "remaining" means for a given category -- this used to live inline in
 * the budgets page only.
 */
export async function computeRecurringBudgetProgress(
  userId: string,
  category: Pick<Category, "id" | "budgetType">,
  budget: Pick<Budget, "amount" | "period" | "rolloverCap" | "effectiveFrom">,
  now: Date
): Promise<RecurringBudgetProgress> {
  const period = budget.period as BudgetPeriodKind;

  if (category.budgetType === "rollover_envelope") {
    const fullChain = buildPeriodChain(period, now, MAX_ROLLOVER_LOOKBACK_PERIODS);
    const chain = fullChain.filter((p) => p.start >= budget.effectiveFrom);
    const usedChain = chain.length > 0 ? chain : [fullChain[fullChain.length - 1]];

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        categoryId: category.id,
        isTransfer: false,
        date: { gte: usedChain[0].start, lt: usedChain[usedChain.length - 1].end },
      },
      select: { date: true, amount: true },
    });

    const periods = usedChain.map((p) => ({
      periodStart: p.start,
      periodEnd: p.end,
      spent: sumExpenseInRange(transactions, p.start, p.end),
    }));

    const result = computeRolloverEnvelopeBudget(
      { amount: Number(budget.amount), rolloverCap: budget.rolloverCap ? Number(budget.rolloverCap) : null },
      periods
    );
    const available = Number(budget.amount) + result.rolledOverAmount;
    return {
      remaining: result.remaining,
      rolledOverAmount: result.rolledOverAmount,
      periodEnd: result.periodEnd,
      spent: result.spent,
      safePerDay: computeSafeToSpendPerDay(result.remaining, result.periodEnd, now),
      progressValue: available > 0 ? Math.min(100, (result.spent / available) * 100) : result.spent > 0 ? 100 : 0,
      periods,
    };
  }

  const range = buildPeriodChain(period, now, 1)[0];
  const transactions = await prisma.transaction.findMany({
    where: { userId, categoryId: category.id, isTransfer: false, date: { gte: range.start, lt: range.end } },
    select: { date: true, amount: true },
  });
  const result = computeMonthlyResetBudget(
    { amount: Number(budget.amount) },
    { periodStart: range.start, periodEnd: range.end, spent: sumExpenseInRange(transactions, range.start, range.end) }
  );
  const available = Number(budget.amount);
  return {
    remaining: result.remaining,
    rolledOverAmount: 0,
    periodEnd: result.periodEnd,
    spent: result.spent,
    safePerDay: computeSafeToSpendPerDay(result.remaining, result.periodEnd, now),
    progressValue: available > 0 ? Math.min(100, (result.spent / available) * 100) : result.spent > 0 ? 100 : 0,
  };
}

/**
 * budget_type = prepaid_coverage: queries the most recent *real charge*
 * (never a refund/credit -- amount < 0 excludes credits back, mirroring the
 * netSpendByCategory lesson that a credit must not be read as fresh spend
 * or, here, as a clock reset) and projects coverageMonths forward from it.
 */
export async function computePrepaidCoverageProgress(
  userId: string,
  categoryId: string,
  coverageMonths: number,
  now: Date
): Promise<PrepaidCoverageStatus> {
  const lastPayment = await prisma.transaction.findFirst({
    where: { userId, categoryId, isTransfer: false, amount: { lt: 0 } },
    orderBy: { date: "desc" },
    select: { date: true, amount: true },
  });

  return computePrepaidCoverageStatus(
    { coverageMonths },
    {
      lastPaymentDate: lastPayment?.date ?? null,
      lastPaymentAmount: lastPayment ? Math.abs(Number(lastPayment.amount)) : null,
    },
    now
  );
}
