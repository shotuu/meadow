import { DashboardBody } from "../dashboard/page";

// /home is the real primary destination as of the nav-shell phase;
// /dashboard stays live too (unchanged, sub-mode header) since old routes
// aren't being deleted or redirected away in this phase -- see
// PROGRESS.md's nav-shell entry.
export default function HomePage() {
  return <DashboardBody headerMode="root" />;
}
