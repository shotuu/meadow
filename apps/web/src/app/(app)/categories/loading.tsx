import { ListRowSkeleton } from "@/components/skeletons";

export default function CategoriesLoading() {
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
      <ListRowSkeleton count={4} />
      <ListRowSkeleton count={3} />
    </div>
  );
}
