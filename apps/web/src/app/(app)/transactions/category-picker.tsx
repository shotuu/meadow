"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryColorVar } from "@/lib/category-color";
import { setTransactionCategory, confirmTransactionCategory } from "./actions";

type Category = { id: string; name: string };

export function CategoryPicker({
  transactionId,
  categoryId,
  categories,
  categorySource,
  categoryConfidence,
}: {
  transactionId: string;
  categoryId: string | null;
  categories: Category[];
  categorySource?: "rule" | "ai" | "manual" | "uncategorized";
  categoryConfidence?: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [isConfirming, startConfirm] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
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
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: categoryColorVar(c.id) }}
              />
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {categorySource === "ai" && categoryConfidence != null && (
        <>
          <Badge variant="outline" className="shrink-0">
            AI · {Math.round(categoryConfidence * 100)}%
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Confirm category"
            title="Confirm category"
            disabled={isConfirming}
            onClick={() => {
              startConfirm(async () => {
                await confirmTransactionCategory(transactionId);
              });
            }}
          >
            <Check className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}
