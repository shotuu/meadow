import Link from "next/link";
import { CalendarClock, PiggyBank, Wallet2 } from "lucide-react";
import { prisma } from "@finance-app/db";
import { readAccountBalances, readUsdRates, computeMonthlyBudgetOverview } from "@finance-app/finance-data";
import { CASH_ACCOUNT_TYPES, computeGenuinelyFreeCashByCurrency, convertCurrency } from "@finance-app/finance-logic";
import { requireUserId } from "@/lib/session";
import { AppHeader } from "@/components/app-header";
import { Answer, SectionLabel, Meta } from "@/components/typography";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/empty-state";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RecurringBudgetRow, SinkingFundRow, PrepaidCoverageRow } from "./budget-row";
import { GenuinelyFreeSection, type GenuinelyFreeState } from "./genuinely-free-section";
import { SetCashReserveDialog } from "../planning/set-cash-reserve-dialog";
import { DeleteCashReserveButton } from "../planning/delete-cash-reserve-button";
import { NewObligationDialog } from "../planning/new-obligation-dialog";
import { MarkObligationPaidForm } from "../planning/mark-obligation-paid-form";
import { NewIncomeStreamDialog } from "../planning/new-income-stream-dialog";
import { DeactivateIncomeStreamButton } from "../planning/deactivate-income-stream-button";

const FUNDING_STATUS_LABEL: Record<string, string> = {
  unfunded: "Unfunded",
  partially_funded: "Partially funded",
  fully_funded: "Fully funded",
};

