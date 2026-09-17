import { prisma, Prisma, type Budget, type Category } from "@finance-app/db";
import { getPeriodRange, buildPeriodChain, MAX_ROLLOVER_LOOKBACK_PERIODS, computeSafeToSpendPerDay, computePrepaidCoverageStatus, convertCurrency, type PeriodActuals, type PrepaidCoverageStatus } from "@finance-app/finance-logic";
import { readUsdRates } from "./fx";

// Only these two budget types are period-based on a genuine calendar cycle
// in the sense "this month" means -- sinking funds are deadline-based, not
// period-based, and prepaid coverage tracks a paid-through date, not a
// spending cap, so mixing either into a monthly remaining/spent total would
// misrepresent both. Shared by Home and Plan so they can never disagree
// about what counts toward "this month."
const MONTHLY_OVERVIEW_BUDGET_TYPES = ["monthly_reset", "rollover_envelope"] as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface MonthlyBudgetOverview {
  remaining: number;
  budgeted: number;
  spent: number;
  progressPct: number;
  daysRemaining: number;
  conversionIncomplete: boolean;
}

/**
 * Sums every category on a genuine calendar-month monthly_reset/
 * rollover_envelope budget, converted into defaultCurrency, into one
 * "Monthly budgets" figure -- the headline Home's "This month" section and
 * Plan's overview strip both show. Returns null when no such category
 * exists (nothing to summarize), never a fabricated zero.
 */
export async function computeMonthlyBudgetOverview(
  userId: string,
  now: Date,
  defaultCurrency: string,
  client: Prisma.TransactionClient = prisma
): Promise<MonthlyBudgetOverview | null> {
  const usdRates = await readUsdRates(now, client);
  const categoriesRaw = await client.category.findMany({
    where: { userId, isArchived: false, budgetType: { in: [...MONTHLY_OVERVIEW_BUDGET_TYPES] } },
    include: { budgets: { where: { effectiveTo: null }, take: 1 } },
  });
  const categories = categoriesRaw.filter((c) => c.budgets[0]?.period === "monthly");
  if (categories.length === 0) return null;

  const progresses = await Promise.all(
    categories.map((c) => computeRecurringBudgetProgress(userId, c, c.budgets[0]!, now, client))
  );

  let totalRemaining = 0;
  let totalBudgeted = 0;
  let totalSpent = 0;
  let conversionIncomplete = false;
  let periodEnd: Date | null = null;
  categories.forEach((c, i) => {
    const budget = c.budgets[0]!;
    const progress = progresses[i];
    if (progress.conversionIncomplete) conversionIncomplete = true;
    const remainingConverted = convertCurrency(progress.remaining, budget.currency, defaultCurrency, usdRates);
    const budgetedConverted = convertCurrency(Number(budget.amount), budget.currency, defaultCurrency, usdRates);
    const spentConverted = convertCurrency(progress.spent, budget.currency, defaultCurrency, usdRates);
    if (remainingConverted === null || budgetedConverted === null || spentConverted === null) {
      conversionIncomplete = true;
      return;
    }
    totalRemaining += remainingConverted;
    totalBudgeted += budgetedConverted;
    totalSpent += spentConverted;
    periodEnd = progress.periodEnd;
  });

  if (!periodEnd) return null;
  const daysRemaining = Math.max(0, Math.ceil(((periodEnd as Date).getTime() - now.getTime()) / MS_PER_DAY));
  const progressPct = totalBudgeted > 0 ? Math.min(100, Math.max(0, (totalSpent / totalBudgeted) * 100)) : 0;
  return { remaining: totalRemaining, budgeted: totalBudgeted, spent: totalSpent, progressPct, daysRemaining, conversionIncomplete };
}

export interface RecurringBudgetProgress {
  remaining: number; rolledOverAmount: number; periodEnd: Date; spent: number;
  safePerDay: number; progressValue: number; periods?: PeriodActuals[];
  /** true when at least one transaction in range couldn't be converted to the budget's currency (missing FX rate) and was excluded from spent/remaining -- those numbers may understate real spend. */
  conversionIncomplete: boolean;
}

