import Link from "next/link";
import { Landmark, Receipt } from "lucide-react";
import { prisma } from "@finance-app/db";
import { convertCurrency, type UsdRateMap } from "@finance-app/finance-logic";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { summarizeByClassification } from "@/lib/balances";
import { CompositionChart } from "@/components/composition-chart";
import { EmptyState } from "@/components/empty-state";

export default async function DashboardPage() {
  const userId = await requireUserId();

  const [appUser, accounts, recentTransactions] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.financialAccount.findMany({
      where: { userId, isArchived: false },
      include: { transactions: { select: { amount: true } } },
    }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 8,
      include: { account: { select: { name: true } } },
    }),
  ]);

  const byCurrency = summarizeByClassification(
    accounts.map((account) => ({
      classification: account.classification,
      currency: account.currency,
      balance: account.transactions.reduce((sum, t) => sum + Number(t.amount), 0),
    }))
  );

  const defaultCurrency = appUser.defaultCurrency;
  const latestRateDate = await prisma.exchangeRate.aggregate({
    where: { baseCurrency: "USD" },
    _max: { asOfDate: true },
  });
  const rateRows = latestRateDate._max.asOfDate
    ? await prisma.exchangeRate.findMany({
        where: { baseCurrency: "USD", asOfDate: latestRateDate._max.asOfDate },
      })
    : [];
  const usdRates: UsdRateMap = Object.fromEntries(rateRows.map((r) => [r.quoteCurrency, Number(r.rate)]));

  let convertedTotal = 0;
  let conversionIncomplete = false;
  for (const [currency, { assets, liabilities }] of byCurrency) {
    const converted = convertCurrency(assets + liabilities, currency, defaultCurrency, usdRates);
    if (converted === null) {
      conversionIncomplete = true;
      continue;
    }
    convertedTotal += converted;
  }

  const isSingleDefaultCurrency = byCurrency.size <= 1 && byCurrency.has(defaultCurrency);

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {byCurrency.size === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No net worth to show yet"
          description="Add an account and a few transactions to see your net worth here."
        />
      ) : (
        <div className="space-y-3">
          {!isSingleDefaultCurrency && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="size-4 text-muted-foreground" />
                  Net worth ({defaultCurrency})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-amount text-2xl font-semibold">
                  {formatMoney(convertedTotal, defaultCurrency)}
                </p>
                {conversionIncomplete && (
                  <p className="text-sm text-muted-foreground">
                    Some balances couldn&apos;t be converted (exchange rates not yet available for
                    that currency) — this total may be incomplete.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {[...byCurrency.entries()].map(([currency, totals]) => (
              <Card key={currency}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Landmark className="size-4 text-muted-foreground" />
                    Net worth ({currency})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <p className="font-amount text-2xl font-semibold">
                      {formatMoney(totals.assets + totals.liabilities, currency)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatMoney(totals.assets, currency)} assets ·{" "}
                      {formatMoney(totals.liabilities, currency)} liabilities
                    </p>
                  </div>
                  <CompositionChart assets={totals.assets} liabilities={totals.liabilities} currency={currency} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Recent transactions
          </h2>
          <Link href="/transactions" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {recentTransactions.length === 0 ? (
          <EmptyState icon={Receipt} title="No transactions yet" />
        ) : (
        <div className="divide-y rounded-lg border">
          {recentTransactions.map((t) => {
            const amount = Number(t.amount);
            return (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium">{t.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.account.name} · {new Date(t.date).toLocaleDateString()}
                  </p>
                </div>
                <p
                  className={cn(
                    "font-amount font-semibold",
                    amount > 0 ? "text-positive" : amount < 0 ? "text-negative" : ""
                  )}
                >
                  {formatMoney(amount, t.currency)}
                </p>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
