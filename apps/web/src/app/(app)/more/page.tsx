import { redirect } from "next/navigation";

// /more was the pre-nav-shell "everything else" list (Categories,
// Recurring, Planning, Alerts, Settings). As of Phase 7 of the UI/UX
// redesign every one of those destinations has a real entry point
// elsewhere -- Accounts/Categories/Alerts/Settings live in AppHeader's
// secondary menu (every screen, not just this one), Recurring is reachable
// from Activity's overflow, Planning from Plan's own "Full planning view"
// link. Nothing on /more was unique anymore, so this stays a redirect
// shim (matching the pattern already used by app/page.tsx and
// accounts/holdings/[symbol]/page.tsx) rather than a second navigation
// hub competing with the secondary menu.
export default function LegacyMoreRedirect() {
  redirect("/home");
}
