import { describe, expect, it } from "vitest";
import { findPossibleCrossCurrencyTransfers, matchTransfers, type MoneyMovementEvent } from "../transfer-matching";

const event = (overrides: Partial<MoneyMovementEvent> & Pick<MoneyMovementEvent, "id">): MoneyMovementEvent => ({
  accountId: "acct-default",
  amount: 0,
  currency: "USD",
  date: new Date("2026-09-01"),
  ...overrides,
});

describe("matchTransfers", () => {
  it("matches an exact-amount, same-day pair across two accounts", () => {
    const events = [
      event({ id: "out", accountId: "bofa", amount: -100, date: new Date("2026-09-01") }),
      event({ id: "in", accountId: "card", amount: 100, date: new Date("2026-09-01") }),
    ];
    const result = matchTransfers(events);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ aId: "out", bId: "in", daysApart: 0 });
    expect(result[0].confidenceScore).toBeCloseTo(1, 5);
  });

  it("matches a near-amount pair with reduced confidence", () => {
    const events = [
      event({ id: "out", accountId: "bofa", amount: -100, date: new Date("2026-09-01") }),
      // $99 vs $100 -- close but not exact (simulates a rounding/fee difference).
      event({ id: "in", accountId: "card", amount: 99, date: new Date("2026-09-01") }),
    ];
    const result = matchTransfers(events, { minConfidence: 0.5 });
    expect(result).toHaveLength(1);
    expect(result[0].confidenceScore).toBeLessThan(1);
    expect(result[0].confidenceScore).toBeGreaterThan(0.9);
  });

  it("matches within the date window with reduced confidence", () => {
    const events = [
      event({ id: "out", accountId: "bofa", amount: -100, date: new Date("2026-09-01") }),
      event({ id: "in", accountId: "card", amount: 100, date: new Date("2026-09-04") }), // 3 days later
    ];
    const result = matchTransfers(events, { maxDateDistanceDays: 5 });
    expect(result).toHaveLength(1);
    expect(result[0].daysApart).toBe(3);
    expect(result[0].confidenceScore).toBeLessThan(1);
  });

  it("excludes a pair outside the date window", () => {
    const events = [
      event({ id: "out", accountId: "bofa", amount: -100, date: new Date("2026-09-01") }),
      event({ id: "in", accountId: "card", amount: 100, date: new Date("2026-09-10") }), // 9 days later
    ];
    const result = matchTransfers(events, { maxDateDistanceDays: 5 });
    expect(result).toHaveLength(0);
  });

  it("never matches same-account events", () => {
    const events = [
      event({ id: "out", accountId: "bofa", amount: -100, date: new Date("2026-09-01") }),
      event({ id: "in", accountId: "bofa", amount: 100, date: new Date("2026-09-01") }),
    ];
    expect(matchTransfers(events)).toHaveLength(0);
  });

  it("never matches different-currency events, even if amounts and dates align", () => {
    const events = [
      event({ id: "out", accountId: "ocbc", amount: -100, currency: "SGD", date: new Date("2026-09-01") }),
      event({ id: "in", accountId: "bofa", amount: 100, currency: "USD", date: new Date("2026-09-01") }),
    ];
    expect(matchTransfers(events)).toHaveLength(0);
  });

  it("never matches same-signed amounts", () => {
    const events = [
      event({ id: "a", accountId: "bofa", amount: -100, date: new Date("2026-09-01") }),
      event({ id: "b", accountId: "card", amount: -100, date: new Date("2026-09-01") }),
    ];
    expect(matchTransfers(events)).toHaveLength(0);
  });

  it("never matches a zero-amount event", () => {
    const events = [
      event({ id: "out", accountId: "bofa", amount: 0, date: new Date("2026-09-01") }),
      event({ id: "in", accountId: "card", amount: 0, date: new Date("2026-09-01") }),
    ];
    expect(matchTransfers(events)).toHaveLength(0);
  });

  it("excludes a pair below the minimum confidence floor", () => {
    const events = [
      event({ id: "out", accountId: "bofa", amount: -100, date: new Date("2026-09-01") }),
      // Wildly different amount -- should never be proposed as a match.
      event({ id: "in", accountId: "card", amount: 5, date: new Date("2026-09-01") }),
    ];
    expect(matchTransfers(events, { minConfidence: 0.6 })).toHaveLength(0);
  });

  it("greedily assigns the best match first and excludes an event from a second, worse pairing", () => {
    const events = [
      event({ id: "out", accountId: "bofa", amount: -100, date: new Date("2026-09-01") }),
      event({ id: "exact", accountId: "card", amount: 100, date: new Date("2026-09-01") }), // exact match
      event({ id: "close", accountId: "ibkr", amount: 100, date: new Date("2026-09-03") }), // worse match, same "out"
    ];
    const result = matchTransfers(events, { minConfidence: 0.5 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ aId: "out", bId: "exact" });
  });

  it("pairs up two independent transfers in the same batch without cross-contamination", () => {
    const events = [
      event({ id: "out1", accountId: "bofa", amount: -100, date: new Date("2026-09-01") }),
      event({ id: "in1", accountId: "card", amount: 100, date: new Date("2026-09-01") }),
      event({ id: "out2", accountId: "bofa", amount: -50, date: new Date("2026-09-02") }),
      event({ id: "in2", accountId: "ibkr", amount: 50, date: new Date("2026-09-02") }),
    ];
    const result = matchTransfers(events);
    expect(result).toHaveLength(2);
    const pairs = result.map((r) => [r.aId, r.bId].sort().join(","));
    expect(pairs).toContain(["in1", "out1"].sort().join(","));
    expect(pairs).toContain(["in2", "out2"].sort().join(","));
  });

  it("returns an empty array for an empty or single-event input", () => {
    expect(matchTransfers([])).toEqual([]);
    expect(matchTransfers([event({ id: "solo", amount: -100 })])).toEqual([]);
  });
});

