"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_VALUE = "__all__";

type Category = { id: string; name: string };

export function CategoryFilter({ categories, selected }: { categories: Category[]; selected?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Select
      value={selected ?? ALL_VALUE}
      onValueChange={(value) => {
        router.push(value === ALL_VALUE ? pathname : `${pathname}?category=${value}`);
      }}
    >
      <SelectTrigger className="w-44">
        <SelectValue placeholder="All categories" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>All categories</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
