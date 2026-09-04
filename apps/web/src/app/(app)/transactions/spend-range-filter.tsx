"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SPEND_RANGE_LABEL, SPEND_RANGE_KINDS } from "@/lib/spend-range";
import type { SpendRangeKind } from "@finance-app/finance-logic";

export function SpendRangeFilter({ selected }: { selected: SpendRangeKind }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      value={selected}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === "mtd") params.delete("range");
        else params.set("range", value);
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
    >
      <SelectTrigger size="sm" className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SPEND_RANGE_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {SPEND_RANGE_LABEL[kind]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
