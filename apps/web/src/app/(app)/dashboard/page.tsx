import Link from "next/link";
import { Info, Landmark, ChevronRight } from "lucide-react";
import { prisma } from "@finance-app/db";
import {
  readAccountBalances,
  readNetWorthHistory,
  readUsdRates,
  readCurrentHoldings,
  computeMonthlyBudgetOverview,
} from "@finance-app/finance-data";
import {
  convertCurrency,
  CASH_ACCOUNT_TYPES,
  classifyInstrumentType,
  computeCurrentAllocation,
  computePortfolioDrift,
  isLegacyInstrumentLabelTarget,
  resolveStrategyBucketName,
  splitInvestedFromBrokerageCash,
  type InstrumentType,
  type PortfolioDriftResult,
} from "@finance-app/finance-logic";
import { LOW_CONFIDENCE_THRESHOLD } from "@finance-app/categorization-ai/constants";
import { requireUserId } from "@/lib/session";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { summarizeByClassification } from "@/lib/balances";
import { EmptyState } from "@/components/empty-state";
import { AppHeader } from "@/components/app-header";
import { Answer, SectionLabel, Meta } from "@/components/typography";
import { NetWorthChart } from "./net-worth-chart";

// Extracted so /home (the real primary destination as of the nav-shell
// phase) and this legacy /dashboard route can share one implementation
// while rendering AppHeader in different modes -- see DESIGN.md's "Header
// system" section for why root vs. sub can't just be a CSS/prop tweak on
// a single shared page.
export async function DashboardBody({ headerMode = "sub" }: { headerMode?: "root" | "sub" }) {
  const userId = await requireUserId();
  const now = new Date();

  const [appUser, accounts] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.financialAccount.findMany({
      where: { userId, isArchived: false },
      include: { ibkrFlexConfig: { select: { lastRunAt: true } } },
    }),
  ]);
  const defaultCurrency = appUser.defaultCurrency;

  const [balanceByAccountResult, usdRates] = await Promise.all([
    readAccountBalances(userId, accounts),
    readUsdRates(now),
  ]);
  const balanceByAccount = new Map([...balanceByAccountResult].map(([id, result]) => [id, result.balance]));

  const byCurrency = summarizeByClassification(
    accounts.map((a) => ({ classification: a.classification, currency: a.currency, balance: balanceByAccount.get(a.id) ?? 0 }))
  );
  const isSingleDefaultCurrency = byCurrency.size <= 1 && byCurrency.has(defaultCurrency);

  let netWorthToday = 0;
  let netWorthConversionIncomplete = false;
  for (const [currency, { assets, liabilities }] of byCurrency) {
    const converted = convertCurrency(assets + liabilities, currency, defaultCurrency, usdRates);
    if (converted === null) {
      netWorthConversionIncomplete = true;
      continue;
    }
    netWorthToday += converted;
  }

  // Cash accounts vs. brokerage -- only checking/savings/cash accounts
  // count as "cash accounts" (the same classification the cash-policy
  // calculations already use), and only brokerage-type accounts count as
  // "brokerage." Deliberately labeled by account type, not "invested" --
  // a brokerage account's own total can include uninvested cash sitting in
  // it (IBKR's Cash Report Flex import feeds that cash into the same
  // balance, see ibkr-sync's cashSymbolFor), so "Invested" would overstate
  // how much of this figure is actually in securities; only Invest's
  // Strategy section, which excludes brokerage cash via
  // splitInvestedFromBrokerageCash, gets to claim that narrower number.
  // Accounts that are neither (e.g. loans, credit cards, "other")
  // intentionally sit outside both figures -- this is a composition split
  // of assets, not a reconciliation that must sum to net worth.
  let cashAccountsTotal = 0;
  let brokerageTotal = 0;
  let splitConversionIncomplete = false;
  for (const account of accounts) {
    if (account.classification !== "asset") continue;
    const balance = balanceByAccount.get(account.id) ?? 0;
    const converted = convertCurrency(balance, account.currency, defaultCurrency, usdRates);
    if (converted === null) {
      splitConversionIncomplete = true;
      continue;
    }
    if ((CASH_ACCOUNT_TYPES as readonly string[]).includes(account.type)) cashAccountsTotal += converted;
    else if (account.type === "brokerage") brokerageTotal += converted;
  }

  // Net worth history: real AccountBalanceSnapshot rows only -- never
  // fabricated. Today's own point always uses the live figure above
  // (computed fresh from current balances), not last night's snapshot, so
  // the hero number and the chart's last point can never disagree.
  const netWorthHistoryRows = await readNetWorthHistory(userId, accounts, defaultCurrency);
  const validHistory = netWorthHistoryRows.filter((r) => r.netWorth !== null);
  const historyHasGap = netWorthHistoryRows.some((r) => r.hasGap);
  const chartPoints =
    validHistory.length > 0
      ? [
          ...validHistory
            .filter((r) => r.asOfDate.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10))
            .map((r) => ({ asOfDate: r.asOfDate, value: r.netWorth! })),
          { asOfDate: now, value: netWorthToday },
        ]
      : [];

  const ibkrAccounts = accounts.filter((a) => a.syncSource === "ibkr_flex");

  // Data freshness for the net worth headline -- the oldest last-synced
  // date among connected accounts (mirrors Invest's own "oldest of
  // connected accounts" convention for its portfolio-value headline, see
  // invest/page.tsx's portfolioAsOf). Manual/CSV accounts have no sync
  // concept and are excluded -- they're only ever as current as the
  // user's last entry, never "stale" in this sense, so folding them into
  // the same date would be a fabricated staleness signal, not a real one.
  const syncedAsOfDates = accounts.flatMap((a) => {
    if (a.syncSource === "ibkr_flex") return a.ibkrFlexConfig?.lastRunAt ? [a.ibkrFlexConfig.lastRunAt] : [];
    if (a.syncSource === "plaid" || a.syncSource === "finverse") return a.balanceAsOf ? [a.balanceAsOf] : [];
    return [];
  });
  const syncedBalancesAsOf =
    syncedAsOfDates.length > 0 ? new Date(Math.min(...syncedAsOfDates.map((d) => d.getTime()))) : null;
  const syncedAsOfDiffer = new Set(syncedAsOfDates.map((d) => d.toISOString().slice(0, 10))).size > 1;

  const infoNotes: string[] = [];
  if (ibkrAccounts.length > 0) {
    // Corrected 2026-09-17 (Phase 8B): this used to claim brokerage cash is
    // always excluded from net worth, which stopped being true once the
    // IBKR Cash Report Flex import started feeding brokerage cash in as a
    // synthetic CASH:<currency> InvestmentHolding row (see
    // ibkr-sync/src/sync.ts's cashSymbolFor) -- that row is summed into the
    // account's balance by readAccountBalances exactly like any other
    // holding, so it's already part of net worth whenever the user's Flex
    // Query includes a Cash Report section. Whether it does isn't tracked
    // as its own field anywhere, so this states the real mechanism rather
    // than asserting a per-account fact this data can't actually confirm.
    infoNotes.push("Brokerage balances include reported positions and any imported cash balance (IBKR's Cash Report), when your Flex Query provides one.");
  }
  if (netWorthConversionIncomplete || splitConversionIncomplete) {
    infoNotes.push("Some balances couldn't be converted (exchange rates not yet available for that currency) — totals may be incomplete.");
  }
  if (historyHasGap) {
    infoNotes.push("Some days in the history below are missing an exchange rate and are omitted rather than shown as an incorrect total.");
  }

  // This month: only categories on a genuine calendar-month budget period
  // are aggregated -- a weekly or quarterly budget's "remaining" isn't the
  // same time horizon as "this month," so mixing them in would misrepresent
  // both. Sinking funds and prepaid coverage aren't per-month spending caps
  // at all, so they're excluded the same way the Budgets page already
  // separates them. Shared with Plan's overview strip via
  // computeMonthlyBudgetOverview so the two screens can never disagree.
  const thisMonth = await computeMonthlyBudgetOverview(userId, now, defaultCurrency);

  // Your plan: only when a real TargetAllocation exists. Every number below
  // is computeCurrentAllocation/computePortfolioDrift's own output, never
  // hand-derived. Brokerage cash is excluded from the denominator via
  // splitInvestedFromBrokerageCash -- the exact same shared function
  // Invest, the worker's portfolio_drift alert, and the AI export use, so
  // Home can never show a different Core/Satellite % than Invest for the
  // same data. Stale-target detection uses the same shared heuristic too
  // (isLegacyInstrumentLabelTarget) -- see PROGRESS.md's Phase 5 entry.
  let yourPlan: { kind: "drift"; rows: PortfolioDriftResult[] } | { kind: "stale" } | null = null;
  if (ibkrAccounts.length > 0) {
    const [holdings, targetAllocationRows, bucketAssignmentRows, instrumentTypeOverrideRows] = await Promise.all([
      readCurrentHoldings(userId, ibkrAccounts.map((a) => a.id)),
      prisma.targetAllocation.findMany({ where: { userId } }),
      prisma.holdingBucketAssignment.findMany({ where: { userId } }),
      prisma.instrumentTypeOverride.findMany({ where: { userId } }),
    ]);
    if (targetAllocationRows.length > 0) {
      const overridesBySymbol = new Map(bucketAssignmentRows.map((b) => [b.symbol, b.bucketName]));
      const instrumentOverridesBySymbol = new Map(instrumentTypeOverrideRows.map((o) => [o.symbol, o.instrumentType as InstrumentType]));
      const latestHoldings = holdings.filter((h) => Number(h.quantity) !== 0);
      const classified = latestHoldings.flatMap((h) => {
        const converted = convertCurrency(Number(h.marketValue), h.currency, defaultCurrency, usdRates);
        if (converted === null) return [];
        return [{
          bucketName: resolveStrategyBucketName(h.symbol, overridesBySymbol),
          marketValue: converted,
          instrumentType: classifyInstrumentType({
            ibkrAssetCategory: h.securityType,
            ibkrSubCategory: h.ibkrSubCategory,
            manualOverride: instrumentOverridesBySymbol.get(h.symbol) ?? null,
          }).instrumentType,
        }];
      });
      const { invested } = splitInvestedFromBrokerageCash(classified);
      const current = computeCurrentAllocation(invested);
      const targets = targetAllocationRows.map((t) => ({
        bucketName: t.bucketName,
        targetWeightPct: Number(t.targetWeightPct),
        driftThresholdPct: Number(t.driftThresholdPct),
      }));

      const currentBucketNames = new Set(current.map((a) => a.bucketName));
      const staleTargets = targets.filter((t) => isLegacyInstrumentLabelTarget(t.bucketName, currentBucketNames));
      const legitTargets = targets.filter((t) => !staleTargets.some((s) => s.bucketName === t.bucketName));

      if (legitTargets.length > 0) {
        yourPlan = { kind: "drift", rows: computePortfolioDrift(current, legitTargets) };
      } else if (staleTargets.length > 0) {
        yourPlan = { kind: "stale" };
      }
    }
  }

  // Needs attention: only genuinely actionable, already-supported states.
  // Suggested transfers and suggested reversals both surface on Activity's
  // same "Transfers" tab (see transactions/page.tsx's combined
  // transferMatchRows.length + reversalMatchRows.length badge), so they're
  // combined into one Home entry pointing at that same tab.
  const [needsReviewCount, pendingTransfersCount, pendingReversalsCount, openAlertsCount] = await Promise.all([
    prisma.transaction.count({
      where: {
        userId,
        isTransfer: false,
        OR: [{ categorySource: "uncategorized" }, { categorySource: "ai", categoryConfidence: { lt: LOW_CONFIDENCE_THRESHOLD } }],
      },
    }),
    prisma.transferMatchCandidate.count({ where: { userId, status: "pending" } }),
    prisma.reversalMatchCandidate.count({ where: { userId, status: "pending" } }),
    prisma.alertEvent.count({ where: { userId, resolvedAt: null } }),
  ]);
  const attentionItems: { href: string; label: string }[] = [];
  if (needsReviewCount > 0) {
    attentionItems.push({
      href: "/activity?tab=review",
      label: `${needsReviewCount} transaction${needsReviewCount === 1 ? "" : "s"} need${needsReviewCount === 1 ? "s" : ""} review`,
    });
  }
  const pendingReviewItemsCount = pendingTransfersCount + pendingReversalsCount;
  if (pendingReviewItemsCount > 0) {
    const label =
      pendingTransfersCount > 0 && pendingReversalsCount > 0
        ? `${pendingReviewItemsCount} suggested transfers/reversals`
        : pendingReversalsCount > 0
          ? `${pendingReversalsCount} suggested reversal${pendingReversalsCount === 1 ? "" : "s"}`
          : `${pendingTransfersCount} suggested transfer${pendingTransfersCount === 1 ? "" : "s"}`;
    attentionItems.push({ href: "/activity?tab=transfers", label });
  }
  if (openAlertsCount > 0) {
    attentionItems.push({ href: "/alerts", label: `${openAlertsCount} open alert${openAlertsCount === 1 ? "" : "s"}` });
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-10">
      {headerMode === "root" ? <AppHeader mode="root" pageTitle="Home" /> : <AppHeader title="Dashboard" />}

      {byCurrency.size === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No net worth to show yet"
          description="Add an account and a few transactions to see your net worth here."
        />
      ) : (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Answer>{formatMoney(netWorthToday, defaultCurrency)}</Answer>
            {infoNotes.length > 0 && (
              <Tooltip>
                <TooltipTrigger aria-label="About this figure">
                  <Info className="size-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  {infoNotes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {!isSingleDefaultCurrency && <Meta>{defaultCurrency}, converted from {byCurrency.size} currencies</Meta>}
          {syncedBalancesAsOf && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Synced balances as of {syncedBalancesAsOf.toLocaleDateString()}
              {syncedAsOfDiffer && (
                <Tooltip>
                  <TooltipTrigger aria-label="About this date">
                    <Info className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    Some connected accounts have more recent data than others — this date reflects the oldest of them,
                    so the total is never shown as fresher than it really is. Manual accounts are always as current as
                    your last entry and aren&apos;t part of this date.
                  </TooltipContent>
                </Tooltip>
              )}
            </span>
          )}
          {chartPoints.length >= 2 && <NetWorthChart points={chartPoints} currency={defaultCurrency} />}

          <div className="grid grid-cols-2 gap-6 border-t border-border pt-4">
            <div>
              <SectionLabel>Cash accounts</SectionLabel>
              <p className="font-amount text-xl font-semibold sm:text-2xl">{formatMoney(cashAccountsTotal, defaultCurrency)}</p>
            </div>
            <div>
              <SectionLabel>Brokerage</SectionLabel>
              <p className="font-amount text-xl font-semibold sm:text-2xl">{formatMoney(brokerageTotal, defaultCurrency)}</p>
            </div>
          </div>
        </section>
      )}

      {thisMonth && (
        <section className="space-y-2">
          <SectionLabel>Monthly budgets</SectionLabel>
          <div className="flex items-baseline justify-between">
            <p
              className={cn(
                "font-amount text-lg font-semibold",
                thisMonth.remaining < 0 ? "text-negative" : "text-positive"
              )}
            >
              {formatMoney(thisMonth.remaining, defaultCurrency)} remaining
            </p>
            <Meta>{thisMonth.daysRemaining} day{thisMonth.daysRemaining === 1 ? "" : "s"} left</Meta>
          </div>
          <Progress value={thisMonth.progressPct} indicatorClassName={thisMonth.remaining < 0 ? "bg-negative" : "bg-positive"} />
          {thisMonth.conversionIncomplete && (
            <Meta>Some budgets couldn&apos;t be converted to {defaultCurrency} — this total may be incomplete.</Meta>
          )}
        </section>
      )}

      {yourPlan && (
        <section className="space-y-2">
          <SectionLabel>Your plan</SectionLabel>
          {yourPlan.kind === "stale" ? (
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="text-sm">Your strategy target needs updating</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your target allocation looks like a leftover instrument-type label rather than a real strategy bucket, so drift against it wouldn&apos;t be meaningful.
              </p>
              <Link href="/invest" className="mt-2 inline-block text-xs text-primary hover:underline">
                Review on Invest
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              {yourPlan.rows.map((row) => (
                <div key={row.bucketName} className="flex items-center justify-between text-sm">
                  <span>
                    {row.bucketName} {row.currentWeightPct.toFixed(0)}% <span className="text-muted-foreground">→ target {row.targetWeightPct.toFixed(0)}%</span>
                  </span>
                  <span className={cn("font-amount", row.isDrifted ? "text-negative" : "text-muted-foreground")}>
                    {row.driftPct >= 0 ? "+" : ""}
                    {row.driftPct.toFixed(1)}pp
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <SectionLabel>Needs attention</SectionLabel>
        {attentionItems.length === 0 ? (
          <Meta>You&apos;re all caught up.</Meta>
        ) : (
          <div className="divide-y divide-border">
            {attentionItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between py-2.5 text-sm text-foreground transition-colors hover:text-primary"
              >
                <span>{item.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardBody headerMode="sub" />;
}
