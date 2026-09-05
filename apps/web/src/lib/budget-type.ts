import type { BudgetType } from "@finance-app/db";

export const BUDGET_TYPE_OPTIONS: { value: BudgetType; label: string }[] = [
  { value: "none", label: "No budget" },
  { value: "monthly_reset", label: "Monthly (resets each period)" },
  { value: "rollover_envelope", label: "Rollover envelope (unspent carries forward)" },
  { value: "sinking_fund", label: "Sinking fund (saving toward a deadline)" },
  { value: "prepaid_coverage", label: "Prepaid / lumpy bill (tracks paid-through date)" },
];
