import { describe, expect, it } from "vitest";
import type { Prisma } from "@finance-app/db";
import { buildCategoryPath, buildAccountLabel } from "../ai-export/allowlist";
import { toDecimalString, roundMoney, roundPct } from "../ai-export/decimal";
import { classifyIncome, isLikelyRefundText } from "../ai-export/income-classify";
import { redactReferenceNumbers } from "../ai-export/redact";

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
    expect(classifyIncome({ ...base, isTransfer: true })).toEqual({ incomeType: "transfer", confidence: "high" });
  });

  it("returns null/null for a non-positive amount", () => {
    expect(classifyIncome({ ...base, amount: -10 })).toEqual({ incomeType: null, confidence: null });
    expect(classifyIncome({ ...base, amount: 0 })).toEqual({ incomeType: null, confidence: null });
  });

  it("matches an active income stream by name at high confidence", () => {
    const result = classifyIncome({ ...base, description: "ACME CORP PAYROLL", activeIncomeStreamNames: ["Acme Corp"] });
    expect(result).toEqual({ incomeType: "employment_wages", confidence: "high" });
  });

  it("distinguishes a scholarship-named income stream from wages", () => {
    const result = classifyIncome({ ...base, description: "UCLA SCHOLARSHIP DISBURSEMENT", activeIncomeStreamNames: ["UCLA Scholarship"] });
    expect(result).toEqual({ incomeType: "scholarship_allowance", confidence: "high" });
  });

  it("recognizes refund/reimbursement/investment-income keywords at medium confidence", () => {
    expect(classifyIncome({ ...base, description: "MERCHANT REFUND" })).toEqual({ incomeType: "refund", confidence: "medium" });
    expect(classifyIncome({ ...base, description: "EXPENSE REPORT REIMB" })).toEqual({ incomeType: "reimbursement", confidence: "medium" });
    expect(classifyIncome({ ...base, description: "DIVIDEND PAYMENT" })).toEqual({ incomeType: "investment_income", confidence: "medium" });
  });

  it("falls back to a recurring-series link at medium confidence, then other/low with no signal at all", () => {
    expect(classifyIncome({ ...base, description: "UNKNOWN DEPOSIT", isLinkedToRecurringSeries: true })).toEqual({ incomeType: "employment_wages", confidence: "medium" });
    expect(classifyIncome({ ...base, description: "UNKNOWN DEPOSIT" })).toEqual({ incomeType: "other", confidence: "low" });
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
