"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Tabbar, TabbarLink } from "konsta/react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { SecondaryMenu } from "@/components/app-header";
import { PRIMARY_NAV_ITEMS, isNavItemActive } from "@/lib/nav-items";

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-40 hidden md:flex items-center gap-1 border-b border-border bg-background/80 px-6 h-14 backdrop-blur-sm">
      <Link href="/home" className="flex items-center gap-2 mr-6">
        <Image src="/logo.png" alt="" width={24} height={24} className="rounded-md" />
        <span className="font-semibold">Meadow</span>
      </Link>
      {PRIMARY_NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
      <div className="ml-auto flex items-center gap-1">
        <SecondaryMenu />
        <ThemeToggle />
      </div>
    </nav>
  );
}

// A colored pill that scales in with a slight overshoot ("pop") behind the
// active tab's icon, plus a bolder stroke — Konsta's own active-state
// styling wasn't visually distinct enough on its own (no color change, just
// an internal class toggle), so this is fully self-contained rather than
// depending on its theme variables.
function MobileNavIcon({ icon: Icon, active }: { icon: (typeof PRIMARY_NAV_ITEMS)[number]["icon"]; active: boolean }) {
  return (
    <span
      className={cn(
        "flex size-11 items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-90",
        active ? "scale-110 bg-primary/15 text-primary" : "scale-100 text-muted-foreground"
      )}
    >
      <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} />
    </span>
  );
}

// Exactly the 4 primary destinations — no 5th "More" tab as of the
// nav-shell phase (secondary destinations moved to AppHeader's root-mode
// menu instead, see nav-items.ts's SECONDARY_NAV_ITEMS).
export function MobileTabbar() {
  const pathname = usePathname();
  return (
    // pb-[env(safe-area-inset-bottom)]: without it, the icons sit flush
    // against the iOS home-indicator on notched devices with no
    // clearance -- viewportFit: "cover" in layout.tsx is what makes this
    // env() value resolve to anything other than 0 in the first place.
    <Tabbar className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
      {PRIMARY_NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <TabbarLink
            key={item.href}
            component={Link}
            linkProps={{ href: item.href, "aria-label": item.label }}
            active={active}
            icon={<MobileNavIcon icon={item.icon} active={active} />}
          />
        );
      })}
    </Tabbar>
  );
}
