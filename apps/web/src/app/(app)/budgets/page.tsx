import { Wallet, Target, CalendarClock } from "lucide-react";
import { prisma, Prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { computeRequiredContribution } from "@finance-app/finance-logic";
import { computePrepaidCoverageProgress, computeRecurringBudgetProgress } from "@/lib/budget-progress";
import { SetBudgetDialog } from "./set-budget-dialog";
import { SetPrepaidCoverageDialog } from "./set-prepaid-coverage-dialog";
import { AddSinkingFundDialog, ContributeForm } from "./sinking-fund-dialog";
import { PeriodChart } from "./period-chart";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";

type CategoryWithBudgetData = Prisma.CategoryGetPayload<{
  include: { budgets: true; sinkingFunds: true; prepaidCoverage: true };
}>;

export default async function BudgetsPage() {
  const userId = await requireUserId();
  const now = new Date();

  const [appUser, categories] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.category.findMany({
      where: { userId, isArchived: false, budgetType: { not: "none" } },
      include: {
        budgets: { where: { effectiveTo: null }, take: 1 },
        sinkingFunds: true,
        prepaidCoverage: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const recurring = categories.filter(
    (c) => c.budgetType !== "sinking_fund" && c.budgetType !== "prepaid_coverage"
  );
  const sinking = categories.filter((c) => c.budgetType === "sinking_fund");
  const prepaid = categories.filter((c) => c.budgetType === "prepaid_coverage");

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Budgets</h1>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Recurring budgets
        </h2>
        <div className="grid gap-3">
          {recurring.map((category) => (
            <RecurringBudgetCard key={category.id} category={category} userId={userId} now={now} defaultCurrency={appUser.defaultCurrency} />
          ))}
          {recurring.length === 0 && (
            <EmptyState
              icon={Wallet}
              title="No recurring budgets yet"
              description="Mark a category's budget behavior on the Categories page to start tracking it here."
            />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Sinking funds</h2>
        <div className="grid gap-3">
          {sinking.map((category) => (
            <SinkingFundCard key={category.id} category={category} now={now} defaultCurrency={appUser.defaultCurrency} />
          ))}
          {sinking.length === 0 && (
            <EmptyState
              icon={Target}
              title="No sinking funds yet"
              description="Mark a category's budget behavior as sinking fund on the Categories page to save toward a goal."
            />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Prepaid bills</h2>
        <div className="grid gap-3">
          {prepaid.map((category) => (
            <PrepaidCoverageCard key={category.id} category={category} userId={userId} now={now} />
          ))}
          {prepaid.length === 0 && (
            <EmptyState
              icon={CalendarClock}
              title="No prepaid bills tracked yet"
              description="Mark a category's budget behavior as prepaid coverage on the Categories page to track a paid-through date instead of a monthly cap."
            />
          )}
        </div>
      </div>
    </div>
  );
}

async function RecurringBudgetCard({
  category,
  userId,
  now,
  defaultCurrency,
}: {
  category: CategoryWithBudgetData;
  userId: string;
  now: Date;
  defaultCurrency: string;
}) {
  const budget = category.budgets[0];

  if (!budget) {
    return (
      <Card>
        <CardHeader className="flex items-center justify-between space-y-0">
          <CardTitle className="text-base">{category.name}</CardTitle>
          <SetBudgetDialog
            categoryId={category.id}
            categoryName={category.name}
            defaultCurrency={defaultCurrency}
            rollover={category.budgetType === "rollover_envelope"}
            triggerLabel="Set budget"
          />
        </CardHeader>
      </Card>
    );
  }

  const { remaining, rolledOverAmount, safePerDay, progressValue, periods } = await computeRecurringBudgetProgress(
    userId,
    category,
    budget,
    now
  );
  const showPeriodChart = category.budgetType === "rollover_envelope" && periods && periods.length > 1;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{category.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {formatMoney(Number(budget.amount), budget.currency)} / {budget.period}
            {rolledOverAmount !== 0 && ` · ${rolledOverAmount > 0 ? "+" : ""}${formatMoney(rolledOverAmount, budget.currency)} rolled over`}
          </p>
        </div>
        <SetBudgetDialog
          categoryId={category.id}
          categoryName={category.name}
          defaultCurrency={defaultCurrency}
          rollover={category.budgetType === "rollover_envelope"}
          triggerLabel="Edit"
        />
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={progressValue} indicatorClassName={remaining < 0 ? "bg-negative" : "bg-positive"} />
        <div className="flex items-center justify-between">
          <p className={cn("font-amount text-lg font-semibold", remaining < 0 ? "text-negative" : "text-positive")}>
            {formatMoney(remaining, budget.currency)} remaining
          </p>
          <p className="text-sm text-muted-foreground">{formatMoney(safePerDay, budget.currency)}/day safe to spend</p>
        </div>
        {showPeriodChart && periods && (
          <PeriodChart periods={periods} budgetAmount={Number(budget.amount)} currency={budget.currency} />
        )}
      </CardContent>
    </Card>
  );
}

function SinkingFundCard({
  category,
  now,
  defaultCurrency,
}: {
  category: CategoryWithBudgetData;
  now: Date;
  defaultCurrency: string;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between space-y-0">
        <CardTitle className="text-base">{category.name}</CardTitle>
        <AddSinkingFundDialog categoryId={category.id} defaultCurrency={defaultCurrency} />
      </CardHeader>
      {category.sinkingFunds.length > 0 && (
        <CardContent className="space-y-4">
          {category.sinkingFunds.map((fund: CategoryWithBudgetData["sinkingFunds"][number]) => {
            const required = computeRequiredContribution(
              {
                targetAmount: Number(fund.targetAmount),
                currentBalance: Number(fund.currentBalance),
                deadlineDate: fund.deadlineDate,
              },
              now,
              "monthly"
            );
            return (
              <div key={fund.id} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{fund.name}</p>
                  <p className="font-amount text-sm">
                    {formatMoney(Number(fund.currentBalance), fund.currency)} / {formatMoney(Number(fund.targetAmount), fund.currency)}
                  </p>
                </div>
                <Progress
                  value={
                    Number(fund.targetAmount) > 0
                      ? Math.min(100, (Number(fund.currentBalance) / Number(fund.targetAmount)) * 100)
                      : 0
                  }
                  indicatorClassName="bg-positive"
                />
                <p className="text-sm text-muted-foreground">
                  Due {fund.deadlineDate.toLocaleDateString()} · {formatMoney(required, fund.currency)}/month needed
                </p>
                <ContributeForm sinkingFundId={fund.id} />
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

async function PrepaidCoverageCard({
  category,
  userId,
  now,
}: {
  category: CategoryWithBudgetData;
  userId: string;
  now: Date;
}) {
  const config = category.prepaidCoverage;

  if (!config) {
    return (
      <Card>
        <CardHeader className="flex items-center justify-between space-y-0">
          <CardTitle className="text-base">{category.name}</CardTitle>
          <SetPrepaidCoverageDialog categoryId={category.id} categoryName={category.name} triggerLabel="Set coverage" />
        </CardHeader>
      </Card>
    );
  }

  const status = await computePrepaidCoverageProgress(userId, category.id, config.coverageMonths, now);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{category.name}</CardTitle>
          <p className="text-sm text-muted-foreground">Every {config.coverageMonths} months</p>
        </div>
        <SetPrepaidCoverageDialog
          categoryId={category.id}
          categoryName={category.name}
          coverageMonths={config.coverageMonths}
          triggerLabel="Edit"
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {status.lastPaymentDate === null ? (
          <p className="text-sm text-muted-foreground">
            No payment recorded yet — coverage starts tracking once a transaction lands in this category.
          </p>
        ) : status.isOverdue ? (
          <>
            <Progress value={100} indicatorClassName="bg-negative" />
            <p className="font-amount text-lg font-semibold text-negative">
              Overdue since {status.paidThrough!.toLocaleDateString()}
            </p>
          </>
        ) : (
          (() => {
            const totalDays = Math.round(
              (status.paidThrough!.getTime() - status.lastPaymentDate!.getTime()) / (24 * 60 * 60 * 1000)
            );
            const elapsedDays = totalDays - (status.daysRemaining ?? 0);
            const percentElapsed = totalDays > 0 ? Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100)) : 100;
            return (
              <>
                <Progress value={percentElapsed} indicatorClassName="bg-positive" />
                <div className="flex items-center justify-between">
                  <p className="font-amount text-lg font-semibold text-positive">
                    Paid through {status.paidThrough!.toLocaleDateString()}
                  </p>
                  <p className="text-sm text-muted-foreground">{status.daysRemaining} days left</p>
                </div>
              </>
            );
          })()
        )}
      </CardContent>
    </Card>
  );
}
