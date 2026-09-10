import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PortfolioValueChart } from "../../portfolio-value-chart";

const TRADE_TYPE_LABEL: Record<string, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  interest: "Interest",
  fee: "Fee",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
};

export default async function HoldingDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const userId = await requireUserId();
  const { symbol } = await params;

  const [holdings, historyRows, transactions] = await Promise.all([
    prisma.investmentHolding.findMany({
      where: { symbol, account: { userId } },
      include: { account: { select: { name: true } } },
      orderBy: { asOfDate: "desc" },
    }),
    prisma.investmentHoldingHistory.groupBy({
      by: ["asOfDate"],
      where: { symbol, account: { userId } },
      _sum: { marketValue: true },
      orderBy: { asOfDate: "asc" },
    }),
    prisma.investmentTransaction.findMany({
      where: { symbol, account: { userId } },
      orderBy: { tradeDate: "desc" },
    }),
  ]);

  if (holdings.length === 0 && transactions.length === 0) notFound();

  // One row per (accountId, symbol) already, since InvestmentHolding is
  // point-in-time snapshots and this query only wants the latest -- take
  // the most recent asOfDate per account rather than assuming a single row.
  const latestByAccount = new Map<string, (typeof holdings)[number]>();
  for (const h of holdings) {
    const existing = latestByAccount.get(h.accountId);
    if (!existing || h.asOfDate > existing.asOfDate) latestByAccount.set(h.accountId, h);
  }
  const currentHoldings = [...latestByAccount.values()];
  const history = historyRows.map((r) => ({ asOfDate: r.asOfDate, value: Number(r._sum.marketValue ?? 0) }));
  const currency = currentHoldings[0]?.currency ?? transactions[0]?.currency ?? "USD";

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <div className="flex items-center gap-2">
        <Link href="/accounts" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-2xl font-semibold">{symbol}</h1>
      </div>

      {currentHoldings.map((h) => {
        const gainLoss = h.avgCost !== null ? Number(h.marketValue) - Number(h.avgCost) * Number(h.quantity) : null;
        return (
          <Card key={h.accountId}>
            <CardHeader className="flex items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{h.account.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {Number(h.quantity).toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                  {h.avgCost !== null && ` · avg cost ${formatMoney(h.avgCost, h.currency)}`}
                </p>
              </div>
              <div className="text-right">
                <p className="font-amount text-lg font-semibold">{formatMoney(h.marketValue, h.currency)}</p>
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
            </CardHeader>
          </Card>
        );
      })}

      {history.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Value over time</CardTitle>
          </CardHeader>
          <CardContent>
            <PortfolioValueChart data={history} currency={currency} />
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Transaction history</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions recorded for this symbol yet.</p>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{TRADE_TYPE_LABEL[t.tradeType] ?? t.tradeType}</Badge>
                    <div>
                      <p className="text-sm text-muted-foreground">{t.tradeDate.toLocaleDateString()}</p>
                      {t.quantity !== null && t.price !== null && (
                        <p className="text-xs text-muted-foreground">
                          {Number(t.quantity).toLocaleString(undefined, { maximumFractionDigits: 4 })} @{" "}
                          {formatMoney(t.price, t.currency)}
                        </p>
                      )}
                    </div>
                  </div>
                  <p
                    className={cn(
                      "font-amount font-semibold",
                      Number(t.amount) > 0 ? "text-positive" : Number(t.amount) < 0 ? "text-negative" : ""
                    )}
                  >
                    {formatMoney(t.amount, t.currency, { signDisplay: "always" })}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
