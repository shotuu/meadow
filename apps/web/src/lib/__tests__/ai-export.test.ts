import { describe, expect, it } from "vitest";
import type { Prisma } from "@finance-app/db";
import { buildCategoryPath, buildAccountLabel } from "../ai-export/allowlist";
import { toDecimalString, roundMoney, roundPct } from "../ai-export/decimal";
import { classifyIncome, isLikelyRefundText } from "../ai-export/income-classify";
import {
  redactAccountHolderName,
  redactP2pCounterparty,
  redactPrivacySafeText,
  redactReferenceNumbers,
  stripAccountNumberSuffix,
} from "../ai-export/redact";

/** A minimal Decimal-shaped stub -- avoids pulling in the real @finance-app/db
 * runtime (which eagerly constructs a PrismaClient) for what's otherwise a
 * pure-function test, matching this test tier's existing DB-free convention. */
function fakeDecimal(value: string): Prisma.Decimal {
  return { toString: () => value } as Prisma.Decimal;
}

describe("buildCategoryPath", () => {
  it("returns null for an uncategorized row", () => {
    expect(buildCategoryPath(null)).toBeNull();
  });

  it("returns just the name for a top-level category", () => {
    expect(buildCategoryPath({ name: "Food", parentCategory: null })).toBe("Food");
  });

  it("joins parent and child with '>' for a subcategory", () => {
    expect(buildCategoryPath({ name: "Groceries", parentCategory: { name: "Food" } })).toBe("Food > Groceries");
  });
});

describe("buildAccountLabel", () => {
  it("uses the institution name when present", () => {
    expect(buildAccountLabel({ name: "Checking", institutionName: "Chase" })).toBe("Chase — Checking");
  });

  it("falls back to 'Manual' when there's no institution (manual/CSV accounts)", () => {
    expect(buildAccountLabel({ name: "Cash Wallet", institutionName: null })).toBe("Manual — Cash Wallet");
    expect(buildAccountLabel({ name: "Cash Wallet" })).toBe("Manual — Cash Wallet");
  });
});

describe("toDecimalString", () => {
  it("returns null for null or undefined", () => {
    expect(toDecimalString(null)).toBeNull();
    expect(toDecimalString(undefined)).toBeNull();
  });

  it("preserves exact decimal precision, unlike Number()", () => {
    expect(toDecimalString(fakeDecimal("156.1385146"))).toBe("156.1385146");
  });
});

describe("roundMoney", () => {
  it("rounds float-noise artifacts to 2 decimal places", () => {
    expect(roundMoney(37833.41999999999)).toBe(37833.42);
    expect(roundMoney(9.550000000000011)).toBe(9.55);
  });

  it("passes null through unchanged", () => {
    expect(roundMoney(null)).toBeNull();
  });
});

describe("roundPct", () => {
  it("rounds to 1 decimal place", () => {
    expect(roundPct(15.241331629250027)).toBe(15.2);
  });

  it("passes null through unchanged", () => {
    expect(roundPct(null)).toBeNull();
  });
});

describe("classifyIncome", () => {
  const base = { amount: 100, isTransfer: false, description: "", merchantName: null, activeIncomeStreamNames: [], isLinkedToRecurringSeries: false };

  it("classifies a transfer as transfer/high regardless of amount", () => {
    expect(classifyIncome({ ...base, isTransfer: true })).toEqual({ incomeType: "transfer", confidence: "high", matchedIncomeStreamName: null });
  });

  it("returns null/null for a non-positive amount", () => {
    expect(classifyIncome({ ...base, amount: -10 })).toEqual({ incomeType: null, confidence: null, matchedIncomeStreamName: null });
    expect(classifyIncome({ ...base, amount: 0 })).toEqual({ incomeType: null, confidence: null, matchedIncomeStreamName: null });
  });

  it("matches an active income stream by name at high confidence, and names the matched stream", () => {
    const result = classifyIncome({ ...base, description: "ACME CORP PAYROLL", activeIncomeStreamNames: ["Acme Corp"] });
    expect(result).toEqual({ incomeType: "employment_wages", confidence: "high", matchedIncomeStreamName: "Acme Corp" });
  });

  it("distinguishes a scholarship-named income stream from wages", () => {
    const result = classifyIncome({ ...base, description: "UCLA SCHOLARSHIP DISBURSEMENT", activeIncomeStreamNames: ["UCLA Scholarship"] });
    expect(result).toEqual({ incomeType: "scholarship_allowance", confidence: "high", matchedIncomeStreamName: "UCLA Scholarship" });
  });

  it("recognizes refund/reimbursement/investment-income keywords at medium confidence, with no matched stream", () => {
    expect(classifyIncome({ ...base, description: "MERCHANT REFUND" })).toEqual({ incomeType: "refund", confidence: "medium", matchedIncomeStreamName: null });
    expect(classifyIncome({ ...base, description: "EXPENSE REPORT REIMB" })).toEqual({ incomeType: "reimbursement", confidence: "medium", matchedIncomeStreamName: null });
    expect(classifyIncome({ ...base, description: "DIVIDEND PAYMENT" })).toEqual({ incomeType: "investment_income", confidence: "medium", matchedIncomeStreamName: null });
  });

  it("falls back to a recurring-series link at medium confidence, then other/low with no signal at all -- neither is a matched stream", () => {
    expect(classifyIncome({ ...base, description: "UNKNOWN DEPOSIT", isLinkedToRecurringSeries: true })).toEqual({ incomeType: "employment_wages", confidence: "medium", matchedIncomeStreamName: null });
    expect(classifyIncome({ ...base, description: "UNKNOWN DEPOSIT" })).toEqual({ incomeType: "other", confidence: "low", matchedIncomeStreamName: null });
  });
});

