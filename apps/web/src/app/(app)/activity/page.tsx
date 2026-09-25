import { TransactionsBody } from "../transactions/page";

// /activity is the real primary destination as of the nav-shell phase;
// /transactions stays live too (unchanged, sub-mode header) -- see
// PROGRESS.md's nav-shell entry.
export default function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; reviewPage?: string; range?: string; tab?: string; q?: string }>;
}) {
  return <TransactionsBody searchParams={searchParams} headerMode="root" />;
}
