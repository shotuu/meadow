import type { ObligationPriority } from "./obligations";

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
