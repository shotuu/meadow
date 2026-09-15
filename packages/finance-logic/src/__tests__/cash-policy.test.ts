import { describe, expect, it } from "vitest";
import { computeInvestableCash, computeUncommittedCash } from "../cash-policy";

describe("computeUncommittedCash", () => {
  it("subtracts a single reserve from total cash in that currency", () => {
    const result = computeUncommittedCash(
      [{ currency: "SGD", balance: 35000 }],
      [{ currency: "SGD", targetAmount: 20000 }]
    );
    expect(result).toEqual({ SGD: 15000 });
  });

  it("sums multiple cash balances and multiple reserves in the same currency", () => {
    const result = computeUncommittedCash(
      [
        { currency: "USD", balance: 10000 },
        { currency: "USD", balance: 5000 },
      ],
      [
        { currency: "USD", targetAmount: 3000 },
        { currency: "USD", targetAmount: 2000 },
      ]
    );
    expect(result).toEqual({ USD: 10000 });
  });

  it("handles multiple currencies independently", () => {
    const result = computeUncommittedCash(
      [
        { currency: "SGD", balance: 35000 },
        { currency: "USD", balance: 18400 },
      ],
      [{ currency: "SGD", targetAmount: 20000 }]
    );
    expect(result).toEqual({ SGD: 15000, USD: 18400 });
  });

  it("floors at zero when reserves exceed cash", () => {
    const result = computeUncommittedCash([{ currency: "SGD", balance: 5000 }], [{ currency: "SGD", targetAmount: 20000 }]);
    expect(result).toEqual({ SGD: 0 });
  });

  it("floors at zero for a reserve configured in a currency with no cash at all", () => {
    const result = computeUncommittedCash([], [{ currency: "EUR", targetAmount: 1000 }]);
    expect(result).toEqual({ EUR: 0 });
  });

  it("returns cash untouched for a currency with no reserve configured", () => {
    const result = computeUncommittedCash([{ currency: "USD", balance: 500 }], []);
    expect(result).toEqual({ USD: 500 });
  });
});

describe("computeInvestableCash", () => {
  const now = new Date("2026-09-14");

  it("nets out a mandatory obligation due within the window", () => {
    const result = computeInvestableCash(
      { USD: 10000 },
      [
        {
          currency: "USD",
          amount: 2499.3,
          fundedAmount: 0,
          priority: "mandatory",
          nextDueDate: new Date("2026-09-20"),
          isActive: true,
        },
      ],
      now,
      30
    );
    expect(result.USD).toBeCloseTo(10000 - 2499.3, 5);
  });

  it("ignores a mandatory obligation due outside the window", () => {
    const result = computeInvestableCash(
      { USD: 10000 },
      [
        {
          currency: "USD",
          amount: 2499.3,
          fundedAmount: 0,
          priority: "mandatory",
          nextDueDate: new Date("2026-12-01"),
          isActive: true,
        },
      ],
      now,
      30
    );
    expect(result.USD).toBe(10000);
  });

  it("still counts an overdue mandatory obligation as near-term", () => {
    const result = computeInvestableCash(
      { USD: 10000 },
      [
        {
          currency: "USD",
          amount: 500,
          fundedAmount: 0,
          priority: "mandatory",
          nextDueDate: new Date("2026-08-01"), // already overdue relative to `now`
          isActive: true,
        },
      ],
      now,
      30
    );
    expect(result.USD).toBe(9500);
  });

  it("ignores planned and discretionary obligations regardless of due date", () => {
    const result = computeInvestableCash(
      { USD: 10000 },
      [
        {
          currency: "USD",
          amount: 500,
          fundedAmount: 0,
          priority: "planned",
          nextDueDate: new Date("2026-09-20"),
          isActive: true,
        },
        {
          currency: "USD",
          amount: 200,
          fundedAmount: 0,
          priority: "discretionary",
          nextDueDate: new Date("2026-09-20"),
          isActive: true,
        },
      ],
      now,
      30
    );
    expect(result.USD).toBe(10000);
  });

  it("ignores an inactive obligation", () => {
    const result = computeInvestableCash(
      { USD: 10000 },
      [
        {
          currency: "USD",
          amount: 500,
          fundedAmount: 0,
          priority: "mandatory",
          nextDueDate: new Date("2026-09-20"),
          isActive: false,
        },
      ],
      now,
      30
    );
    expect(result.USD).toBe(10000);
  });

  it("only nets out the unfunded remainder of a partially-funded obligation", () => {
    const result = computeInvestableCash(
      { USD: 10000 },
      [
        {
          currency: "USD",
          amount: 1000,
          fundedAmount: 400,
          priority: "mandatory",
          nextDueDate: new Date("2026-09-20"),
          isActive: true,
        },
      ],
      now,
      30
    );
    expect(result.USD).toBe(10000 - 600);
  });

  it("ignores a fully-funded obligation entirely", () => {
    const result = computeInvestableCash(
      { USD: 10000 },
      [
        {
          currency: "USD",
          amount: 1000,
          fundedAmount: 1000,
          priority: "mandatory",
          nextDueDate: new Date("2026-09-20"),
          isActive: true,
        },
      ],
      now,
      30
    );
    expect(result.USD).toBe(10000);
  });

  it("floors at zero when obligations exceed uncommitted cash", () => {
    const result = computeInvestableCash(
      { USD: 100 },
      [
        {
          currency: "USD",
          amount: 500,
          fundedAmount: 0,
          priority: "mandatory",
          nextDueDate: new Date("2026-09-20"),
          isActive: true,
        },
      ],
      now,
      30
    );
    expect(result.USD).toBe(0);
  });
});
