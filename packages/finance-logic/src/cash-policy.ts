import type { ObligationPriority } from "./obligations";

// Which FinancialAccount.type values count as spendable cash for the
// cash-vs-invested split (Home) and the cash-policy calculations below.
// This package can't import the AccountType Prisma enum (framework/DB-free
// by design), so callers with that type widen it structurally -- both
// existing call sites already did this via an identical local copy.
export const CASH_ACCOUNT_TYPES = ["checking", "savings", "cash"] as const;

export interface CashBalance {
  currency: string;
  balance: number;
}

export interface ReserveConfig {
  currency: string;
  targetAmount: number;
}

/**
 * Total cash minus reserved amount, per currency, floored at 0. Both
 * account-scoped and currency-wide reserves reduce the same currency-level
 * total -- an account-specific reserve still ties up that much cash
 * somewhere in that currency, which is what "uncommitted" is answering.
 */
export function computeUncommittedCash(
  cashBalances: CashBalance[],
  reserves: ReserveConfig[]
): Record<string, number> {
  const totalByCurrency = new Map<string, number>();
  for (const b of cashBalances) {
    totalByCurrency.set(b.currency, (totalByCurrency.get(b.currency) ?? 0) + b.balance);
  }
  const reservedByCurrency = new Map<string, number>();
  for (const r of reserves) {
    reservedByCurrency.set(r.currency, (reservedByCurrency.get(r.currency) ?? 0) + r.targetAmount);
  }

  const currencies = new Set([...totalByCurrency.keys(), ...reservedByCurrency.keys()]);
  const result: Record<string, number> = {};
  for (const currency of currencies) {
    const total = totalByCurrency.get(currency) ?? 0;
    const reserved = reservedByCurrency.get(currency) ?? 0;
    result[currency] = Math.max(0, total - reserved);
  }
  return result;
}

export interface ObligationForInvestableCash {
  currency: string;
  amount: number;
  fundedAmount: number;
  priority: ObligationPriority;
  nextDueDate: Date;
  isActive: boolean;
}

/**
 * Further nets out unfunded/underfunded MANDATORY obligations due within
 * `nearTermWindowDays` (default 30), on top of computeUncommittedCash's
 * result. Kept as a separate, separately-named function rather than folded
 * into computeUncommittedCash -- they answer different questions (an
 * ongoing liquidity floor vs. near-term commitments). Overdue obligations
 * (nextDueDate in the past) still count -- they're at least as urgent as
 * one due later in the window, not less.
 */
export function computeInvestableCash(
  uncommittedCashByCurrency: Record<string, number>,
  obligations: ObligationForInvestableCash[],
  now: Date,
  nearTermWindowDays = 30
): Record<string, number> {
  const msPerDay = 24 * 60 * 60 * 1000;
  const windowEnd = new Date(now.getTime() + nearTermWindowDays * msPerDay);

  const committedByCurrency = new Map<string, number>();
  for (const o of obligations) {
    if (!o.isActive) continue;
    if (o.priority !== "mandatory") continue;
    if (o.nextDueDate > windowEnd) continue;
    const remaining = o.amount - o.fundedAmount;
    if (remaining <= 0) continue;
    committedByCurrency.set(o.currency, (committedByCurrency.get(o.currency) ?? 0) + remaining);
  }

  const result: Record<string, number> = { ...uncommittedCashByCurrency };
  for (const [currency, committed] of committedByCurrency) {
    const base = result[currency] ?? 0;
    result[currency] = Math.max(0, base - committed);
  }
  return result;
}

export interface GenuinelyFreeCashLine {
  currency: string;
  /** Total cash in CASH_ACCOUNT_TYPES accounts, this currency, unmodified. */
  eligibleCash: number;
  /** The amount actually deducted for reserves -- capped at eligibleCash, never the raw configured target (see computeUncommittedCash's own floor-at-zero behavior). */
  reservedCash: number;
  /** The amount actually deducted for near-term mandatory obligations -- capped at the cash left after reserves. */
  relevantObligations: number;
  /** eligibleCash - reservedCash - relevantObligations, exactly. */
  genuinelyFree: number;
}

/**
 * Per-currency reconciliation of "what's genuinely free to use" --
 * eligibleCash / reservedCash / relevantObligations / genuinelyFree, where
 * the last three are DERIVED from computeUncommittedCash's and
 * computeInvestableCash's own real outputs (never a separate parallel
 * calculation), so eligibleCash - reservedCash - relevantObligations
 * equals genuinelyFree exactly, by construction, for every currency. This
 * is what a UI reconciliation view should render line-by-line -- see
 * cash-policy.test.ts for the identity check across cash-only, reserve-
 * exceeds-cash, and obligation-exceeds-uncommitted cases.
 *
 * Callers deciding whether to show this as a headline figure still need
 * their own completeness gate on top (e.g. "has the user entered at least
 * one CashReserve and one Obligation") -- this function only reconciles
 * the math for currencies that DO have data; it doesn't decide whether
 * that data is complete enough to trust as a consumer-facing answer.
 */
export function computeGenuinelyFreeCashByCurrency(
  cashBalances: CashBalance[],
  reserves: ReserveConfig[],
  obligations: ObligationForInvestableCash[],
  now: Date,
  nearTermWindowDays = 30
): GenuinelyFreeCashLine[] {
  const cashByCurrency = new Map<string, number>();
  for (const b of cashBalances) {
    cashByCurrency.set(b.currency, (cashByCurrency.get(b.currency) ?? 0) + b.balance);
  }

  const uncommitted = computeUncommittedCash(cashBalances, reserves);
  const investable = computeInvestableCash(uncommitted, obligations, now, nearTermWindowDays);

  const currencies = new Set([...Object.keys(uncommitted), ...Object.keys(investable)]);
  return [...currencies].map((currency) => {
    const eligibleCash = cashByCurrency.get(currency) ?? 0;
    const afterReserves = uncommitted[currency] ?? eligibleCash;
    const reservedCash = eligibleCash - afterReserves;
    const genuinelyFree = investable[currency] ?? afterReserves;
    const relevantObligations = afterReserves - genuinelyFree;
    return { currency, eligibleCash, reservedCash, relevantObligations, genuinelyFree };
  });
}
