import type { BudgetType } from "@finance-app/db";

export const BUDGET_TYPE_OPTIONS: { value: BudgetType; label: string }[] = [
  { value: "none", label: "No budget" },
  { value: "monthly_reset", label: "Monthly (resets each period)" },
  { value: "rollover_envelope", label: "Rollover envelope (unspent carries forward)" },
  { value: "sinking_fund", label: "Sinking fund (saving toward a deadline)" },
  { value: "prepaid_coverage", label: "Prepaid / lumpy bill (tracks paid-through date)" },
];

// Concise, single-line equivalents of BUDGET_TYPE_OPTIONS' labels -- for
// contexts with limited width (the mobile Categories row) where the full
// parenthetical explanation belongs in the editor, not the list. Keep in
// sync with BUDGET_TYPE_OPTIONS by value.
export const BUDGET_TYPE_SHORT_LABEL: Record<BudgetType, string> = {
  none: "No budget",
  monthly_reset: "Monthly",
  rollover_envelope: "Rollover envelope",
  sinking_fund: "Sinking fund",
  prepaid_coverage: "Prepaid",
};