describe("findPossibleCrossCurrencyTransfers", () => {
  it("flags an opposite-signed, different-currency pair within the window", () => {
    const events = [
      event({ id: "out", accountId: "ocbc", amount: -1000, currency: "SGD", date: new Date("2026-09-01") }),
      event({ id: "in", accountId: "bofa", amount: 778, currency: "USD", date: new Date("2026-09-02") }),
    ];
    const result = findPossibleCrossCurrencyTransfers(events);
    expect(result).toEqual([{ aId: "out", bId: "in", daysApart: 1 }]);
  });

  it("never flags a same-currency pair (that's matchTransfers' job)", () => {
    const events = [
      event({ id: "out", accountId: "bofa", amount: -100, currency: "USD", date: new Date("2026-09-01") }),
      event({ id: "in", accountId: "card", amount: 100, currency: "USD", date: new Date("2026-09-01") }),
    ];
    expect(findPossibleCrossCurrencyTransfers(events)).toEqual([]);
  });

  it("excludes a pair outside the date window", () => {
    const events = [
      event({ id: "out", accountId: "ocbc", amount: -1000, currency: "SGD", date: new Date("2026-09-01") }),
      event({ id: "in", accountId: "bofa", amount: 778, currency: "USD", date: new Date("2026-09-10") }),
    ];
    expect(findPossibleCrossCurrencyTransfers(events, { maxDateDistanceDays: 5 })).toEqual([]);
  });

  it("never flags same-account or same-signed pairs", () => {
    const sameAccount = [
      event({ id: "a", accountId: "ocbc", amount: -1000, currency: "SGD", date: new Date("2026-09-01") }),
      event({ id: "b", accountId: "ocbc", amount: 778, currency: "USD", date: new Date("2026-09-01") }),
    ];
    expect(findPossibleCrossCurrencyTransfers(sameAccount)).toEqual([]);

    const sameSign = [
      event({ id: "a", accountId: "ocbc", amount: -1000, currency: "SGD", date: new Date("2026-09-01") }),
      event({ id: "b", accountId: "bofa", amount: -778, currency: "USD", date: new Date("2026-09-01") }),
    ];
    expect(findPossibleCrossCurrencyTransfers(sameSign)).toEqual([]);
  });
});

describe("pair eligibility", () => {
  it("does not let unsupported investment pairs consume a bank match", () => {
    const events = [
      event({ id: "investment-out", accountId: "i1", amount: -100, date: new Date("2026-09-01") }),
      event({ id: "investment-in", accountId: "i2", amount: 100, date: new Date("2026-09-01") }),
      event({ id: "bank", accountId: "bank", amount: -100, date: new Date("2026-09-02") }),
    ];
    const result = matchTransfers(events, { eligiblePair: (a, b) => a.id === "bank" || b.id === "bank" });
    expect(result).toHaveLength(1);
    expect([result[0].aId, result[0].bId]).toContain("bank");
  });
});
