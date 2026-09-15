import type { ConfidenceLevel, IncomeType } from "./schema";

export interface IncomeClassificationInput {
  amount: number;
  isTransfer: boolean;
  description: string;
  merchantName: string | null;
  /** Names of the user's active IncomeStream rows -- a description/merchant match is the strongest available signal. */
  activeIncomeStreamNames: string[];
  /** Whether this transaction is linked to a positive-amount RecurringSeries -- a weaker, fallback signal. */
  isLinkedToRecurringSeries: boolean;
}

export interface IncomeClassificationResult {
  incomeType: IncomeType | null;
  confidence: ConfidenceLevel | null;
}

const SCHOLARSHIP_KEYWORDS = ["scholarship", "stipend", "allowance", "grant"];
const REFUND_KEYWORDS = ["refund", "return", "chargeback"];
const REIMBURSEMENT_KEYWORDS = ["reimb", "expense report"];
const INVESTMENT_INCOME_KEYWORDS = ["dividend", "interest pay", "capital gain", "distribution"];
const GIFT_KEYWORDS = ["gift"];

function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

/** Shared with the reversal/refund tagger in build-export.ts, so both use one keyword list rather than two that could drift apart. */
export function isLikelyRefundText(text: string): boolean {
  return containsAny(text, REFUND_KEYWORDS) || containsAny(text, REIMBURSEMENT_KEYWORDS);
}

/**
 * Best-effort semantic classification of an incoming (positive-amount)
 * transaction. Deliberately conservative: every branch pairs its guess
 * with a confidence level, and an unrecognized deposit is "other"/"low"
 * rather than a false-confident label. Never asserts a fact Meadow can't
 * actually confirm -- see the AI-export v2 plan.
 */
export function classifyIncome(input: IncomeClassificationInput): IncomeClassificationResult {
  if (input.isTransfer) return { incomeType: "transfer", confidence: "high" };
  if (input.amount <= 0) return { incomeType: null, confidence: null };

  const text = `${input.description} ${input.merchantName ?? ""}`;

  const matchedStream = input.activeIncomeStreamNames.some((name) => name && text.toLowerCase().includes(name.toLowerCase()));
  if (matchedStream) {
    return containsAny(text, SCHOLARSHIP_KEYWORDS)
      ? { incomeType: "scholarship_allowance", confidence: "high" }
      : { incomeType: "employment_wages", confidence: "high" };
  }

  if (containsAny(text, REFUND_KEYWORDS)) return { incomeType: "refund", confidence: "medium" };
  if (containsAny(text, REIMBURSEMENT_KEYWORDS)) return { incomeType: "reimbursement", confidence: "medium" };
  if (containsAny(text, INVESTMENT_INCOME_KEYWORDS)) return { incomeType: "investment_income", confidence: "medium" };
  if (containsAny(text, GIFT_KEYWORDS)) return { incomeType: "gift", confidence: "low" };

  if (input.isLinkedToRecurringSeries) return { incomeType: "employment_wages", confidence: "medium" };

  return { incomeType: "other", confidence: "low" };
}
