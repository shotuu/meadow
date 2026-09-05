"use client";

import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUDGET_TYPE_OPTIONS } from "@/lib/budget-type";
import type { BudgetType } from "@finance-app/db";
import { updateCategoryBudgetType } from "./actions";

export function BudgetTypeSelect({ categoryId, value }: { categoryId: string; value: BudgetType }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={value}
      disabled={isPending}
      onValueChange={(next) => {
        startTransition(() => {
          updateCategoryBudgetType(categoryId, next as BudgetType);
        });
      }}
    >
      <SelectTrigger size="sm" className="w-auto">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BUDGET_TYPE_OPTIONS.map((b) => (
          <SelectItem key={b.value} value={b.value}>
            {b.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
