"use client";

import { useState } from "react";
import { ChevronDown, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SPEND_RANGE_LABEL } from "@/lib/spend-range";
import type { SpendByCategoryBucket, SpendRangeKind } from "@finance-app/finance-logic";
import { CategoryPieChart } from "./category-pie-chart";
import { SpendRangeFilter } from "./spend-range-filter";

/**
 * On a phone, Activity's job is transaction access first -- this chart
 * used to render open at full height above the transaction list, pushing
 * rows off the first viewport entirely (real-device finding, not a static-
 * audit guess). Collapsed by default below `sm`, behind a compact one-line
 * summary + "View breakdown" toggle; always open at `sm` and up, where
 * there's room for both the chart and the list without scrolling past it.
 */
export function SpendingBreakdownCard({
  spendBuckets,
  currency,
  spendRange,
  conversionIncomplete,
}: {
  spendBuckets: SpendByCategoryBucket[];
  currency: string;
  spendRange: SpendRangeKind;
  conversionIncomplete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const top = spendBuckets[0];
  const total = spendBuckets.reduce((sum, b) => sum + b.amount, 0);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between space-y-0">
        <CardTitle className="text-base">Spending by category ({currency})</CardTitle>
        <SpendRangeFilter selected={spendRange} />
      </CardHeader>
      <CardContent>
        {spendBuckets.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No categorized spending in this period"
            description={`Nothing expense-tagged fell in "${SPEND_RANGE_LABEL[spendRange]}" — try a wider range.`}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 text-left sm:hidden"
              aria-expanded={open}
            >
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {formatMoney(total, currency)} total
                {top && ` · ${top.categoryName} ${formatMoney(top.amount, currency)}`}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm text-primary">
                {open ? "Hide" : "View breakdown"}
                <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
              </span>
            </button>
            <div className={cn(open ? "mt-3 block" : "hidden", "sm:mt-0 sm:block")}>
              <CategoryPieChart data={spendBuckets} currency={currency} />
              {conversionIncomplete && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Some transactions couldn&apos;t be converted (exchange rates not yet available for that
                  currency) — this chart may be incomplete.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
