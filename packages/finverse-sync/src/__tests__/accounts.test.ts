import { describe, expect, it } from "vitest";
import type { Account } from "@finverse/sdk-typescript";
import { mapFinverseAccountType } from "../accounts";

function makeAccount(type?: string, subtype?: string): Account {
  return {
    account_id: "acc_1",
    group_id: "grp_1",
    account_name: "Test Account",
    is_parent: false,
    is_closed: false,
    is_excluded: false,
    metadata: {},
    account_type: type ? { type, subtype } : undefined,
  } as unknown as Account;
}

describe("mapFinverseAccountType", () => {
  it("maps a DEPOSIT/CURRENT account to checking", () => {
    expect(mapFinverseAccountType(makeAccount("DEPOSIT", "CURRENT"))).toBe("checking");
  });

  it("maps a DEPOSIT/SAVINGS account to savings", () => {
    expect(mapFinverseAccountType(makeAccount("DEPOSIT", "SAVINGS"))).toBe("savings");
  });

  it("maps a DEPOSIT/TIME_DEPOSIT account to savings", () => {
    expect(mapFinverseAccountType(makeAccount("DEPOSIT", "TIME_DEPOSIT"))).toBe("savings");
  });

  it("maps a CARD account to credit_card regardless of subtype", () => {
    expect(mapFinverseAccountType(makeAccount("CARD", "DEBIT_CARD"))).toBe("credit_card");
  });

  it("maps an INVESTMENT account to brokerage", () => {
    expect(mapFinverseAccountType(makeAccount("INVESTMENT", "SECURITIES"))).toBe("brokerage");
  });

  it("maps a LOAN account to loan", () => {
    expect(mapFinverseAccountType(makeAccount("LOAN", "MORTGAGE"))).toBe("loan");
  });

  it("falls back to other for an unrecognized or missing category", () => {
    expect(mapFinverseAccountType(makeAccount())).toBe("other");
    expect(mapFinverseAccountType(makeAccount("UNKNOWN"))).toBe("other");
  });
});
