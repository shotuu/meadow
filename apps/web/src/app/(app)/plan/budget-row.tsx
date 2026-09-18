import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import type { Prisma } from "@finance-app/db";
import { computePrepaidCoverageProgress, computeRecurringBudgetProgress } from "@/lib/budget-progress";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SetBudgetDialog } from "../budgets/set-budget-dialog";
import { AddSinkingFundDialog } from "../budgets/sinking-fund-dialog";
import { SetPrepaidCoverageDialog } from "../budgets/set-prepaid-coverage-dialog";

export type CategoryWithBudgetData = Prisma.CategoryGetPayload<{
  include: { budgets: true; sinkingFunds: true; prepaidCoverage: true };
}>;

// Compact, hairline-divided rows for Plan's category list -- one line per
// category, tap-through to /plan/budgets/[id] for the richer history/
// rollover/config view. Each budget type gets its own row component
// (rather than one shared shape) because "remaining of a period budget,"
// "saved toward a deadline," and "paid through a date" are semantically
// different answers, not the same number phrased differently -- forcing
// them into a common calculation would misrepresent at least two of the
// three.
function Row({
  href,
  name,
  detail,
  action,
}: {
  href?: string;
  name: string;
  detail: React.ReactNode;
  action?: React.ReactNode;
}) {
  const content = (
    <>
      <span className="truncate text-sm font-medium">{name}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
        {detail}
        {href && <ChevronRight className="size-4" />}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-primary">
        {content}
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="truncate text-sm font-medium">{name}</span>
      <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
        {detail}
        {action}
      </span>
    </div>
  );
}

export async function RecurringBudgetRow({
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
      <Row
        name={category.name}
        detail="No budget"
        action={
          <SetBudgetDialog
            categoryId={category.id}
            categoryName={category.name}
            defaultCurrency={defaultCurrency}
            rollover={category.budgetType === "rollover_envelope"}
            triggerLabel="Set"
          />
        }
      />
    );
  }

  const { remaining, rolledOverAmount, conversionIncomplete } = await computeRecurringBudgetProgress(
    userId,
    category,
    budget,
    now
  );

  // rollover_envelope's "available" balance folds in carryover from prior
  // periods, so it can legitimately exceed this period's own budget amount
  // (e.g. "$400 available" against a "$200 monthly" budget) -- phrasing
  // that as "remaining of $200" (monthly_reset's correct phrasing, where
  // the two numbers really are directly comparable) reads as a math error.
  // Break the two apart instead of forcing rollover into monthly_reset's
  // sentence shape.
  const isRollover = category.budgetType === "rollover_envelope";

  return (
    <Row
      href={`/plan/budgets/${category.id}`}
      name={category.name}
      detail={
        <>
          {isRollover ? (
            <span className="flex flex-col items-end gap-0.5">
              <span className={cn("font-amount", remaining < 0 ? "text-negative" : "text-foreground")}>
                {formatMoney(remaining, budget.currency)} available
              </span>
              <span className="text-xs">
                {formatMoney(Number(budget.amount), budget.currency)} monthly
                {rolledOverAmount !== 0 &&
                  ` · ${
                    rolledOverAmount > 0
                      ? `+${formatMoney(rolledOverAmount, budget.currency)} carried over`
                      : `${formatMoney(Math.abs(rolledOverAmount), budget.currency)} shortfall carried over`
                  }`}
              </span>
            </span>
          ) : (
            <span className={cn("font-amount", remaining < 0 ? "text-negative" : "text-foreground")}>
              {formatMoney(remaining, budget.currency)} remaining of {formatMoney(Number(budget.amount), budget.currency)}
            </span>
          )}
          {conversionIncomplete && (
            <Tooltip>
              <TooltipTrigger aria-label="This total may be incomplete">
                <Info className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                Some transactions couldn&apos;t be converted to {budget.currency} (exchange rate not yet available) — this total may be incomplete.
              </TooltipContent>
            </Tooltip>
          )}
        </>
      }
    />
  );
}

export function SinkingFundRow({
  category,
  defaultCurrency,
}: {
  category: CategoryWithBudgetData;
  defaultCurrency: string;
}) {
  const funds = category.sinkingFunds;

  if (funds.length === 0) {
    return (
      <Row
        name={category.name}
        detail="No fund"
        action={<AddSinkingFundDialog categoryId={category.id} defaultCurrency={defaultCurrency} />}
      />
    );
  }

  const currencies = new Set(funds.map((f) => f.currency));
  const detail =
    currencies.size === 1
      ? (() => {
          const currency = funds[0].currency;
          const saved = funds.reduce((sum, f) => sum + Number(f.currentBalance), 0);
          const target = funds.reduce((sum, f) => sum + Number(f.targetAmount), 0);
          return (
            <span className="font-amount">
              {formatMoney(saved, currency)} saved of {formatMoney(target, currency)}
            </span>
          );
        })()
      : `${funds.length} funds`;

  return <Row href={`/plan/budgets/${category.id}`} name={category.name} detail={detail} />;
}

export async function PrepaidCoverageRow({
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
      <Row
        name={category.name}
        detail="No coverage set"
        action={
          <SetPrepaidCoverageDialog categoryId={category.id} categoryName={category.name} triggerLabel="Set" />
        }
      />
    );
  }

  const status = await computePrepaidCoverageProgress(userId, category.id, config.coverageMonths, now);
  const detail =
    status.lastPaymentDate === null
      ? "No payment recorded"
      : status.isOverdue
        ? <span className="text-negative">Overdue since {status.paidThrough!.toLocaleDateString()}</span>
        : `Paid through ${status.paidThrough!.toLocaleDateString()}`;

  return <Row href={`/plan/budgets/${category.id}`} name={category.name} detail={detail} />;
}
