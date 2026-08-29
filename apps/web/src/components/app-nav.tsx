"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  PiggyBank,
  Tags,
  Repeat,
  BellRing,
  Settings,
} from "lucide-react";
import { Tabbar, TabbarLink } from "konsta/react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/alerts", label: "Alerts", icon: BellRing },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-1 border-b border-border px-6 h-14">
      <span className="font-semibold mr-6">Meadow</span>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </nav>
  );
}

export function MobileTabbar() {
  const pathname = usePathname();
  return (
    // Icon-only, not `labels` — at 8 top-level sections, icon+label per tab
    // no longer fits a phone-width bottom bar without cramping/wrapping.
    <Tabbar className="md:hidden fixed bottom-0 left-0 right-0 z-50">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <TabbarLink
          key={href}
          component={Link}
          linkProps={{ href, "aria-label": label }}
          active={pathname.startsWith(href)}
          icon={<Icon className="size-5" />}
        />
      ))}
    </Tabbar>
  );
}
