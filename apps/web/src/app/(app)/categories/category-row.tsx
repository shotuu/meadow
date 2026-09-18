"use client";

import { useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUDGET_TYPE_OPTIONS, BUDGET_TYPE_SHORT_LABEL } from "@/lib/budget-type";
import { categoryColorVar } from "@/lib/category-color";
import type { BudgetType } from "@finance-app/db";
import { updateCategoryBudgetType, archiveCategory } from "./actions";

/**
 * At phone width, the old row (name + full inline budget-type Select with
 * its parenthetical explanation + Archive button, all in one horizontal
 * line) overflowed the viewport -- a real-device finding, not a static-
 * audit guess. Below `sm`, the row collapses to name + a short budget-type
 * label + chevron, and tapping it opens this same-data editor dialog
 * (full-text Select + Archive) instead of cramming everything inline. At
 * `sm` and up there's room for the original dense inline row, so it's kept
 * as-is rather than forcing every screen size through the dialog.
 */
export function CategoryRow({
  category,
}: {
  category: { id: string; name: string; budgetType: BudgetType };
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleBudgetTypeChange(next: BudgetType) {
    startTransition(() => {
      updateCategoryBudgetType(category.id, next);
    });
  }

  const dot = (
    <span className="size-2 shrink-0 rounded-full" style={{ background: categoryColorVar(category.id) }} />
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:hidden"
      >
        <span className="flex min-w-0 items-center gap-2">
          {dot}
          <span className="truncate">{category.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
          {BUDGET_TYPE_SHORT_LABEL[category.budgetType]}
          <ChevronRight className="size-4" />
        </span>
      </button>

      <div className="hidden items-center justify-between px-4 py-3 sm:flex">
        <span className="flex items-center gap-2">
          {dot}
          {category.name}
        </span>
        <div className="flex items-center gap-3">
          <Select value={category.budgetType} disabled={isPending} onValueChange={(v) => handleBudgetTypeChange(v as BudgetType)}>
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
          <form action={archiveCategory.bind(null, category.id)}>
            <Button type="submit" variant="ghost" size="sm">
              Archive
            </Button>
          </form>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{category.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`budget-type-${category.id}`}>Budget behavior</Label>
            <Select value={category.budgetType} disabled={isPending} onValueChange={(v) => handleBudgetTypeChange(v as BudgetType)}>
              <SelectTrigger id={`budget-type-${category.id}`} className="w-full">
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
          </div>
          <DialogFooter>
            <form action={archiveCategory.bind(null, category.id)} onSubmit={() => setOpen(false)}>
              <Button type="submit" variant="outline">
                Archive
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
