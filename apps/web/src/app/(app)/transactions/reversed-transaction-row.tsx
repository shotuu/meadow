"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ReversedPairSide = {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  description: string;
  accountName: string;
};

/**
 * A confirmed reversal candidate rendered as one collapsed economic event
 * in the normal transaction stream, not two independent-looking rows. This
 * is presentation only -- both underlying Transaction rows are untouched;
 * expanding just reveals them.
 */
export function ReversedTransactionRow({ charge, reversal }: { charge: ReversedPairSide; reversal: ReversedPairSide }) {
  const [expanded, setExpanded] = useState(false);
  const net = charge.amount + reversal.amount;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex min-w-0 items-center gap-2">
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{charge.description}</p>
            <p className="text-sm text-muted-foreground">
              Reversed · {charge.accountName}
            </p>
          </div>
        </div>
        <p className="font-amount shrink-0 text-right text-muted-foreground">{formatMoney(net, charge.currency)} net</p>
      </button>
      {expanded && (
        <div className="space-y-1.5 px-4 pb-3 pl-10 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Original charge · {new Date(charge.date).toLocaleDateString()}</span>
            <span className={cn("font-amount", charge.amount < 0 ? "text-negative" : "text-positive")}>
              {formatMoney(charge.amount, charge.currency, { signDisplay: "always" })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Reversal · {new Date(reversal.date).toLocaleDateString()}</span>
            <span className={cn("font-amount", reversal.amount < 0 ? "text-negative" : "text-positive")}>
              {formatMoney(reversal.amount, reversal.currency, { signDisplay: "always" })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
