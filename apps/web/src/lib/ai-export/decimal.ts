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
