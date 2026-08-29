import { ListRowSkeleton } from "@/components/skeletons";

export default function TransactionsLoading() {
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <ListRowSkeleton count={8} />
    </div>
  );
}
