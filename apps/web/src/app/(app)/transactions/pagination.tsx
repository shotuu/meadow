"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TransactionsPagination({
  page,
  totalPages,
  paramName = "page",
}: {
  page: number;
  totalPages: number;
  /** Which search param to read/write -- lets a second, independent list (e.g. the Review tab) paginate without fighting the "All" tab's own `page` param. */
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete(paramName);
    else params.set(paramName, String(nextPage));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex items-center justify-center gap-3 pt-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => goTo(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => goTo(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
