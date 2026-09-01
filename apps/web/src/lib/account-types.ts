import {
  Wallet,
  PiggyBank,
  CreditCard,
  TrendingUp,
  Banknote,
  HandCoins,
  CircleDollarSign,
  type LucideIcon,
} from "lucide-react";
import type { AccountType } from "@finance-app/db";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  brokerage: "Brokerage",
  cash: "Cash",
  loan: "Loan",
  other: "Other",
};

export const ACCOUNT_TYPE_ICON: Record<AccountType, LucideIcon> = {
  checking: Wallet,
  savings: PiggyBank,
  credit_card: CreditCard,
  brokerage: TrendingUp,
  cash: Banknote,
  loan: HandCoins,
  other: CircleDollarSign,
};

// Fixed type -> chart-color mapping so a slice's color never changes just
// because a different mix of account types happens to be present.
export const ACCOUNT_TYPE_COLOR: Record<AccountType, string> = {
  checking: "var(--chart-1)",
  savings: "var(--chart-2)",
  brokerage: "var(--chart-3)",
  cash: "var(--chart-4)",
  other: "var(--chart-5)",
  credit_card: "var(--negative)",
  loan: "var(--negative)",
};
