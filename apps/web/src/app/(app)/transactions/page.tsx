import { Wallet, Receipt } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewTransactionDialog } from "./new-transaction-dialog";
import { ImportCsvDialog } from "./import-csv-dialog";
import { CategoryPicker } from "./category-picker";
import { SpendByCategoryChart } from "./spend-by-category-chart";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { getPeriodRange, convertCurrency, summarizeSpendByCategory, type UsdRateMap } from "@finance-app/finance-logic";

export default async function TransactionsPage() {
  const userId = await requireUserId();

  const [appUser, accounts, categories, transactions] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.financialAccount.findMany({
      where: { userId, isArchived: false },
      select: { id: true, name: true, currency: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { userId, isArchived: false, kind: { in: ["income", "expense"] } },
      select: { id: true, name: true, kind: true },
      orderBy: { name: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: { account: { select: { name: true, currency: true } }, category: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 100,
    }),
  ]);

  const monthRange = getPeriodRange("monthly", new Date());
  const monthlyExpenses = await prisma.transaction.findMany({
    where: {
      userId,
      isTransfer: false,
      category: { kind: "expense" },
      date: { gte: monthRange.start, lt: monthRange.end },
    },
    select: { amount: true, currency: true, categoryId: true, category: { select: { name: true } } },
  });

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

  const convertedExpenses = monthlyExpenses.map((t) => ({
    categoryId: t.categoryId,
    categoryName: t.category?.name,
    converted: convertCurrency(Number(t.amount), t.currency, appUser.defaultCurrency, usdRates),
  }));
  const spendConversionIncomplete = convertedExpenses.some((e) => e.converted === null);
  const spendRows = convertedExpenses.flatMap((e) =>
    e.converted !== null && e.categoryId && e.categoryName
      ? [{ categoryId: e.categoryId, categoryName: e.categoryName, amount: Math.abs(e.converted) }]
      : []
  );
  const spendBuckets = summarizeSpendByCategory(spendRows, 4);

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <div className="flex flex-wrap gap-2">
          <ImportCsvDialog accounts={accounts} />
          <NewTransactionDialog accounts={accounts} categories={categories} />
        </div>
      </div>

      {spendBuckets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending this month ({appUser.defaultCurrency})</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendByCategoryChart data={spendBuckets} currency={appUser.defaultCurrency} />
            {spendConversionIncomplete && (
              <p className="mt-2 text-sm text-muted-foreground">
                Some transactions couldn&apos;t be converted (exchange rates not yet available for that
                currency) — this chart may be incomplete.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add an account first before recording transactions."
        />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Add one manually or import a CSV."
        />
      ) : (
        <div className="divide-y rounded-lg border">
          {transactions.map((t) => {
            const amount = Number(t.amount);
            return (
              <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.account.name} · {new Date(t.date).toLocaleDateString()}
                    {t.isTransfer && (
                      <Badge variant="outline" className="ml-2">
                        transfer
                      </Badge>
                    )}
                  </p>
                </div>
                {!t.isTransfer && (
                  <CategoryPicker transactionId={t.id} categoryId={t.categoryId} categories={categories} />
                )}
                <p
                  className={cn(
                    "font-amount w-28 shrink-0 text-right font-semibold",
                    amount > 0 ? "text-positive" : amount < 0 ? "text-negative" : ""
                  )}
                >
                  {formatMoney(amount, t.currency, { signDisplay: "always" })}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
