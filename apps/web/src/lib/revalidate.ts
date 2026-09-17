import { revalidatePath } from "next/cache";

// /home and /dashboard render the same shared DashboardBody (see
// dashboard/page.tsx) -- /dashboard is kept only as a compatibility route
// (see PROGRESS.md's Phase 7/8B entries), so any mutation that invalidates
// one must invalidate both, or the route a user happens to be on can show
// stale data after a mutation made elsewhere. Small helper to stop that
// pairing from being forgotten one call site at a time, not a new caching
// abstraction -- callers still call revalidatePath directly for every path
// that isn't this specific pair.
export function revalidateHomeSurfaces() {
  revalidatePath("/home");
  revalidatePath("/dashboard");
}

// /plan and /budgets render overlapping budget/sinking-fund/prepaid-coverage
// data (see budgets/page.tsx and plan/budget-row.tsx, which share the exact
// same dialogs and server actions) -- /budgets is kept only as a
// compatibility route. Same reasoning as revalidateHomeSurfaces above.
export function revalidatePlanSurfaces() {
  revalidatePath("/plan");
  revalidatePath("/budgets");
}
