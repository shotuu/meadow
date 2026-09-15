"use client";

import { useTransition } from "react";
import { Check, X, ArrowRightLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { confirmTransferMatch, dismissTransferMatch } from "./transfer-actions";

type MoneySide = {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  description: string;
  accountName: string;
};

export type TransferMatchRow = {
  id: string;
  confidenceScore: number;
  anchor: MoneySide;
  counterpart: MoneySide;
};

export type CrossCurrencyRow = {
  daysApart: number;
  a: MoneySide;
  b: MoneySide;
};

function MoneySideDisplay({ side }: { side: MoneySide }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium">{side.description}</p>
      <p className="text-sm text-muted-foreground">
        {side.accountName} · {new Date(side.date).toLocaleDateString()}
      </p>
      <p
        className={cn(
          "font-amount font-semibold",
          side.amount > 0 ? "text-positive" : side.amount < 0 ? "text-negative" : ""
        )}
      >
        {formatMoney(side.amount, side.currency, { signDisplay: "always" })}
      </p>
    </div>
  );
}

function TransferMatchRowItem({ row }: { row: TransferMatchRow }) {
  const [isConfirming, startConfirm] = useTransition();
  const [isDismissing, startDismiss] = useTransition();

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <MoneySideDisplay side={row.anchor} />
        <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground" />
        <MoneySideDisplay side={row.counterpart} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline">{Math.round(row.confidenceScore * 100)}% match</Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Confirm transfer"
          title="Confirm transfer"
          disabled={isConfirming || isDismissing}
          onClick={() => {
            startConfirm(async () => {
              await confirmTransferMatch(row.id);
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
              await dismissTransferMatch(row.id);
            });
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function SuggestedTransfersTab({
  rows,
  crossCurrencyRows,
}: {
  rows: TransferMatchRow[];
  crossCurrencyRows: CrossCurrencyRow[];
}) {
  if (rows.length === 0 && crossCurrencyRows.length === 0) {
    return (
      <EmptyState
        icon={ArrowRightLeft}
        title="No suggested transfers"
        description="Synced transactions that look like internal transfers between your own accounts will show up here for review."
      />
    );
  }

  return (
    <div className="space-y-6">
      {rows.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {rows.map((row) => (
              <TransferMatchRowItem key={row.id} row={row} />
            ))}
          </CardContent>
        </Card>
      )}

      {crossCurrencyRows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Possible cross-currency transfers — match manually
          </h3>
          <p className="text-sm text-muted-foreground">
            These involve two different currencies, so they can&apos;t be auto-matched reliably (the
            app only has today&apos;s exchange rate, not the rate on the transfer date). Review these
            yourself if any of them are actually the same transfer.
          </p>
          <Card>
            <CardContent className="divide-y p-0">
              {crossCurrencyRows.map((row) => (
                <div
                  key={`${row.a.id}-${row.b.id}`}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <MoneySideDisplay side={row.a} />
                  <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground" />
                  <MoneySideDisplay side={row.b} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
