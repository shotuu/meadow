import { Info } from "lucide-react";
import {
  classifyInstrumentType,
  computeCurrentAllocation,
  computePortfolioDrift,
  partitionStrategyTargets,
  resolveStrategyBucketName,
  splitInvestedFromBrokerageCash,
  type InstrumentType,
} from "@finance-app/finance-logic";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SectionLabel } from "@/components/typography";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { SetStrategyTargetsDialog } from "./set-strategy-targets-dialog";

type Holding = { symbol: string; marketValue: number; securityType: string; ibkrSubCategory: string | null };

/**
 * Strategy allocation only -- bucket names here always come from the
 * user's own HoldingBucketAssignment ("Core"/"Satellite"/etc.) or
 * "Unclassified," never an instrument-type label. Ordinary brokerage cash
 * (instrumentType === "cash") is objectively excluded from the invested
 * denominator via splitInvestedFromBrokerageCash before any percentage is
 * computed -- the same shared function the worker's portfolio_drift alert
 * and the AI export use, so this can never disagree with them. See
 * instrument-classification.ts for the separate "what IS this security"
 * axis, shown on the holdings list instead.
 */
export function StrategySection({
  holdings,
  targets,
  bucketAssignments,
  instrumentTypeOverrides,
  currency,
}: {
  holdings: Holding[];
  targets: { bucketName: string; targetWeightPct: number; driftThresholdPct: number }[];
  bucketAssignments: { symbol: string; bucketName: string }[];
  instrumentTypeOverrides: { symbol: string; instrumentType: InstrumentType }[];
  currency: string;
}) {
  const overridesBySymbol = new Map(bucketAssignments.map((a) => [a.symbol, a.bucketName]));
  const instrumentOverridesBySymbol = new Map(instrumentTypeOverrides.map((o) => [o.symbol, o.instrumentType]));

  const classified = holdings.map((h) => ({
    bucketName: resolveStrategyBucketName(h.symbol, overridesBySymbol),
    marketValue: h.marketValue,
    instrumentType: classifyInstrumentType({
      ibkrAssetCategory: h.securityType,
      ibkrSubCategory: h.ibkrSubCategory,
      manualOverride: instrumentOverridesBySymbol.get(h.symbol) ?? null,
    }).instrumentType,
  }));
  const { invested, brokerageCash } = splitInvestedFromBrokerageCash(classified);
  const current = computeCurrentAllocation(invested);

  const currentStrategyBucketNames = new Set(current.map((c) => c.bucketName));
  const { active: legitTargets, legacy: staleTargets } = partitionStrategyTargets(targets, currentStrategyBucketNames);
  const drift = computePortfolioDrift(current, legitTargets);
  const driftByBucket = new Map(drift.map((d) => [d.bucketName, d]));

  // Real strategy buckets currently in use (excluding "Unclassified," which
  // is a fallback label, never a user-chosen bucket) -- used only to seed
  // the guided target dialog with real data, never to hardcode a
  // Core/Satellite split.
  const realBucketNames = [...new Set(bucketAssignments.map((a) => a.bucketName))];

  // Union of currently-held buckets and legit targeted buckets -- a bucket
  // drifted all the way to zero should still show up, not vanish.
  const bucketNames = [...new Set([...current.map((c) => c.bucketName), ...legitTargets.map((t) => t.bucketName)])];

  const triggerLabel = staleTargets.length > 0 ? "Update strategy target" : legitTargets.length > 0 ? "Edit targets" : "Set target";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Strategy</SectionLabel>
        <SetStrategyTargetsDialog
          currentTargets={legitTargets.map((t) => ({ bucketName: t.bucketName, targetWeightPct: t.targetWeightPct, driftThresholdPct: t.driftThresholdPct }))}
          staleTargets={staleTargets.map((t) => ({ bucketName: t.bucketName, targetWeightPct: t.targetWeightPct }))}
          currentStrategyBucketNames={realBucketNames}
          triggerLabel={triggerLabel}
          triggerVariant={staleTargets.length > 0 ? "default" : "outline"}
        />
      </div>

      {staleTargets.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Your target ({staleTargets.map((s) => `${s.bucketName} ${s.targetWeightPct.toFixed(0)}%`).join(", ")}) needs
          updating — it measures security type, not investment strategy.
        </p>
      )}

      {bucketNames.length > 0 ? (
        <div className="space-y-3">
          {bucketNames.map((bucketName) => {
            const currentBucket = current.find((c) => c.bucketName === bucketName);
            const target = legitTargets.find((t) => t.bucketName === bucketName);
            const currentWeightPct = currentBucket?.currentWeightPct ?? 0;
            const driftResult = driftByBucket.get(bucketName);
            return (
              <div key={bucketName} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{bucketName}</span>
                  <span>
                    {currentWeightPct.toFixed(0)}%
                    {target && <span className="text-muted-foreground"> → target {target.targetWeightPct.toFixed(0)}%</span>}
                    {driftResult && (
                      <span className={cn("font-amount ml-1.5", driftResult.isDrifted && "font-medium text-negative")}>
                        {driftResult.driftPct >= 0 ? "+" : ""}
                        {driftResult.driftPct.toFixed(1)}pp
                      </span>
                    )}
                  </span>
                </div>
                <Progress value={currentWeightPct} indicatorClassName={driftResult?.isDrifted ? "bg-negative" : "bg-primary"} />
              </div>
            );
          })}
        </div>
      ) : (
        staleTargets.length === 0 && <p className="text-sm text-muted-foreground">No strategy target set yet.</p>
      )}

      {brokerageCash > 0 && (
        <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            Brokerage cash
            <Tooltip>
              <TooltipTrigger aria-label="About brokerage cash">
                <Info className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                Settlement/residual cash in your brokerage account, identified by instrument type. Excluded from the
                strategy percentages above — assign a deliberate Cash strategy bucket to a holding if you want cash
                counted toward your plan.
              </TooltipContent>
            </Tooltip>
          </span>
          <span className="font-amount">{formatMoney(brokerageCash, currency)}</span>
        </div>
      )}
    </section>
  );
}
