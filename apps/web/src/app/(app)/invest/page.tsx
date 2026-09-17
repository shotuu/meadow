import Link from "next/link";
import { Info, LineChart } from "lucide-react";
import { prisma } from "@finance-app/db";
import { readCurrentHoldings, readPortfolioHistory, readUsdRates } from "@finance-app/finance-data";
import { convertCurrency } from "@finance-app/finance-logic";
import type { InstrumentType } from "@finance-app/finance-logic";
import { requireUserId } from "@/lib/session";
import { AppHeader } from "@/components/app-header";
import { Answer, Meta } from "@/components/typography";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/empty-state";
import { formatMoney } from "@/lib/format";
import { PortfolioSparkline } from "./portfolio-sparkline";
import { StrategySection } from "./strategy-section";
import { HoldingsList } from "./holdings-list";

// Invest is the real portfolio experience as of Phase 5 of the UI/UX
// redesign -- it no longer shares content with Accounts (see
// PROGRESS.md's Phase 5 entry). Accounts stays the lower-frequency
// account-management destination: connected accounts, balances,
// connection/sync/configuration actions.
export default async function InvestPage() {
  const userId = await requireUserId();

  const [appUser, ibkrAccounts] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.financialAccount.findMany({ where: { userId, isArchived: false, syncSource: "ibkr_flex" } }),
  ]);
  const currency = appUser.defaultCurrency;

  if (ibkrAccounts.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <AppHeader mode="root" pageTitle="Invest" />
        <EmptyState
          icon={LineChart}
          title="No investment accounts connected"
          description="Connect IBKR from Accounts to see your portfolio value, holdings, and strategy here."
          action={
            <Link href="/accounts" className="text-sm text-primary hover:underline">
              Go to Accounts
            </Link>
          }
        />
      </div>
    );
  }

  const accountIds = ibkrAccounts.map((a) => a.id);
  const [holdingRows, historyRows, targetAllocationRows, bucketAssignmentRows, instrumentTypeOverrideRows, rates] = await Promise.all([
    readCurrentHoldings(userId, accountIds),
    readPortfolioHistory(userId, currency, accountIds),
    prisma.targetAllocation.findMany({ where: { userId } }),
    prisma.holdingBucketAssignment.findMany({ where: { userId } }),
    prisma.instrumentTypeOverride.findMany({ where: { userId } }),
    readUsdRates(),
  ]);

  // A holding whose currency has no FX rate yet must not take down the
  // whole page -- excluded from the list (with an explicit note) rather
  // than crashing, mirroring readAccountBalances'/readNetWorthHistory's
  // existing missing-FX degrade pattern elsewhere in this app. Derived via
  // a length comparison rather than a flag mutated inside the flatMap
  // callback, since this function body is a Server Component's render.
  const candidateHoldings = holdingRows.filter((h) => Number(h.quantity) !== 0);
  const latestHoldings = candidateHoldings.flatMap((h) => {
    const marketValue = convertCurrency(Number(h.marketValue), h.currency, currency, rates);
    if (marketValue === null) return [];
    const avgCost = h.avgCost !== null ? convertCurrency(Number(h.avgCost), h.currency, currency, rates) : null;
    return [{
      accountId: h.accountId,
      symbol: h.symbol,
      securityType: h.securityType,
      ibkrSubCategory: h.ibkrSubCategory,
      quantity: Number(h.quantity),
      avgCost,
      marketValue,
      currency,
      asOfDate: h.asOfDate,
    }];
  });
  const holdingsConversionIncomplete = latestHoldings.length < candidateHoldings.length;

  const targetAllocations = targetAllocationRows.map((t) => ({
    bucketName: t.bucketName,
    targetWeightPct: Number(t.targetWeightPct),
    driftThresholdPct: Number(t.driftThresholdPct),
  }));
  const bucketAssignments = bucketAssignmentRows.map((b) => ({ symbol: b.symbol, bucketName: b.bucketName }));
  const instrumentTypeOverrides = instrumentTypeOverrideRows.map((o) => ({
    symbol: o.symbol,
    instrumentType: o.instrumentType as InstrumentType,
  }));

  // Total portfolio value is every holding, including brokerage cash --
  // that money still belongs to the portfolio's total worth. Only the
  // *strategy* percentages inside StrategySection exclude it, a
  // deliberately different, narrower denominator (see
  // splitInvestedFromBrokerageCash).
  const portfolioValue = latestHoldings.reduce((sum, h) => sum + h.marketValue, 0);

  // "As of" is the OLDEST of each account's latest report date, not the
  // newest -- if one account synced today and another three days ago, the
  // displayed total is only fully accurate as of the stalest input, so
  // showing today's date would overstate freshness.
  const latestAsOfByAccount = new Map<string, Date>();
  for (const h of latestHoldings) {
    const current = latestAsOfByAccount.get(h.accountId);
    if (!current || h.asOfDate > current) latestAsOfByAccount.set(h.accountId, h.asOfDate);
  }
  const asOfDates = [...latestAsOfByAccount.values()];
  const portfolioAsOf = asOfDates.length > 0 ? new Date(Math.min(...asOfDates.map((d) => d.getTime()))) : null;
  const asOfDatesDiffer = new Set(asOfDates.map((d) => d.toISOString().slice(0, 10))).size > 1;

  // Real persisted history only -- readPortfolioHistory already returns
  // null for a day with a missing exchange rate rather than a silently
  // wrong partial sum; those days are simply omitted from the chart.
  const chartPoints = historyRows.filter((r): r is { asOfDate: Date; value: number } => r.value !== null);

  return (
    <div className="mx-auto max-w-3xl space-y-10 p-6">
      <AppHeader mode="root" pageTitle="Invest" />

      <section className="space-y-3">
        <Meta>Portfolio value</Meta>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Answer>{formatMoney(portfolioValue, currency)}</Answer>
          {portfolioAsOf && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              as of {portfolioAsOf.toLocaleDateString()}
              {asOfDatesDiffer && (
                <Tooltip>
                  <TooltipTrigger aria-label="About this date">
                    <Info className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    Some connected accounts have more recent data than others — this date reflects the oldest of them,
                    so the total is never shown as fresher than it really is.
                  </TooltipContent>
                </Tooltip>
              )}
            </span>
          )}
        </div>
        {holdingsConversionIncomplete && (
          <Meta>
            Some holdings couldn&apos;t be converted to {currency} (exchange rate not yet available) — portfolio value and strategy percentages below may be incomplete.
          </Meta>
        )}
        {chartPoints.length >= 2 ? (
          <PortfolioSparkline points={chartPoints} currency={currency} />
        ) : (
          <Meta>Building up history — check back after a few more nightly syncs.</Meta>
        )}
      </section>

      <StrategySection
        holdings={latestHoldings}
        targets={targetAllocations}
        bucketAssignments={bucketAssignments}
        instrumentTypeOverrides={instrumentTypeOverrides}
        currency={currency}
      />

      <HoldingsList holdings={latestHoldings} bucketAssignments={bucketAssignments} instrumentTypeOverrides={instrumentTypeOverrides} />
    </div>
  );
}
