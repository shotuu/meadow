import { readCurrentHoldings, readPortfolioHistory } from "@finance-app/finance-data";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { prisma } from "@finance-app/db";
import { classifyInstrumentType, instrumentTypeLabel, resolveStrategyBucketName, type InstrumentType } from "@finance-app/finance-logic";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PortfolioValueChart } from "../../portfolio-value-chart";
import { SetHoldingBucketDialog } from "../../set-holding-bucket-dialog";
import { RemoveHoldingBucketButton } from "../../remove-holding-bucket-button";
import { SetInstrumentTypeDialog } from "../../set-instrument-type-dialog";
import { RemoveInstrumentTypeOverrideButton } from "../../remove-instrument-type-override-button";

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

  const appUser = await prisma.appUser.findUniqueOrThrow({ where: { id: userId } });
  const [holdings, history, transactions, bucketAssignment, instrumentTypeOverride] = await Promise.all([
    readCurrentHoldings(userId),
    readPortfolioHistory(userId, appUser.defaultCurrency, undefined, symbol),
    prisma.investmentTransaction.findMany({
      where: { symbol, account: { userId } },
      orderBy: { tradeDate: "desc" },
    }),
    prisma.holdingBucketAssignment.findUnique({ where: { userId_symbol: { userId, symbol } } }),
    prisma.instrumentTypeOverride.findUnique({ where: { userId_symbol: { userId, symbol } } }),
  ]);

  if (!holdings.some((h) => h.symbol === symbol) && transactions.length === 0) notFound();

  const currentHoldings = holdings.filter((h) => h.symbol === symbol && Number(h.quantity) !== 0);
  const currency = appUser.defaultCurrency;
  const accounts = await prisma.financialAccount.findMany({ where: { userId }, select: { id: true, name: true } });
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const securityType = currentHoldings[0]?.securityType ?? "";
  const ibkrSubCategory = currentHoldings[0]?.ibkrSubCategory ?? null;
  const overridesBySymbol: Map<string, string> = bucketAssignment
    ? new Map([[symbol, bucketAssignment.bucketName]])
    : new Map();
  const resolvedBucketName = resolveStrategyBucketName(symbol, overridesBySymbol);
  const instrumentClassification = classifyInstrumentType({
    ibkrAssetCategory: securityType || null,
    ibkrSubCategory,
    manualOverride: (instrumentTypeOverride?.instrumentType as InstrumentType | undefined) ?? null,
  });

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/accounts" className="text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="text-2xl font-semibold">{securityType === "CASH" ? currentHoldings[0]?.currency ?? symbol : symbol}</h1>
          <Badge variant="outline">{instrumentTypeLabel(instrumentClassification.instrumentType)}</Badge>
          <Badge variant={bucketAssignment ? "secondary" : "outline"}>{resolvedBucketName}</Badge>
        </div>
        {securityType && (
          <div className="flex flex-wrap items-center gap-2">
            {instrumentTypeOverride && <RemoveInstrumentTypeOverrideButton symbol={symbol} />}
            <SetInstrumentTypeDialog
              symbol={symbol}
              currentInstrumentType={instrumentClassification.instrumentType}
              triggerLabel={instrumentTypeOverride ? "Edit type" : "Correct type"}
            />
            {bucketAssignment && <RemoveHoldingBucketButton symbol={symbol} />}
            <SetHoldingBucketDialog
              symbol={symbol}
              currentBucketName={resolvedBucketName}
              triggerLabel={bucketAssignment ? "Edit bucket" : "Set bucket"}
            />
          </div>
        )}
      </div>

      {currentHoldings.map((h) => {
        const gainLoss = h.avgCost !== null ? Number(h.marketValue) - Number(h.avgCost) * Number(h.quantity) : null;
        return (
          <Card key={h.accountId}>
            <CardHeader className="flex items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{accountNames.get(h.accountId)}</CardTitle>
                {h.securityType !== "CASH" && (
                  <p className="text-sm text-muted-foreground">
                    {Number(h.quantity).toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                    {h.avgCost !== null && ` · avg cost ${formatMoney(h.avgCost, h.currency)}`}
                  </p>
                )}
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
