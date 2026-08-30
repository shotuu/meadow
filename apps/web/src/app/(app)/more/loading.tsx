import { CardGridSkeleton } from "@/components/skeletons";

export default function MoreLoading() {
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
      <CardGridSkeleton count={1} />
    </div>
  );
}
