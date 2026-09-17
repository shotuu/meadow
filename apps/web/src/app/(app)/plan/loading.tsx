import { Skeleton } from "@/components/ui/skeleton";
import { ListRowSkeleton } from "@/components/skeletons";

export default function PlanLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div className="flex items-center justify-between md:hidden">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <ListRowSkeleton count={4} />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <ListRowSkeleton count={2} />
      </div>
    </div>
  );
}
