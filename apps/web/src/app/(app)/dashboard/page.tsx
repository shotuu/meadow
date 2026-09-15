import { readAccountBalances } from "@finance-app/finance-data";
import Link from "next/link";
import { Landmark, Receipt, Pin, CalendarClock, Wallet2 } from "lucide-react";
import { prisma, type Prisma, type AccountType } from "@finance-app/db";
import {
  classifyFundingStatus,
  computeInvestableCash,
  computeUncommittedCash,
  convertCurrency,
  summarizeSpendByCategory,
  type UsdRateMap,
} from "@finance-app/finance-logic";
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

  const computedBalances = await readAccountBalances(userId, accounts);
  const balanceByAccount = new Map([...computedBalances].map(([id, result]) => [id, result.balance]));

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

  const [cashReserves, activeObligations] = await Promise.all([
    prisma.cashReserve.findMany({ where: { userId } }),
    prisma.obligation.findMany({ where: { userId, isActive: true }, orderBy: { nextDueDate: "asc" } }),
  ]);

  const CASH_ACCOUNT_TYPES: AccountType[] = ["checking", "savings", "cash"];
  const cashBalancesByCurrency = new Map<string, number>();
  for (const account of accounts) {
    if (account.classification === "asset" && CASH_ACCOUNT_TYPES.includes(account.type)) {
      const balance = balanceByAccount.get(account.id) ?? 0;
      cashBalancesByCurrency.set(account.currency, (cashBalancesByCurrency.get(account.currency) ?? 0) + balance);
    }
  }
  const uncommittedCash = computeUncommittedCash(
    [...cashBalancesByCurrency.entries()].map(([currency, balance]) => ({ currency, balance })),
    cashReserves.map((r) => ({ currency: r.currency, targetAmount: Number(r.targetAmount) }))
  );
  const investableCash = computeInvestableCash(
    uncommittedCash,
    activeObligations.map((o) => ({
      currency: o.currency,
      amount: Number(o.amount),
      fundedAmount: Number(o.fundedAmount),
      priority: o.priority,
      nextDueDate: o.nextDueDate,
      isActive: o.isActive,
    })),
    now
  );
  const upcomingObligations = activeObligations.slice(0, 4);

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {accounts.some((a) => a.syncSource === "ibkr_flex") && (
        <p className="text-sm text-muted-foreground">Brokerage balances include positions only. Unimported brokerage cash is excluded from net worth.</p>
      )}

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

          {cashReserves.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet2 className="size-4 text-muted-foreground" />
                  Reserved vs. available cash
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[...cashBalancesByCurrency.keys()].map((currency) => (
                  <div key={currency} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{currency}</span>
                    <span className="font-amount">
                      {formatMoney(uncommittedCash[currency] ?? 0, currency)} uncommitted
                      {(investableCash[currency] ?? 0) !== (uncommittedCash[currency] ?? 0) && (
                        <> · {formatMoney(investableCash[currency] ?? 0, currency)} after upcoming bills</>
                      )}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Total cash minus your configured reserves (and, where lower, minus mandatory
                  obligations due in the next 30 days).
                </p>
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

      {upcomingObligations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              <CalendarClock className="size-3.5" />
              Upcoming obligations
            </h2>
            <Link href="/planning" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingObligations.map((o) => {
              const amount = Number(o.amount);
              const fundedAmount = Number(o.fundedAmount);
              const status = classifyFundingStatus(amount, fundedAmount);
              return (
                <Card key={o.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{o.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Progress
                      value={amount > 0 ? Math.min(100, (fundedAmount / amount) * 100) : 0}
                      indicatorClassName={status === "fully_funded" ? "bg-positive" : "bg-negative"}
                    />
                    <p className="font-amount text-sm text-muted-foreground">
                      {formatMoney(amount, o.currency)} due {o.nextDueDate.toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
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
