import { CardGridSkeleton } from "@/components/skeletons";

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-2xl p-6 space-y-8">
      <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
      <CardGridSkeleton count={2} />
    </div>
  );
}
