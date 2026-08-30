import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  PiggyBank,
  Tags,
  Repeat,
  BellRing,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Desktop has room for every top-level section in one bar. Mobile's bottom
// tab bar does not (8 icons was already cramped, see the "Nav growth" note
// in PROGRESS.md) -- PRIMARY_NAV_ITEMS gets its own tab, everything in
// MORE_NAV_ITEMS lives behind a single "More" tab (see `/more/page.tsx`).
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
];

export const MORE_NAV_ITEMS: NavItem[] = [
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/alerts", label: "Alerts", icon: BellRing },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const NAV_ITEMS: NavItem[] = [...PRIMARY_NAV_ITEMS, ...MORE_NAV_ITEMS];
