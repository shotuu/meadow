export type BudgetPeriodKind = "weekly" | "monthly" | "quarterly" | "annual";

export interface PeriodRange {
  /** Inclusive start of the period, UTC midnight. */
  start: Date;
  /** Exclusive end of the period, UTC midnight. */
  end: Date;
}

function utcMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

/**
 * Adds `months` calendar months to `date`, clamping day-of-month overflow
 * to the target month's last valid day (Jan 31 + 1 month -> Feb 28/29, not
 * a Date-object rollover to Mar 3) -- how billing-anniversary dates are
 * conventionally handled.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const targetMonthIndex = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), daysInTargetMonth);
  return utcMidnight(year, month, day);
}

/** Monday-start ISO week containing referenceDate. */
function weekStart(referenceDate: Date): Date {
  const d = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d;
}

/** Returns the period range (start inclusive, end exclusive) containing referenceDate. */
export function getPeriodRange(kind: BudgetPeriodKind, referenceDate: Date): PeriodRange {
  switch (kind) {
    case "weekly": {
      const start = weekStart(referenceDate);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      return { start, end };
    }
    case "monthly": {
      const start = utcMidnight(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1);
      const end = utcMidnight(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1);
      return { start, end };
    }
    case "quarterly": {
      const quarterMonth = Math.floor(referenceDate.getUTCMonth() / 3) * 3;
      const start = utcMidnight(referenceDate.getUTCFullYear(), quarterMonth, 1);
      const end = utcMidnight(referenceDate.getUTCFullYear(), quarterMonth + 3, 1);
      return { start, end };
    }
    case "annual": {
      const start = utcMidnight(referenceDate.getUTCFullYear(), 0, 1);
      const end = utcMidnight(referenceDate.getUTCFullYear() + 1, 0, 1);
      return { start, end };
    }
  }
}

/** Returns the period range immediately preceding the given period range. */
export function getPreviousPeriodRange(kind: BudgetPeriodKind, currentStart: Date): PeriodRange {
  const dayBeforeStart = new Date(currentStart);
  dayBeforeStart.setUTCDate(dayBeforeStart.getUTCDate() - 1);
  return getPeriodRange(kind, dayBeforeStart);
}

/**
 * Builds a chronological (oldest-first) chain of period ranges ending at
 * referenceDate's period, capped at maxPeriods entries.
 */
export function buildPeriodChain(
  kind: BudgetPeriodKind,
  referenceDate: Date,
  maxPeriods: number
): PeriodRange[] {
  const chain: PeriodRange[] = [];
  let current = getPeriodRange(kind, referenceDate);
  chain.push(current);
  while (chain.length < maxPeriods) {
    const prev = getPreviousPeriodRange(kind, current.start);
    chain.unshift(prev);
    current = prev;
  }
  return chain;
}

export type SpendRangeKind = "today" | "7d" | "30d" | "mtd" | "ytd";

/**
 * Resolves a user-facing "time elapsed" choice (today / last 7 days / last
 * 30 days / month-to-date / year-to-date) into a concrete [start, end)
 * range, end always exclusive-tomorrow so "today" is fully included.
 * Unlike getPeriodRange, "mtd"/"ytd" stop at now rather than running to the
 * end of the full calendar period -- there's no future data to include.
 */
export function resolveSpendRange(kind: SpendRangeKind, now: Date): PeriodRange {
  const todayStart = utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

  switch (kind) {
    case "today":
      return { start: todayStart, end: tomorrowStart };
    case "7d": {
      const start = new Date(todayStart);
      start.setUTCDate(start.getUTCDate() - 6);
      return { start, end: tomorrowStart };
    }
    case "30d": {
      const start = new Date(todayStart);
      start.setUTCDate(start.getUTCDate() - 29);
      return { start, end: tomorrowStart };
    }
    case "mtd": {
      const start = utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), 1);
      return { start, end: tomorrowStart };
    }
    case "ytd": {
      const start = utcMidnight(now.getUTCFullYear(), 0, 1);
      return { start, end: tomorrowStart };
    }
  }
}

/** Whole periods between asOfDate and deadlineDate (0 if deadline has passed). */
export function countPeriodsUntil(
  kind: BudgetPeriodKind,
  asOfDate: Date,
  deadlineDate: Date
): number {
  if (deadlineDate <= asOfDate) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntil = Math.round((deadlineDate.getTime() - asOfDate.getTime()) / msPerDay);
  const periodDays: Record<BudgetPeriodKind, number> = {
    weekly: 7,
    monthly: 30.44,
    quarterly: 91.31,
    annual: 365.25,
  };
  return Math.max(1, Math.ceil(daysUntil / periodDays[kind]));
}
