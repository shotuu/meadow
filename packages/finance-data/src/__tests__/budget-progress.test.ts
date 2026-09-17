import { describe, expect, it, vi } from "vitest";
vi.mock("@finance-app/db", () => ({ prisma: {} }));
import { computeRecurringBudgetProgress } from "../budget-progress";

// A fake Prisma.TransactionClient exposing only what computeRecurringBudgetProgress
// actually touches (budget/transaction/exchangeRate finders) -- the function
// already accepts a client param for exactly this kind of dependency
// injection (see its own doc comment), so no real database is needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeClient(transactions: { date: Date; amount: number; currency: string }[]): any {
  return {
    budget: { findMany: vi.fn().mockResolvedValue([]) },
    transaction: { findMany: vi.fn().mockResolvedValue(transactions) },
    // No exchange rates at all -- every non-USD transaction's rate lookup misses.
    exchangeRate: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("computeRecurringBudgetProgress -- missing FX", () => {
  const category = { id: "cat1", budgetType: "monthly_reset" as const };
  const budget = {
    amount: 500,
    currency: "USD",
    period: "monthly" as const,
    rolloverCap: null,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const now = new Date("2026-01-15T00:00:00Z");

  it("never throws when a transaction's currency has no FX rate -- flags conversionIncomplete instead", async () => {
    const client = fakeClient([
      { date: new Date("2026-01-05"), amount: -50, currency: "USD" },
      { date: new Date("2026-01-06"), amount: -30, currency: "EUR" }, // unconvertible: no EUR rate
    ]);

    const progress = await computeRecurringBudgetProgress("user1", category, budget, now, client);

    expect(progress.conversionIncomplete).toBe(true);
    // The unconvertible EUR transaction is excluded from spend (0, not a crash and not a fabricated number).
    expect(progress.spent).toBe(50);
    expect(progress.remaining).toBe(450);
  });

  it("does not flag conversionIncomplete when every transaction matches the budget's own currency", async () => {
    const client = fakeClient([{ date: new Date("2026-01-05"), amount: -50, currency: "USD" }]);

    const progress = await computeRecurringBudgetProgress("user1", category, budget, now, client);

    expect(progress.conversionIncomplete).toBe(false);
    expect(progress.spent).toBe(50);
  });
});
