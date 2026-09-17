import {
  LayoutDashboard,
  Activity,
  TrendingUp,
  PiggyBank,
  Landmark,
  Tags,
  BellRing,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Extra path prefixes that should also count as "on this destination" for
   * active-state highlighting. Exists because Phase 2 of the UI/UX redesign
   * (nav shell) intentionally ships before Phases 3-6 (the actual content
   * moves) -- e.g. /invest and /accounts render the same page body today,
   * so both should light up "Invest" in primary nav. Remove an entry once
   * its content genuinely moves into the new route instead.
   */
  matchPrefixes?: string[];
};

// The four primary destinations (Home/Activity/Invest/Plan), shown on both
// the mobile bottom tab bar and the desktop top nav. See PROGRESS.md's
// nav-shell entry and apps/web/DESIGN.md's "Header system" section for the
// full rationale and the temporary content compromises this implies.
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: LayoutDashboard, matchPrefixes: ["/dashboard"] },
  { href: "/activity", label: "Activity", icon: Activity, matchPrefixes: ["/transactions", "/recurring"] },
  // No /accounts prefix as of Phase 5: Accounts is a genuine secondary
  // destination now (connected accounts/balances/config), not shared
  // content with Invest -- see PROGRESS.md's Phase 5 entry. Visiting
  // /accounts no longer highlights Invest, matching how visiting
  // Categories/Alerts/Settings doesn't highlight any primary tab either.
  { href: "/invest", label: "Invest", icon: TrendingUp },
  { href: "/plan", label: "Plan", icon: PiggyBank, matchPrefixes: ["/budgets", "/planning"] },
];

// Secondary/config destinations, reachable via AppHeader's root-mode menu
// (a dropdown anchored to the menu icon on both the mobile top bar and
// DesktopNav) rather than primary nav.
export const SECONDARY_NAV_ITEMS: NavItem[] = [
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/alerts", label: "Alerts", icon: BellRing },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (pathname.startsWith(item.href)) return true;
  return item.matchPrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false;
}
