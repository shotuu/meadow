import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { classifyInstrumentType, instrumentTypeLabel, resolveStrategyBucketName, type InstrumentType } from "@finance-app/finance-logic";
import { Badge } from "@/components/ui/badge";
import { SectionLabel, Meta } from "@/components/typography";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

type Holding = {
  accountId: string;
  symbol: string;
  securityType: string;
  ibkrSubCategory: string | null;
  quantity: number;
  avgCost: number | null;
  marketValue: number;
  currency: string;
};

/**
 * Compact list (dividers, not a grid of cards) -- symbol/instrument-type/
 * strategy on one line, value/gain-loss on the other. Ordinary brokerage
 * cash never appears here as an "Unclassified" holding (it's shown once,
 * as its own line, in StrategySection) -- this list is invested holdings
 * only.
 */
export function HoldingsList({
  holdings,
  bucketAssignments,
  instrumentTypeOverrides,
}: {
  holdings: Holding[];
  bucketAssignments: { symbol: string; bucketName: string }[];
  instrumentTypeOverrides: { symbol: string; instrumentType: InstrumentType }[];
}) {
  const overridesBySymbol = new Map(bucketAssignments.map((a) => [a.symbol, a.bucketName]));
  const instrumentOverridesBySymbol = new Map(instrumentTypeOverrides.map((o) => [o.symbol, o.instrumentType]));

  const invested = holdings
    .map((h) => ({
      ...h,
      classification: classifyInstrumentType({
        ibkrAssetCategory: h.securityType,
        ibkrSubCategory: h.ibkrSubCategory,
        manualOverride: instrumentOverridesBySymbol.get(h.symbol) ?? null,
      }),
    }))
    .filter((h) => h.classification.instrumentType !== "cash")
    .sort((a, b) => b.marketValue - a.marketValue);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>Holdings</SectionLabel>
        {invested.length > 0 && <Meta className="text-right">Gain/loss is unrealized, vs. average cost</Meta>}
      </div>

      {invested.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invested holdings yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {invested.map((h) => {
            const gainLoss = h.avgCost !== null ? h.marketValue - h.avgCost * h.quantity : null;
            const isUserAssigned = overridesBySymbol.has(h.symbol);
            const strategyBucketName = resolveStrategyBucketName(h.symbol, overridesBySymbol);
            return (
              <Link
                key={`${h.accountId}:${h.symbol}`}
                href={`/invest/holdings/${encodeURIComponent(h.symbol)}`}
                className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-primary"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium">{h.symbol}</p>
                    <Badge variant="outline" className="text-xs">
                      {instrumentTypeLabel(h.classification.instrumentType)}
                    </Badge>
                    <Badge variant={isUserAssigned ? "secondary" : "outline"} className="text-xs">
                      {strategyBucketName}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-amount font-semibold">{formatMoney(h.marketValue, h.currency)}</p>
                  {gainLoss !== null && (
                    <p
                      className={cn(
                        "font-amount flex items-center justify-end gap-1 text-sm",
                        gainLoss >= 0 ? "text-positive" : "text-negative"
                      )}
                    >
                      <TrendingUp className={cn("size-3", gainLoss < 0 && "rotate-180")} />
                      {formatMoney(gainLoss, h.currency)}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
