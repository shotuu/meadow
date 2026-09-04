import type { SpendRangeKind } from "@finance-app/finance-logic";

export const SPEND_RANGE_LABEL: Record<SpendRangeKind, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  mtd: "Month to date",
  ytd: "Year to date",
};

export const SPEND_RANGE_KINDS = Object.keys(SPEND_RANGE_LABEL) as SpendRangeKind[];
