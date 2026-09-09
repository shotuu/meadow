import { describe, expect, it } from "vitest";
import { mapCashTransactionType } from "../sync";

describe("mapCashTransactionType", () => {
  it("recognizes dividend regardless of case", () => {
    expect(mapCashTransactionType("Dividends")).toBe("dividend");
    expect(mapCashTransactionType("PAYMENT IN LIEU OF DIVIDEND")).toBe("dividend");
  });

  it("recognizes interest", () => {
    expect(mapCashTransactionType("Credit Interest")).toBe("interest");
  });

  it("recognizes fee-like types: fee, withholding, commission", () => {
    expect(mapCashTransactionType("Other Fees")).toBe("fee");
    expect(mapCashTransactionType("Withholding Tax")).toBe("fee");
    expect(mapCashTransactionType("Commission Adjustment")).toBe("fee");
  });

  it("returns null for an unrecognized type rather than mis-tagging it", () => {
    expect(mapCashTransactionType("Deposits/Withdrawals")).toBeNull();
  });
});
