import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { resolveBucketName, summarizeSpendByCategory } from "@finance-app/finance-logic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { HoldingsAllocationChart } from "./holdings-allocation-chart";
import { PortfolioValueChart } from "./portfolio-value-chart";

type Holding = {
  accountId: string;
  symbol: string;
  securityType: string;
  quantity: number;
  avgCost: number | null;
  marketValue: number;
  currency: string;
};

export function HoldingsSection({
  holdings,
  history,
  currency,
  bucketAssignments,
}: {
  holdings: Holding[];
  history: { asOfDate: Date; value: number | null }[];
  currency: string;
  bucketAssignments: { symbol: string; bucketName: string }[];
}) {
  const overridesBySymbol = new Map(bucketAssignments.map((a) => [a.symbol, a.bucketName]));
  const allocation = summarizeSpendByCategory(
    holdings.map((h) => ({ categoryId: h.symbol, categoryName: h.symbol, amount: h.marketValue }))
  );
  const sortedHoldings = [...holdings].sort((a, b) => b.marketValue - a.marketValue);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Holdings</h2>
      <p className="text-sm text-muted-foreground">Includes brokerage cash. Totals are shown in {currency}.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Holdings value</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length >= 2 ? (
              <PortfolioValueChart data={history} currency={currency} />
            ) : (
              <p className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
                Building up history — check back after a few more nightly syncs.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <HoldingsAllocationChart data={allocation} currency={currency} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {sortedHoldings.map((h) => {
            const gainLoss = h.avgCost !== null ? h.marketValue - h.avgCost * h.quantity : null;
            const isUserAssigned = overridesBySymbol.has(h.symbol);
            const bucketName = resolveBucketName(h.symbol, h.securityType, overridesBySymbol);
            return (
              <Link
                key={`${h.accountId}:${h.symbol}`}
                href={`/accounts/holdings/${encodeURIComponent(h.symbol)}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-accent/50"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{h.securityType === "CASH" ? h.currency : h.symbol}</p>
                    <Badge variant={isUserAssigned ? "secondary" : "outline"} className="text-xs">
                      {bucketName}
                    </Badge>
                  </div>
                  {h.securityType !== "CASH" && (
                    <p className="text-sm text-muted-foreground">
                      {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                    </p>
                  )}
                </div>
                <div className="text-right">
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
        </CardContent>
      </Card>
    </div>
  );
}
