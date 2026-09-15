export type BalanceCalculationMethod = "transaction_sum" | "institution_reported" | "holdings_derived";

export interface ComputeAccountBalanceInput {
  /** FinancialAccount.syncSource. */
  syncSource: string;
  /** Sum of Transaction.amount for this account (0 if none). */
  transactionSum: number;
  /** FinancialAccount.currentBalance, null if not Plaid/Finverse or not yet refreshed. */
  currentBalance: number | null;
  /** Sum of the latest-per-symbol InvestmentHolding.marketValue for this account, null if not an IBKR account. */
  holdingsSum: number | null;
}

export interface ComputedAccountBalance {
  balance: number;
  method: BalanceCalculationMethod;
}

/**
 * The single source of truth for "what is this account's current balance,"
 * replacing what used to be inlined and duplicated separately on the
 * Accounts and Dashboard pages. Three-tier precedence: IBKR accounts have no
 * Transaction rows at all, so their balance is the sum of their latest
 * holdings; Plaid/Finverse accounts prefer the institution-reported balance
 * once one has been synced; everything else (manual, CSV, or a synced
 * account before its first balance refresh) falls back to the transaction
 * sum.
 */
export function computeAccountBalance(input: ComputeAccountBalanceInput): ComputedAccountBalance {
  if (input.syncSource === "ibkr_flex") {
    return { balance: input.holdingsSum ?? 0, method: "holdings_derived" };
  }
  if ((input.syncSource === "plaid" || input.syncSource === "finverse") && input.currentBalance !== null) {
    return { balance: input.currentBalance, method: "institution_reported" };
  }
  return { balance: input.transactionSum, method: "transaction_sum" };
}
