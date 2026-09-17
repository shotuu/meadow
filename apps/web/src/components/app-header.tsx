import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Menu, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SECONDARY_NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

// The secondary-destination menu (Accounts/Categories/Alerts/Settings) --
// used by AppHeader's root mode below and reused verbatim by DesktopNav,
// so there is exactly one implementation of "where do these four routes
// live" rather than two menus that could drift apart. Plain Radix modal
// DropdownMenu (unlike the sub-mode overflow below) since these are
// ordinary <Link> navigations with no nested Dialog to conflict with --
// keyboard arrow-navigation, Enter-to-activate, Escape/outside-click-to-
// dismiss all come for free from Radix's default (modal) behavior.
export function SecondaryMenu({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More" className={className}>
          <Menu className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* Reserved spot for a future global-search entry point, next to
            this menu -- not built yet, see DESIGN.md's "Header system"
            section. */}
        {SECONDARY_NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={href} className="flex items-center gap-2">
              <Icon className="size-4" />
              {label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type RootHeaderProps = {
  mode: "root";
  /** Visually-hidden page identity for screen readers -- root mode shows only the app brand mark, never a visible title (the content itself establishes context), so without this an assistive-tech user has no way to tell Home/Activity/Invest/Plan apart. */
  pageTitle: string;
};
type SubHeaderProps = {
  mode?: "sub";
  title: string;
  /** Inline context next to the title (e.g. instrument-type/strategy-bucket badges) — not an action. */
  subtitle?: ReactNode;
  backHref?: string;
  primaryAction?: ReactNode;
  overflow?: ReactNode;
  className?: string;
};

// Shared page header — one slot, two mutually exclusive modes, so a route
// never stacks a global brand bar on top of its own title bar:
//
// - "root" (the 4 primary destinations: Home/Activity/Invest/Plan): just
//   the Meadow brand mark and the secondary-menu button, no title text —
//   the content itself establishes context. This is the *only* header a
//   primary destination renders.
// - "sub" (every other route: drill-downs and the 4 secondary
//   destinations): back link (optional) / title / subtitle badges
//   (optional) / one primary action / an overflow menu for everything
//   else. This is the original Phase 1 header, unchanged.
export function AppHeader(props: RootHeaderProps | SubHeaderProps) {
  if (props.mode === "root") {
    // md:hidden: on desktop, the persistent DesktopNav bar already is root
    // mode (brand + primary links + the same secondary menu) -- rendering
    // this inline too would stack a second, redundant brand/menu bar under
    // it. Mobile has no such persistent bar, so this is its top chrome. The
    // h1 sits outside that md:hidden wrapper (sr-only, never display:none)
    // so it's always in the DOM at every viewport width -- DesktopNav is a
    // persistent global shell with no per-page title of its own, so this is
    // the only page-identity heading on desktop too.
    return (
      <>
        <h1 className="sr-only">{props.pageTitle}</h1>
        <div className="flex items-center justify-between gap-3 md:hidden">
          <Link href="/home" className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={24} height={24} className="rounded-md" />
            <span className="font-semibold">Meadow</span>
          </Link>
          <SecondaryMenu />
        </div>
      </>
    );
  }

  const { title, subtitle, backHref, primaryAction, overflow, className } = props;
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <h1 className="truncate text-2xl font-semibold">{title}</h1>
        {subtitle && <div className="flex min-w-0 shrink-0 items-center gap-1.5">{subtitle}</div>}
      </div>
      {(primaryAction || overflow) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {primaryAction}
          {overflow && (
            // modal={false}: this menu's items are often full dialog
            // triggers (Import CSV, Connect IBKR, ...) — Radix's default
            // modal focus-trap on DropdownMenu fights the nested Dialog's
            // own focus trap when it opens, so the overflow menu stays
            // non-modal.
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="flex w-56 flex-col gap-1 p-1.5 [&_a]:w-full [&_a]:justify-start [&_button]:w-full [&_button]:justify-start"
              >
                {overflow}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
