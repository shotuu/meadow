"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { MoreHorizontal } from "lucide-react";
import { Tabbar, TabbarLink } from "konsta/react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS, PRIMARY_NAV_ITEMS, MORE_NAV_ITEMS } from "@/lib/nav-items";

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-40 hidden md:flex items-center gap-1 border-b border-border bg-background/80 px-6 h-14 backdrop-blur-sm">
      <Link href="/dashboard" className="flex items-center gap-2 mr-6">
        <Image src="/logo.png" alt="" width={24} height={24} className="rounded-md" />
        <span className="font-semibold">Meadow</span>
      </Link>
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

export function MobileTabbar() {
  const pathname = usePathname();
  const onMoreSection =
    pathname.startsWith("/more") || MORE_NAV_ITEMS.some(({ href }) => pathname.startsWith(href));
  return (
    // Icon-only, not `labels` — even at 5 tabs (4 primary + More), labels
    // crowd a phone-width bottom bar; see the "Nav growth" note in
    // PROGRESS.md for why this went icon-only in the first place.
    <Tabbar className="md:hidden fixed bottom-0 left-0 right-0 z-50">
      {PRIMARY_NAV_ITEMS.map(({ href, label, icon }) => {
        const active = pathname.startsWith(href);
        return (
          <TabbarLink
            key={href}
            component={Link}
            linkProps={{ href, "aria-label": label }}
            active={active}
            icon={<MobileNavIcon icon={icon} active={active} />}
          />
        );
      })}
      <TabbarLink
        component={Link}
        linkProps={{ href: "/more", "aria-label": "More" }}
        active={onMoreSection}
        icon={<MobileNavIcon icon={MoreHorizontal} active={onMoreSection} />}
      />
    </Tabbar>
  );
}