// The real primary planning destination -- replaces /plan's Phase 2
// temporary compromise (rendering Budgets verbatim). Integrates Cash
// Reserves, Income Streams and Obligations from the old /planning page in
// alongside the compact budget rows, per PROGRESS.md's Phase 6 plan.
// /budgets and /planning stay reachable as their original card-based
// views (compatibility routes) -- their own page bodies are intentionally
// untouched by this page.
export default async function PlanPage() {
  const userId = await requireUserId();
  const now = new Date();

  const [appUser, accounts] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.financialAccount.findMany({ where: { userId, isArchived: false } }),
  ]);
  const defaultCurrency = appUser.defaultCurrency;
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

  const [balanceByAccountResult, usdRates, categories, cashReserves, obligations, incomeStreams, thisMonth] =
    await Promise.all([
      readAccountBalances(userId, accounts),
      readUsdRates(now),
      prisma.category.findMany({
        where: { userId, isArchived: false, budgetType: { not: "none" } },
        include: { budgets: { where: { effectiveTo: null }, take: 1 }, sinkingFunds: true, prepaidCoverage: true },
        orderBy: { name: "asc" },
      }),
      prisma.cashReserve.findMany({ where: { userId }, orderBy: { name: "asc" } }),
      prisma.obligation.findMany({ where: { userId, isActive: true }, orderBy: { nextDueDate: "asc" } }),
      prisma.incomeStream.findMany({ where: { userId, isActive: true }, orderBy: { nextExpectedDate: "asc" } }),
      computeMonthlyBudgetOverview(userId, now, defaultCurrency),
    ]);

  // "What's genuinely free" -- audited semantics (see cash-policy.ts and
  // PROGRESS.md's Phase 6 entry): computeUncommittedCash needs at least one
  // CashReserve to mean anything, computeInvestableCash further needs at
  // least one Obligation, for the same reason (zero of either is
  // indistinguishable from "never configured"). Real per-currency math
  // (never floored/derived twice -- computeGenuinelyFreeCashByCurrency
  // derives its reconciliation lines from the same real functions), then
  // converted to defaultCurrency and summed for one headline figure.
  const cashBalances = accounts.flatMap((a) => {
    if (a.classification !== "asset") return [];
    if (!(CASH_ACCOUNT_TYPES as readonly string[]).includes(a.type)) return [];
    return [{ currency: a.currency, balance: balanceByAccountResult.get(a.id)?.balance ?? 0 }];
  });
  const reserveConfigs = cashReserves.map((r) => ({ currency: r.currency, targetAmount: Number(r.targetAmount) }));
  const obligationConfigs = obligations.map((o) => ({
    currency: o.currency,
    amount: Number(o.amount),
    fundedAmount: Number(o.fundedAmount),
    priority: o.priority,
    nextDueDate: o.nextDueDate,
    isActive: o.isActive,
  }));

  let genuinelyFreeState: GenuinelyFreeState;
  if (cashReserves.length === 0 && obligations.length === 0) {
    genuinelyFreeState = { kind: "incomplete", missing: "both" };
  } else if (cashReserves.length === 0) {
    genuinelyFreeState = { kind: "incomplete", missing: "reserves" };
  } else if (obligations.length === 0) {
    genuinelyFreeState = { kind: "incomplete", missing: "obligations" };
  } else {
    const lines = computeGenuinelyFreeCashByCurrency(cashBalances, reserveConfigs, obligationConfigs, now);
    let totalEligible = 0;
    let totalReserved = 0;
    let totalObligations = 0;
    let totalFree = 0;
    let conversionIncomplete = false;
    for (const line of lines) {
      const eligible = convertCurrency(line.eligibleCash, line.currency, defaultCurrency, usdRates);
      const reserved = convertCurrency(line.reservedCash, line.currency, defaultCurrency, usdRates);
      const relevantObligations = convertCurrency(line.relevantObligations, line.currency, defaultCurrency, usdRates);
      const free = convertCurrency(line.genuinelyFree, line.currency, defaultCurrency, usdRates);
      if (eligible === null || reserved === null || relevantObligations === null || free === null) {
        conversionIncomplete = true;
        continue;
      }
      totalEligible += eligible;
      totalReserved += reserved;
      totalObligations += relevantObligations;
      totalFree += free;
    }
    genuinelyFreeState = {
      kind: "complete",
      amount: totalFree,
      currency: defaultCurrency,
      conversionIncomplete,
      eligibleCash: totalEligible,
      reservedCash: totalReserved,
      relevantObligations: totalObligations,
    };
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <AppHeader mode="root" pageTitle="Plan" />

      {thisMonth && (
        <section className="space-y-2">
          <SectionLabel>
            {now.toLocaleDateString(undefined, { month: "long" })} · Monthly budgets
          </SectionLabel>
          <div className="flex items-baseline justify-between">
            <Answer className={thisMonth.remaining < 0 ? "text-negative" : undefined}>
              {formatMoney(thisMonth.remaining, defaultCurrency)} remaining
            </Answer>
            <Meta>
              {thisMonth.daysRemaining} day{thisMonth.daysRemaining === 1 ? "" : "s"} left
            </Meta>
          </div>
          <Progress
            value={thisMonth.progressPct}
            indicatorClassName={thisMonth.remaining < 0 ? "bg-negative" : "bg-positive"}
          />
          {thisMonth.conversionIncomplete && (
            <Meta>Some budgets couldn&apos;t be converted to {defaultCurrency} — this total may be incomplete.</Meta>
          )}
        </section>
      )}

      <GenuinelyFreeSection state={genuinelyFreeState} />

      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <SectionLabel>Budgets</SectionLabel>
          <Link href="/categories" className="text-xs text-muted-foreground hover:text-primary">
            Configure categories
          </Link>
        </div>
        {categories.length === 0 ? (
          <EmptyState
            icon={Wallet2}
            title="No budgets configured yet"
            description="Mark a category's budget behavior on the Categories page to start tracking it here."
          />
        ) : (
          <div className="divide-y divide-border">
            {categories.map((category) => {
              if (category.budgetType === "sinking_fund") {
                return <SinkingFundRow key={category.id} category={category} defaultCurrency={defaultCurrency} />;
              }
              if (category.budgetType === "prepaid_coverage") {
                return <PrepaidCoverageRow key={category.id} category={category} userId={userId} now={now} />;
              }
              return (
                <RecurringBudgetRow
                  key={category.id}
                  category={category}
                  userId={userId}
                  now={now}
                  defaultCurrency={defaultCurrency}
                />
              );
            })}
          </div>
        )}
      </section>

      <section id="reserves" className="space-y-1 scroll-mt-6">
        <div className="flex items-center justify-between">
          <SectionLabel>Cash reserves</SectionLabel>
          <SetCashReserveDialog accounts={accountOptions} defaultCurrency={defaultCurrency} />
        </div>
        {cashReserves.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="No cash reserves set"
            description="Set aside an amount that's not actually free to spend or invest, so the rest of the app knows the difference."
          />
        ) : (
          <div className="divide-y divide-border">
            {cashReserves.map((r) => (
              <details key={r.id} className="group py-2.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <span className="font-amount text-sm text-muted-foreground">
                    {formatMoney(r.targetAmount, r.currency)}
                  </span>
                </summary>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <Meta>{r.minimumAmount != null ? `${formatMoney(r.minimumAmount, r.currency)} minimum` : "No minimum set"}</Meta>
                  <DeleteCashReserveButton cashReserveId={r.id} />
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section id="obligations" className="space-y-1 scroll-mt-6">
        <div className="flex items-center justify-between">
          <SectionLabel>Upcoming obligations</SectionLabel>
          <NewObligationDialog accounts={accountOptions} defaultCurrency={defaultCurrency} />
        </div>
        {obligations.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No obligations tracked yet"
            description="Add a future bill or commitment to track whether it's funded and when it's due."
          />
        ) : (
          <div className="divide-y divide-border">
            {obligations.map((o) => {
              const amount = Number(o.amount);
              const fundedAmount = Number(o.fundedAmount);
              const remaining = Math.max(0, amount - fundedAmount);
              const status =
                fundedAmount <= 0 ? "unfunded" : fundedAmount >= amount ? "fully_funded" : "partially_funded";
              return (
                <details key={o.id} className="group py-2.5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{o.name}</span>
                    <span className="text-right text-sm text-muted-foreground">
                      <span className="font-amount">{formatMoney(amount, o.currency)}</span> · due{" "}
                      {o.nextDueDate.toLocaleDateString()}
                    </span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Meta>
                        {FUNDING_STATUS_LABEL[status]} · {formatMoney(fundedAmount, o.currency)} / {formatMoney(amount, o.currency)}
                      </Meta>
                    </div>
                    <Progress
                      value={amount > 0 ? Math.min(100, (fundedAmount / amount) * 100) : 0}
                      indicatorClassName="bg-positive"
                    />
                    <MarkObligationPaidForm obligationId={o.id} remaining={remaining} />
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <SectionLabel>Expected income</SectionLabel>
          <NewIncomeStreamDialog accounts={accountOptions} defaultCurrency={defaultCurrency} />
        </div>
        {incomeStreams.length === 0 ? (
          <EmptyState
            icon={Wallet2}
            title="No income streams tracked yet"
            description="Add an expected paycheck, allowance, or other recurring income to give projections a real schedule to work from."
          />
        ) : (
          <div className="divide-y divide-border">
            {incomeStreams.map((s) => (
              <details key={s.id} className="group py-2.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  <span className="font-amount text-sm text-muted-foreground">
                    {formatMoney(s.grossAmount, s.currency)} / {s.frequency.replace("_", "-")}
                  </span>
                </summary>
                <div className="mt-2 space-y-2">
                  <Meta>
                    Next {s.nextExpectedDate.toLocaleDateString()} · {s.confidence === "confirmed" ? "Confirmed" : "Estimated"}
                    {s.netAmount != null && ` · ${formatMoney(s.netAmount, s.currency)} net`}
                    {s.endDate && ` · ends ${s.endDate.toLocaleDateString()}`}
                  </Meta>
                  <DeactivateIncomeStreamButton incomeStreamId={s.id} />
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <p className="text-center">
        <Link href="/planning" className={cn("text-xs text-muted-foreground hover:text-primary")}>
          Full planning view
        </Link>
      </p>
    </div>
  );
}