describe("isLikelyRefundText", () => {
  it("matches refund and reimbursement keywords case-insensitively", () => {
    expect(isLikelyRefundText("Merchant Refund")).toBe(true);
    expect(isLikelyRefundText("expense reimb")).toBe(true);
    expect(isLikelyRefundText("Coffee Shop")).toBe(false);
  });
});

describe("redactReferenceNumbers", () => {
  it("redacts a long digit-containing reference number while keeping the rest of the text", () => {
    expect(redactReferenceNumbers("UCLA PAYROLL DEP 000482910334")).toBe("UCLA PAYROLL DEP [redacted]");
  });

  it("never redacts a pure-alphabetic merchant name, even a long one", () => {
    expect(redactReferenceNumbers("STARBUCKS")).toBe("STARBUCKS");
    expect(redactReferenceNumbers("WHOLEFOODSMARKET")).toBe("WHOLEFOODSMARKET");
  });

  it("leaves short tokens and dates alone", () => {
    expect(redactReferenceNumbers("2026-09-15 UCLA")).toBe("2026-09-15 UCLA");
  });
});

describe("redactP2pCounterparty", () => {
  it("redacts a Zelle 'from' counterparty while keeping the service and direction", () => {
    expect(redactP2pCounterparty("Zelle payment from JANE SMITH Conf# 000482910334")).toBe(
      "Zelle payment from [person] Conf# 000482910334"
    );
  });

  it("redacts a Zelle 'to' counterparty", () => {
    expect(redactP2pCounterparty("Zelle payment to JOHN DOE")).toBe("Zelle payment to [person]");
  });

  it("redacts a semicolon-trailing name in a real Zelle transfer-confirmation shape", () => {
    expect(redactP2pCounterparty("ZELLE TRANSFER CONF# 99CWNC4CJ; LINA PHAM")).toBe(
      "ZELLE TRANSFER CONF# 99CWNC4CJ; [person]"
    );
  });

  it("handles Venmo and Cash App the same way", () => {
    expect(redactP2pCounterparty("Venmo transfer from Alex Rivera")).toBe("Venmo transfer from [person]");
    expect(redactP2pCounterparty("Cash App from Sam Lee")).toBe("Cash App from [person]");
  });

  it("never touches a description with no P2P service name, even with a from/to-shaped run", () => {
    expect(redactP2pCounterparty("Transfer from Savings to Checking")).toBe("Transfer from Savings to Checking");
  });

  it("never touches an ordinary merchant description", () => {
    expect(redactP2pCounterparty("APPLE.COM/BILL")).toBe("APPLE.COM/BILL");
    expect(redactP2pCounterparty("Spotify USA")).toBe("Spotify USA");
    expect(redactP2pCounterparty("UCLA STUDENT STORE")).toBe("UCLA STUDENT STORE");
  });

  it("does not sweep a lowercase conjunction into the name run", () => {
    expect(redactP2pCounterparty("Zelle payment from Jane and the group")).toBe("Zelle payment from [person] and the group");
  });
});

describe("redactAccountHolderName", () => {
  it("redacts the account holder's full name in a payroll description", () => {
    expect(redactAccountHolderName("UCLA PAYROLL DEP JANE STUDENT", "Jane Student")).toBe("UCLA PAYROLL DEP [account holder]");
  });

  it("is case-insensitive", () => {
    expect(redactAccountHolderName("wire transfer jane student ref", "Jane Student")).toBe("wire transfer [account holder] ref");
  });

  it("does nothing when the name is null or not present in the text", () => {
    expect(redactAccountHolderName("UCLA PAYROLL DEP", null)).toBe("UCLA PAYROLL DEP");
    expect(redactAccountHolderName("Coffee Shop", "Jane Student")).toBe("Coffee Shop");
  });

  it("does not partially redact an unrelated merchant sharing only a first name", () => {
    expect(redactAccountHolderName("JANE'S BAKERY", "Jane Student")).toBe("JANE'S BAKERY");
  });
});

describe("stripAccountNumberSuffix", () => {
  it("strips a trailing account-number-like suffix", () => {
    expect(stripAccountNumberSuffix("Adv SafeBalance Checking 3106")).toBe("Adv SafeBalance Checking");
  });

  it("strips a parenthesized or dashed suffix", () => {
    expect(stripAccountNumberSuffix("Checking (1234)")).toBe("Checking");
    expect(stripAccountNumberSuffix("Checking - 1234")).toBe("Checking");
    expect(stripAccountNumberSuffix("Checking x1234")).toBe("Checking");
  });

  it("leaves a name with no trailing digits alone", () => {
    expect(stripAccountNumberSuffix("Everyday Checking")).toBe("Everyday Checking");
  });

  it("never strips down to an empty string", () => {
    expect(stripAccountNumberSuffix("1234")).toBe("1234");
  });
});

describe("redactPrivacySafeText", () => {
  it("applies P2P, account-holder-name, and reference-number redaction together", () => {
    expect(redactPrivacySafeText("Zelle payment from JANE SMITH Conf# 000482910334", "Alex Rivera")).toBe(
      "Zelle payment from [person] Conf# [redacted]"
    );
  });

  it("redacts the account holder's own name in a payroll deposit", () => {
    expect(redactPrivacySafeText("UCLA PAYROLL DEP JANE STUDENT 000482910334", "Jane Student")).toBe(
      "UCLA PAYROLL DEP [account holder] [redacted]"
    );
  });

  it("leaves a normal merchant purchase untouched", () => {
    expect(redactPrivacySafeText("APPLE.COM/BILL", "Jane Student")).toBe("APPLE.COM/BILL");
  });
});
