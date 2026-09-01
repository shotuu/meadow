import { Wallet, Receipt } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LOW_CONFIDENCE_THRESHOLD } from "@finance-app/categorization-ai";
import { NewTransactionDialog } from "./new-transaction-dialog";
import { ImportCsvDialog } from "./import-csv-dialog";
import { CategoryPicker } from "./category-picker";
import { CategoryFilter } from "./category-filter";
import { CategoryPieChart } from "./category-pie-chart";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { getPeriodRange, convertCurrency, summarizeSpendByCategory, type UsdRateMap } from "@finance-app/finance-logic";

const TRANSACTION_SELECT = {
  id: true,
  description: true,
  amount: true,
  currency: true,
  date: true,
  isTransfer: true,
  categoryId: true,
  categorySource: true,
  categoryConfidence: true,
  account: { select: { name: true } },
  category: { select: { name: true } },
} as const;

type TransactionRowData = {
  id: string;
  description: string;
  amount: unknown;
  currency: string;
  date: Date;
  isTransfer: boolean;
  categoryId: string | null;
  categorySource: "rule" | "ai" | "manual" | "uncategorized";
  categoryConfidence: unknown;
  account: { name: string };
  category: { name: string } | null;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const userId = await requireUserId();
  const { category: categoryParam } = await searchParams;
  const categoryFilter = categoryParam && categoryParam !== "__all__" ? categoryParam : undefined;

  const [appUser, accounts, categories, transactions, needsReview] = await Promise.all([
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
      where: { userId, ...(categoryFilter && { categoryId: categoryFilter }) },
      select: TRANSACTION_SELECT,
      orderBy: { date: "desc" },
      take: 100,
    }),
    // Ignores the category filter -- most rows here are uncategorized
    // (no categoryId to filter on), so filtering by category would make
    // this tab look empty whenever any specific category is selected.
    prisma.transaction.findMany({
      where: {
        userId,
        isTransfer: false,
        OR: [
          { categorySource: "uncategorized" },
          { categorySource: "ai", categoryConfidence: { lt: LOW_CONFIDENCE_THRESHOLD } },
        ],
      },
      select: TRANSACTION_SELECT,
      orderBy: { date: "desc" },
      take: 200,
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
  const spendBuckets = summarizeSpendByCategory(spendRows, 5);

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
            <CategoryPieChart data={spendBuckets} currency={appUser.defaultCurrency} />
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
        <Tabs defaultValue="all">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList>
              <TabsTrigger value="all">All ({transactions.length})</TabsTrigger>
              <TabsTrigger value="review">
                Needs review
                {needsReview.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {needsReview.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <CategoryFilter categories={categories} selected={categoryFilter} />
          </div>

          <TabsContent value="all" className="mt-3">
            <TransactionList transactions={transactions} categories={categories} />
          </TabsContent>
          <TabsContent value="review" className="mt-3">
            {needsReview.length === 0 ? (
              <EmptyState icon={Receipt} title="Nothing needs review" description="Every transaction has a confident category." />
            ) : (
              <TransactionList transactions={needsReview} categories={categories} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function TransactionList({
  transactions,
  categories,
}: {
  transactions: TransactionRowData[];
  categories: { id: string; name: string }[];
}) {
  return (
    <div className="divide-y rounded-lg border">
      {transactions.map((t) => (
        <TransactionRow key={t.id} transaction={t} categories={categories} />
      ))}
    </div>
  );
}

function TransactionRow({
  transaction: t,
  categories,
}: {
  transaction: TransactionRowData;
  categories: { id: string; name: string }[];
}) {
  const amount = Number(t.amount);
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
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
        <CategoryPicker
          transactionId={t.id}
          categoryId={t.categoryId}
          categories={categories}
          categorySource={t.categorySource}
          categoryConfidence={t.categoryConfidence == null ? null : Number(t.categoryConfidence)}
        />
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
}
