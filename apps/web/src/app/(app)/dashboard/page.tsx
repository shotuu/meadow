import Link from "next/link";
import { Landmark, Receipt, Pin } from "lucide-react";
import { prisma, type Prisma } from "@finance-app/db";
import { convertCurrency, summarizeSpendByCategory, type UsdRateMap } from "@finance-app/finance-logic";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { summarizeByClassification } from "@/lib/balances";
import { computePrepaidCoverageProgress, computeRecurringBudgetProgress } from "@/lib/budget-progress";
import { ACCOUNT_TYPE_LABEL } from "@/lib/account-types";
import { CompositionChart } from "@/components/composition-chart";
import { AssetMixChart } from "./asset-mix-chart";
import { AccountList, type AccountListRow } from "./account-list";
import { EmptyState } from "@/components/empty-state";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const now = new Date();

  const [appUser, accounts, recentTransactions, pinnedCategories] = await Promise.all([
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
    prisma.category.findMany({
      where: { userId, isArchived: false, pinnedToDashboard: true },
      include: {
        budgets: { where: { effectiveTo: null }, take: 1 },
        sinkingFunds: true,
        prepaidCoverage: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // IBKR-synced accounts have no Transaction rows at all -- their balance
  // comes from InvestmentHolding market values instead (latest asOfDate per
  // symbol). Mirrors accounts/page.tsx's balance computation so net worth
  // here doesn't silently exclude every brokerage account.
  const balanceByAccount = new Map<string, number>(
    accounts.map((a) => [a.id, a.transactions.reduce((sum, t) => sum + Number(t.amount), 0)])
  );

  // Plaid-synced accounts have a real balance on file (refreshed via
  // /accounts/balance/get on every sync) that's authoritative over the
  // transaction sum -- see the identical comment in accounts/page.tsx.
  for (const a of accounts) {
    if (a.syncSource === "plaid" && a.currentBalance !== null) {
      balanceByAccount.set(a.id, Number(a.currentBalance));
    }
  }

  const ibkrAccountIds = accounts.filter((a) => a.syncSource === "ibkr_flex").map((a) => a.id);
  if (ibkrAccountIds.length > 0) {
    const holdings = await prisma.investmentHolding.findMany({
      where: { accountId: { in: ibkrAccountIds } },
    });
    const latestBySymbol = new Map<string, (typeof holdings)[number]>();
    for (const h of holdings) {
      const key = `${h.accountId}:${h.symbol}`;
      const existing = latestBySymbol.get(key);
      if (!existing || h.asOfDate > existing.asOfDate) latestBySymbol.set(key, h);
    }
    for (const h of latestBySymbol.values()) {
      balanceByAccount.set(h.accountId, (balanceByAccount.get(h.accountId) ?? 0) + Number(h.marketValue));
    }
  }

  const byCurrency = summarizeByClassification(
    accounts.map((account) => ({
      classification: account.classification,
      currency: account.currency,
      balance: balanceByAccount.get(account.id) ?? 0,
    }))
  );

  const accountRowsByCurrency = new Map<string, AccountListRow[]>();
  for (const account of accounts) {
    const row: AccountListRow = {
      id: account.id,
      name: account.name,
      type: account.type,
      classification: account.classification,
      balance: balanceByAccount.get(account.id) ?? 0,
    };
    const rows = accountRowsByCurrency.get(account.currency) ?? [];
    rows.push(row);
    accountRowsByCurrency.set(account.currency, rows);
  }

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
            {[...byCurrency.entries()].map(([currency, totals]) => {
              const rows = accountRowsByCurrency.get(currency) ?? [];
              const assetBuckets = summarizeSpendByCategory(
                rows
                  .filter((r) => r.classification === "asset")
                  .map((r) => ({ categoryId: r.type, categoryName: ACCOUNT_TYPE_LABEL[r.type], amount: r.balance })),
                5
              );
              return (
                <Card key={currency}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Landmark className="size-4 text-muted-foreground" />
                      Net worth ({currency})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                    {assetBuckets.length > 0 && (
                      <div className="border-t pt-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Asset mix
                        </p>
                        <AssetMixChart data={assetBuckets} currency={currency} />
                      </div>
                    )}
                    {rows.length > 0 && (
                      <div className="border-t pt-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Accounts
                          </p>
                          <Link href="/accounts" className="text-xs text-primary hover:underline">
                            View all
                          </Link>
                        </div>
                        <AccountList accounts={rows} currency={currency} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {pinnedCategories.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              <Pin className="size-3.5" />
              Pinned budgets
            </h2>
            <Link href="/budgets" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {pinnedCategories.map((category) => (
              <PinnedBudgetCard key={category.id} category={category} userId={userId} now={now} />
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

type PinnedCategory = Prisma.CategoryGetPayload<{
  include: { budgets: true; sinkingFunds: true; prepaidCoverage: true };
}>;

// Mirrors budgets/page.tsx's two card types but condensed to a single small
// progress bar each -- this is meant to be a glanceable summary, not a
// replacement for the full Budgets page (which every card links back to
// via the section's "View all").
async function PinnedBudgetCard({ category, userId, now }: { category: PinnedCategory; userId: string; now: Date }) {
  if (category.budgetType === "sinking_fund") {
    const fund = category.sinkingFunds[0];
    if (!fund) return null;
    const target = Number(fund.targetAmount);
    const current = Number(fund.currentBalance);
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{category.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={target > 0 ? Math.min(100, (current / target) * 100) : 0} indicatorClassName="bg-positive" />
          <p className="font-amount text-sm text-muted-foreground">
            {formatMoney(current, fund.currency)} / {formatMoney(target, fund.currency)} saved
          </p>
        </CardContent>
      </Card>
    );
  }

  if (category.budgetType === "prepaid_coverage") {
    const config = category.prepaidCoverage;
    if (!config) return null;
    const status = await computePrepaidCoverageProgress(userId, category.id, config.coverageMonths, now);
    if (status.lastPaymentDate === null) return null;

    const totalDays = status.isOverdue
      ? 1
      : Math.round((status.paidThrough!.getTime() - status.lastPaymentDate.getTime()) / (24 * 60 * 60 * 1000));
    const elapsedDays = totalDays - (status.daysRemaining ?? 0);
    const percentElapsed = status.isOverdue
      ? 100
      : totalDays > 0
        ? Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100))
        : 100;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{category.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={percentElapsed} indicatorClassName={status.isOverdue ? "bg-negative" : "bg-positive"} />
          <p
            className={cn(
              "font-amount text-sm font-medium",
              status.isOverdue ? "text-negative" : "text-positive"
            )}
          >
            {status.isOverdue ? "Overdue since" : "Paid through"} {status.paidThrough!.toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    );
  }

  const budget = category.budgets[0];
  if (!budget) return null;

  const { remaining, progressValue } = await computeRecurringBudgetProgress(userId, category, budget, now);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{category.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={progressValue} indicatorClassName={remaining < 0 ? "bg-negative" : "bg-positive"} />
        <p className={cn("font-amount text-sm font-medium", remaining < 0 ? "text-negative" : "text-positive")}>
          {formatMoney(remaining, budget.currency)} remaining
        </p>
      </CardContent>
    </Card>
  );
}
