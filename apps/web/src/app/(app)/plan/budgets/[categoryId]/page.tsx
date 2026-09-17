import { notFound } from "next/navigation";
import { prisma, Prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { computeRequiredContribution } from "@finance-app/finance-logic";
import { computePrepaidCoverageProgress, computeRecurringBudgetProgress } from "@/lib/budget-progress";
import { AppHeader } from "@/components/app-header";
import { Answer, SectionLabel, Meta } from "@/components/typography";
import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@/lib/format";
import { SetBudgetDialog } from "../../../budgets/set-budget-dialog";
import { AddSinkingFundDialog, ContributeForm } from "../../../budgets/sinking-fund-dialog";
import { SetPrepaidCoverageDialog } from "../../../budgets/set-prepaid-coverage-dialog";
import { PeriodChart } from "../../../budgets/period-chart";

// Drill-down detail for one budgeted category -- reached by tapping a
// compact row on /plan. Preserves the richer history/rollover/config
// controls that used to live directly on the old card-based /budgets page;
// the compact row on /plan only ever shows a one-line summary. Branches on
// budgetType because the three budget types are semantically distinct
// (period-remaining vs. deadline-savings vs. paid-through-date), not one
// shared shape forced into a common display -- same principle the compact
// rows on /plan follow.
export default async function PlanBudgetDetailPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const userId = await requireUserId();
  const { categoryId } = await params;
  const now = new Date();

  const [appUser, category] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.category.findFirst({
      where: { id: categoryId, userId, isArchived: false, budgetType: { not: "none" } },
      include: {
        budgets: { where: { effectiveTo: null }, take: 1 },
        sinkingFunds: true,
        prepaidCoverage: true,
      },
    }),
  ]);
  if (!category) notFound();

  const isRecurring = category.budgetType === "monthly_reset" || category.budgetType === "rollover_envelope";
  const isSinkingFund = category.budgetType === "sinking_fund";
  const isPrepaid = category.budgetType === "prepaid_coverage";

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <AppHeader
        title={category.name}
        backHref="/plan"
        overflow={
          isRecurring ? (
            <SetBudgetDialog
              categoryId={category.id}
              categoryName={category.name}
              defaultCurrency={appUser.defaultCurrency}
              rollover={category.budgetType === "rollover_envelope"}
              triggerLabel={category.budgets[0] ? "Edit budget" : "Set budget"}
            />
          ) : isSinkingFund ? (
            <AddSinkingFundDialog categoryId={category.id} defaultCurrency={appUser.defaultCurrency} />
          ) : isPrepaid ? (
            <SetPrepaidCoverageDialog
              categoryId={category.id}
              categoryName={category.name}
              coverageMonths={category.prepaidCoverage?.coverageMonths}
              triggerLabel={category.prepaidCoverage ? "Edit coverage" : "Set coverage"}
            />
          ) : undefined
        }
      />

      {isRecurring && <RecurringDetail category={category} userId={userId} now={now} />}
      {isSinkingFund && <SinkingFundDetail category={category} now={now} />}
      {isPrepaid && <PrepaidDetail category={category} userId={userId} now={now} />}
    </div>
  );
}

type CategoryDetail = Prisma.CategoryGetPayload<{
  include: { budgets: true; sinkingFunds: true; prepaidCoverage: true };
}>;

async function RecurringDetail({ category, userId, now }: { category: CategoryDetail; userId: string; now: Date }) {
  const budget = category.budgets[0];

  if (!budget) {
    return <Meta>No budget set for this category yet — use &quot;Set budget&quot; above to start tracking it.</Meta>;
  }

  const { remaining, rolledOverAmount, safePerDay, progressValue, periods, conversionIncomplete } = await computeRecurringBudgetProgress(
    userId,
    category,
    budget,
    now
  );
  const showPeriodChart = category.budgetType === "rollover_envelope" && periods && periods.length > 1;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <SectionLabel>
          {formatMoney(Number(budget.amount), budget.currency)} / {budget.period}
          {rolledOverAmount !== 0 &&
            ` · ${rolledOverAmount > 0 ? "+" : ""}${formatMoney(rolledOverAmount, budget.currency)} rolled over`}
        </SectionLabel>
        <Answer className={remaining < 0 ? "text-negative" : "text-positive"}>
          {formatMoney(remaining, budget.currency)} remaining
        </Answer>
        <Meta>{formatMoney(safePerDay, budget.currency)}/day safe to spend</Meta>
        {conversionIncomplete && (
          <Meta>
            Some transactions couldn&apos;t be converted to {budget.currency} (exchange rate not yet available) — this total may be incomplete.
          </Meta>
        )}
      </div>
      <Progress value={progressValue} indicatorClassName={remaining < 0 ? "bg-negative" : "bg-positive"} />
      {showPeriodChart && periods && (
        <div className="space-y-2 pt-2">
          <SectionLabel>History</SectionLabel>
          <PeriodChart periods={periods} budgetAmount={Number(budget.amount)} currency={budget.currency} />
        </div>
      )}
    </div>
  );
}

function SinkingFundDetail({ category, now }: { category: CategoryDetail; now: Date }) {
  if (category.sinkingFunds.length === 0) {
    return <Meta>No sinking fund set for this category yet — use &quot;Add sinking fund&quot; above to start one.</Meta>;
  }

  return (
    <div className="divide-y divide-border">
      {category.sinkingFunds.map((fund) => {
        const required = computeRequiredContribution(
          { targetAmount: Number(fund.targetAmount), currentBalance: Number(fund.currentBalance), deadlineDate: fund.deadlineDate },
          now,
          "monthly"
        );
        return (
          <div key={fund.id} className="space-y-3 py-4 first:pt-0">
            <div className="space-y-1">
              <SectionLabel>{fund.name}</SectionLabel>
              <Answer>
                {formatMoney(Number(fund.currentBalance), fund.currency)}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  of {formatMoney(Number(fund.targetAmount), fund.currency)}
                </span>
              </Answer>
              <Meta>
                Due {fund.deadlineDate.toLocaleDateString()} · {formatMoney(required, fund.currency)}/month needed
              </Meta>
            </div>
            <Progress
              value={
                Number(fund.targetAmount) > 0
                  ? Math.min(100, (Number(fund.currentBalance) / Number(fund.targetAmount)) * 100)
                  : 0
              }
              indicatorClassName="bg-positive"
            />
            <ContributeForm sinkingFundId={fund.id} />
          </div>
        );
      })}
    </div>
  );
}

async function PrepaidDetail({ category, userId, now }: { category: CategoryDetail; userId: string; now: Date }) {
  const config = category.prepaidCoverage;
  if (!config) {
    return <Meta>No coverage length set for this category yet — use &quot;Set coverage&quot; above to start tracking it.</Meta>;
  }

  const status = await computePrepaidCoverageProgress(userId, category.id, config.coverageMonths, now);

  return (
    <div className="space-y-3">
      <SectionLabel>Every {config.coverageMonths} months</SectionLabel>
      {status.lastPaymentDate === null ? (
        <Meta>No payment recorded yet — coverage starts tracking once a transaction lands in this category.</Meta>
      ) : status.isOverdue ? (
        <>
          <Progress value={100} indicatorClassName="bg-negative" />
          <Answer className="text-negative">Overdue since {status.paidThrough!.toLocaleDateString()}</Answer>
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
              <Answer className="text-positive">Paid through {status.paidThrough!.toLocaleDateString()}</Answer>
              <Meta>{status.daysRemaining} days left</Meta>
            </>
          );
        })()
      )}
    </div>
  );
}
