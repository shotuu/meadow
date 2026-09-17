"use client";

import { useTransition } from "react";
import { Check, X, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { confirmReversalMatch, dismissReversalMatch } from "./reversal-actions";

type MoneySide = {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  description: string;
  accountName: string;
};

export type ReversalMatchRow = {
  id: string;
  confidenceScore: number;
  charge: MoneySide;
  reversal: MoneySide;
};

function MoneySideDisplay({ side }: { side: MoneySide }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium">{side.description}</p>
      <p className="text-sm text-muted-foreground">
        {side.accountName} · {new Date(side.date).toLocaleDateString()}
      </p>
      <p className={cn("font-amount font-semibold", side.amount > 0 ? "text-positive" : "text-negative")}>
        {formatMoney(side.amount, side.currency, { signDisplay: "always" })}
      </p>
    </div>
  );
}

function ReversalMatchRowItem({ row }: { row: ReversalMatchRow }) {
  const [isConfirming, startConfirm] = useTransition();
  const [isDismissing, startDismiss] = useTransition();

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <MoneySideDisplay side={row.charge} />
        <Undo2 className="size-4 shrink-0 text-muted-foreground" />
        <MoneySideDisplay side={row.reversal} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline">{Math.round(row.confidenceScore * 100)}% match</Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Confirm reversal"
          title="Confirm reversal"
          disabled={isConfirming || isDismissing}
          onClick={() => {
            startConfirm(async () => {
              await confirmReversalMatch(row.id);
            });
          }}
        >
          <Check className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss suggestion"
          title="Dismiss suggestion"
          disabled={isConfirming || isDismissing}
          onClick={() => {
            startDismiss(async () => {
              await dismissReversalMatch(row.id);
            });
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Pending reversal candidates (a charge that looks like it was later
 * reversed/refunded) needing an explicit, conservative confirm/dismiss
 * decision -- Meadow's inference is never presented as fact before this.
 * Lives inside the existing "Transfers" tab rather than a new tab of its
 * own, alongside suggested transfers -- both are the same underlying
 * concept (a suggested relationship between two transactions awaiting the
 * user's decision).
 */
export function SuggestedReversalsSection({ rows, suppressEmptyState = false }: { rows: ReversalMatchRow[]; suppressEmptyState?: boolean }) {
  if (rows.length === 0) {
    if (suppressEmptyState) return null;
    return (
      <EmptyState
        icon={Undo2}
        title="No suggested reversals"
        description="A charge that looks like it was later reversed or refunded by the same merchant will show up here for review."
      />
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Suggested reversals</h3>
      <Card>
        <CardContent className="divide-y p-0">
          {rows.map((row) => (
            <ReversalMatchRowItem key={row.id} row={row} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
