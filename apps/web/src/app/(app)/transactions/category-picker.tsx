"use client";

import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setTransactionCategory } from "./actions";

type Category = { id: string; name: string };

export function CategoryPicker({
  transactionId,
  categoryId,
  categories,
}: {
  transactionId: string;
  categoryId: string | null;
  categories: Category[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={categoryId ?? undefined}
      disabled={isPending}
      onValueChange={(value) => {
        startTransition(async () => {
          await setTransactionCategory(transactionId, value);
        });
      }}
    >
      <SelectTrigger size="sm" className="w-40">
        <SelectValue placeholder="Uncategorized" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
