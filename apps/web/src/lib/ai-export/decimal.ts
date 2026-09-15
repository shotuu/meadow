import type { Prisma } from "@finance-app/db";

/**
 * The only place export code turns a Prisma Decimal into a string. Every
 * exact monetary field in the export goes through this, never through
 * Number() or apps/web/src/lib/format.ts (UI-display-only, already lossy
 * by design) -- .toString() preserves the ledger-exact value.
 */
export function toDecimalString(value: Prisma.Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}

/**
 * Rounds an FX-converted/computed ("Approx") money figure to 2 decimal
 * places -- matches this app's own established .toFixed(2) convention
 * (dashboard, alerts, etc.) and eliminates the float noise (e.g.
 * 37833.41999999999) that raw arithmetic on converted currency produces.
 * Never applied to an exact Decimal string -- only to already-approximate
 * numbers.
 */
export function roundMoney(value: number): number;
export function roundMoney(value: number | null): number | null;
export function roundMoney(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

/** Same rounding discipline for percentages -- matches the app's .toFixed(1) convention for weight/drift percentages. */
export function roundPct(value: number): number;
export function roundPct(value: number | null): number | null;
export function roundPct(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}
