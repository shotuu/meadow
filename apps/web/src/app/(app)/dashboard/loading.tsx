import { CardGridSkeleton, ListRowSkeleton } from "@/components/skeletons";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
      <CardGridSkeleton count={2} />
      <ListRowSkeleton count={5} />
    </div>
  );
}