/**
 * Spend is valued on its transaction day. Each allowance uses its
 * effective version. Accepts an optional transaction client so a caller
 * assembling several reads (e.g. an export) can run them all against one
 * consistent database snapshot instead of the default singleton.
 */
export async function computeRecurringBudgetProgress(
  userId: string, category: Pick<Category, "id" | "budgetType">,
  budget: Pick<Budget, "amount" | "currency" | "period" | "rolloverCap" | "effectiveFrom">,
  now: Date,
  client: Prisma.TransactionClient = prisma
): Promise<RecurringBudgetProgress> {
  const rollover = category.budgetType === "rollover_envelope";
  const versions = rollover ? await client.budget.findMany({
    where: { userId, categoryId: category.id, effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: "asc" },
  }) : [];
  const range = getPeriodRange(budget.period, now);
  // Never walk further back than MAX_ROLLOVER_LOOKBACK_PERIODS, even if the
  // category's budget history goes back further.
  const cappedStart = buildPeriodChain(budget.period, now, MAX_ROLLOVER_LOOKBACK_PERIODS)[0].start;
  const first = rollover && versions.length
    ? new Date(Math.max(versions[0].effectiveFrom.getTime(), cappedStart.getTime()))
    : range.start;
  if (versions.some((v) => v.period !== budget.period || v.currency !== budget.currency)) {
    throw new Error("Rollover history requires a consistent period and currency");
  }
  const transactions = await client.transaction.findMany({
    where: { userId, categoryId: category.id, isTransfer: false, pending: false, date: { gte: first, lt: range.end } },
    select: { date: true, amount: true, currency: true },
  });
  const rateCache = new Map<string, ReturnType<typeof readUsdRates>>();
  let conversionIncomplete = false;
  const converted = await Promise.all(transactions.map(async (t) => {
    if (t.currency === budget.currency) return { ...t, spent: -Number(t.amount) };
    const day = t.date.toISOString().slice(0, 10);
    if (!rateCache.has(day)) rateCache.set(day, readUsdRates(t.date, client));
    const rate = convertCurrency(Number(t.amount), t.currency, budget.currency, await rateCache.get(day)!);
    if (rate === null) {
      conversionIncomplete = true;
      return { ...t, spent: 0 };
    }
    return { ...t, spent: -rate };
  }));
  let carry = 0, remaining = 0, spent = 0, rolledOverAmount = 0, available = 0;
  const periods: PeriodActuals[] = [];
  for (let cursor = getPeriodRange(budget.period, first).start; cursor < range.end;) {
    const p = getPeriodRange(budget.period, cursor);
    const version = [...versions].reverse().find((v) => v.effectiveFrom < p.end && (!v.effectiveTo || v.effectiveTo >= p.start)) ?? budget;
    spent = converted.filter((t) => t.date >= p.start && t.date < p.end).reduce((sum, t) => sum + t.spent, 0);
    rolledOverAmount = rollover ? carry : 0;
    available = Number(version.amount) + rolledOverAmount;
    remaining = available - spent;
    carry = version.rolloverCap !== null ? Math.min(remaining, Number(version.rolloverCap)) : remaining;
    periods.push({ periodStart: p.start, periodEnd: p.end, spent });
    cursor = p.end;
  }
  return { remaining, rolledOverAmount, periodEnd: range.end, spent, periods,
    safePerDay: computeSafeToSpendPerDay(remaining, range.end, now),
    progressValue: available > 0 ? Math.min(100, Math.max(0, (spent / available) * 100)) : spent > 0 ? 100 : 0,
    conversionIncomplete };
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
  now: Date,
  client: Prisma.TransactionClient = prisma
): Promise<PrepaidCoverageStatus> {
  const lastPayment = await client.transaction.findFirst({
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
