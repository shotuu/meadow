import { ListRowSkeleton, CardGridSkeleton } from "@/components/skeletons";

export default function AlertsLoading() {
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
      <ListRowSkeleton count={3} />
      <CardGridSkeleton count={3} />
    </div>
  );
}
