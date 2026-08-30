import { TrendingUp } from "lucide-react";
import { summarizeSpendByCategory } from "@finance-app/finance-logic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { HoldingsAllocationChart } from "./holdings-allocation-chart";
import { PortfolioValueChart } from "./portfolio-value-chart";

type Holding = {
  symbol: string;
  quantity: number;
  avgCost: number | null;
  marketValue: number;
  currency: string;
};

export function HoldingsSection({
  holdings,
  history,
  currency,
}: {
  holdings: Holding[];
  history: { asOfDate: Date; value: number }[];
  currency: string;
}) {
  const allocation = summarizeSpendByCategory(
    holdings.map((h) => ({ categoryId: h.symbol, categoryName: h.symbol, amount: h.marketValue }))
  );
  const sortedHoldings = [...holdings].sort((a, b) => b.marketValue - a.marketValue);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Holdings</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portfolio value</CardTitle>
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
            return (
              <div key={h.symbol} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium">{h.symbol}</p>
                  <p className="text-sm text-muted-foreground">
                    {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                  </p>
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
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
