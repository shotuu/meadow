import { describe, expect, it } from "vitest";
import { AccountType as PlaidAccountType, AccountSubtype } from "plaid";
import { mapAccountType } from "../accounts";

describe("mapAccountType", () => {
  it("maps a depository/checking account to checking", () => {
    expect(mapAccountType(PlaidAccountType.Depository, AccountSubtype.Checking)).toBe("checking");
  });

  it("maps a depository/savings account to savings", () => {
    expect(mapAccountType(PlaidAccountType.Depository, AccountSubtype.Savings)).toBe("savings");
  });

  it("maps a depository account with no subtype to checking", () => {
    expect(mapAccountType(PlaidAccountType.Depository, null)).toBe("checking");
  });

  it("maps a credit account to credit_card regardless of subtype", () => {
    expect(mapAccountType(PlaidAccountType.Credit, AccountSubtype.CreditCard)).toBe("credit_card");
  });

  it("maps a loan account to loan", () => {
    expect(mapAccountType(PlaidAccountType.Loan, AccountSubtype.Mortgage)).toBe("loan");
  });

  it("maps investment and brokerage accounts to brokerage", () => {
    expect(mapAccountType(PlaidAccountType.Investment, AccountSubtype._401k)).toBe("brokerage");
    expect(mapAccountType(PlaidAccountType.Brokerage, AccountSubtype.Brokerage)).toBe("brokerage");
  });

  it("falls back to other for an unrecognized type", () => {
    expect(mapAccountType(PlaidAccountType.Other, null)).toBe("other");
  });
});
