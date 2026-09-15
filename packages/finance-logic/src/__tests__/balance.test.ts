import { describe, expect, it } from "vitest";
import { computeAccountBalance } from "../balance";

describe("computeAccountBalance", () => {
  it("uses the transaction sum for a manual account", () => {
    const result = computeAccountBalance({
      syncSource: "manual",
      transactionSum: 1234.56,
      currentBalance: null,
      holdingsSum: null,
    });
    expect(result).toEqual({ balance: 1234.56, method: "transaction_sum" });
  });

  it("uses the transaction sum for a CSV account", () => {
    const result = computeAccountBalance({
      syncSource: "csv",
      transactionSum: -50,
      currentBalance: null,
      holdingsSum: null,
    });
    expect(result).toEqual({ balance: -50, method: "transaction_sum" });
  });

  it("prefers the institution-reported balance for a Plaid account once synced", () => {
    const result = computeAccountBalance({
      syncSource: "plaid",
      transactionSum: 100,
      currentBalance: 250.75,
      holdingsSum: null,
    });
    expect(result).toEqual({ balance: 250.75, method: "institution_reported" });
  });

  it("prefers the institution-reported balance for a Finverse account once synced", () => {
    const result = computeAccountBalance({
      syncSource: "finverse",
      transactionSum: 100,
      currentBalance: 35000,
      holdingsSum: null,
    });
    expect(result).toEqual({ balance: 35000, method: "institution_reported" });
  });

  it("falls back to the transaction sum for a Plaid account before its first balance refresh", () => {
    const result = computeAccountBalance({
      syncSource: "plaid",
      transactionSum: 42.5,
      currentBalance: null,
      holdingsSum: null,
    });
    expect(result).toEqual({ balance: 42.5, method: "transaction_sum" });
  });

  it("falls back to the transaction sum for a Finverse account before its first balance refresh", () => {
    const result = computeAccountBalance({
      syncSource: "finverse",
      transactionSum: 42.5,
      currentBalance: null,
      holdingsSum: null,
    });
    expect(result).toEqual({ balance: 42.5, method: "transaction_sum" });
  });

  it("uses the holdings sum for an IBKR account even when a transaction sum is present", () => {
    const result = computeAccountBalance({
      syncSource: "ibkr_flex",
      transactionSum: 999999, // should never happen in practice (IBKR accounts have no transactions), but must not leak in
      currentBalance: null,
      holdingsSum: 35195.84,
    });
    expect(result).toEqual({ balance: 35195.84, method: "holdings_derived" });
  });

  it("treats a null holdings sum as zero for an IBKR account with no holdings yet", () => {
    const result = computeAccountBalance({
      syncSource: "ibkr_flex",
      transactionSum: 0,
      currentBalance: null,
      holdingsSum: null,
    });
    expect(result).toEqual({ balance: 0, method: "holdings_derived" });
  });

  it("prefers holdings-derived over institution-reported for an ibkr_flex account, since IBKR never sets currentBalance", () => {
    const result = computeAccountBalance({
      syncSource: "ibkr_flex",
      transactionSum: 0,
      currentBalance: 100, // should never actually be set for ibkr_flex, but precedence must still hold
      holdingsSum: 500,
    });
    expect(result).toEqual({ balance: 500, method: "holdings_derived" });
  });
});
