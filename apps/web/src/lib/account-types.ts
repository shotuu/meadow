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
import type { AccountType, SyncSource } from "@finance-app/db";

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

// Humanized "how does this account get its data" label -- never the raw
// SyncSource enum value in user-facing UI. Plaid and Finverse are both
// invisible sync middleware the rest of the app already never names
// directly (the Accounts page's own "Connect a bank" / "Connect a
// Singapore bank" buttons don't say "Plaid"/"Finverse" either), so both
// collapse to the same "Connected bank" label -- the specific institution
// name already distinguishes accounts, and which sync vendor moves the
// data isn't a user-relevant distinction. IBKR is the one deliberate
// exception: brokerage-account holders identify with that name directly,
// and the connect flow already says "Connect IBKR" explicitly.
export const SYNC_SOURCE_LABEL: Record<SyncSource, string> = {
  manual: "Manual",
  csv: "CSV import",
  plaid: "Connected bank",
  finverse: "Connected bank",
  ibkr_flex: "IBKR",
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
