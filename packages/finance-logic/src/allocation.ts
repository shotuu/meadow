import { isLegacyInstrumentLabelTarget, type InstrumentType } from "./instrument-classification";

export interface BucketHolding {
  bucketName: string;
  marketValue: number;
}

export interface InvestedSplitHolding {
  bucketName: string;
  marketValue: number;
  instrumentType: InstrumentType;
}

export interface InvestedSplitResult {
  /** Holdings with instrumentType !== "cash" -- the base for invested Core/Satellite strategy percentages and portfolio-drift evaluation. */
  invested: BucketHolding[];
  /** Sum of every instrumentType === "cash" holding's marketValue -- objectively identified settlement/residual brokerage cash. */
  brokerageCash: number;
}

/**
 * Splits holdings into the invested base used for strategy-bucket
 * allocation percentages and drift, and a separate brokerage-cash total.
 * Ordinary brokerage cash (instrumentType === "cash", identified
 * objectively via classifyInstrumentType) is excluded from the invested
 * denominator by default and never auto-assigned a strategy bucket -- see
 * resolveStrategyBucketName's doc comment for the separate bucket-
 * assignment axis this is deliberately kept apart from. Renormalization
 * after exclusion is implicit: computeCurrentAllocation's percentages are
 * relative to whatever holdings it's given, so feeding it only `invested`
 * automatically excludes brokerage cash from the denominator, no separate
 * renormalization step needed.
 *
 * Every caller that computes Core/Satellite allocation (Invest UI, Home's
 * "Your plan," the worker's portfolio_drift alert, the AI export) must call
 * this first so cash-exclusion semantics can never drift apart between
 * call sites -- see PROGRESS.md's Phase 5 entry.
 */
export function splitInvestedFromBrokerageCash<T extends InvestedSplitHolding>(holdings: T[]): InvestedSplitResult {
  const invested: BucketHolding[] = [];
  let brokerageCash = 0;
  for (const h of holdings) {
    if (h.instrumentType === "cash") {
      brokerageCash += h.marketValue;
    } else {
      invested.push({ bucketName: h.bucketName, marketValue: h.marketValue });
    }
  }
  return { invested, brokerageCash };
}

export interface AllocationBucket {
  bucketName: string;
  marketValue: number;
  currentWeightPct: number;
}

/** Groups holdings by bucket and computes each bucket's % of total portfolio value. */
export function computeCurrentAllocation(holdings: BucketHolding[]): AllocationBucket[] {
  const totals = new Map<string, number>();
  for (const h of holdings) {
    totals.set(h.bucketName, (totals.get(h.bucketName) ?? 0) + h.marketValue);
  }
  const totalValue = [...totals.values()].reduce((sum, v) => sum + v, 0);
  return [...totals.entries()]
    .map(([bucketName, marketValue]) => ({
      bucketName,
      marketValue,
      currentWeightPct: totalValue > 0 ? (marketValue / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.marketValue - a.marketValue);
}

export interface TargetAllocationConfig {
  bucketName: string;
  targetWeightPct: number;
  driftThresholdPct: number;
}

export interface PortfolioDriftResult {
  bucketName: string;
  currentWeightPct: number;
  targetWeightPct: number;
  driftThresholdPct: number;
  /** current - target, signed (negative = underweight, positive = overweight). */
  driftPct: number;
  isDrifted: boolean;
}

/**
 * Compares current allocation against each configured target. A target
 * bucket with no current holdings at all is still evaluated at 0% current
 * weight -- drifting all the way out of a bucket is exactly the kind of
 * thing this should catch, not silently skip. Only evaluates buckets that
 * have a target row; a bucket the user holds but never set a target for
 * is out of scope by design (nothing to drift from).
 */
export function computePortfolioDrift(
  current: AllocationBucket[],
  targets: TargetAllocationConfig[]
): PortfolioDriftResult[] {
  const currentByBucket = new Map(current.map((c) => [c.bucketName, c.currentWeightPct]));
  return targets.map((t) => {
    const currentWeightPct = currentByBucket.get(t.bucketName) ?? 0;
    const driftPct = currentWeightPct - t.targetWeightPct;
    return {
      bucketName: t.bucketName,
      currentWeightPct,
      targetWeightPct: t.targetWeightPct,
      driftThresholdPct: t.driftThresholdPct,
      driftPct,
      isDrifted: Math.abs(driftPct) > t.driftThresholdPct,
    };
  });
}

/**
 * Resolves the STRATEGY allocation bucket for one holding: the user's own
 * HoldingBucketAssignment for that symbol (e.g. "Core"/"Satellite"/"Cash"),
 * or "Unclassified" when none exists. Deliberately never falls back to an
 * instrument-type label (that was the old, single-axis design) -- strategy
 * is a portfolio-policy decision only the user makes, never inferred from
 * what a security IS. See classifyInstrumentType in instrument-classification.ts
 * for the separate instrument-type axis. `overridesBySymbol` should be built
 * from the user's HoldingBucketAssignment rows (symbol -> bucketName).
 */
export function resolveStrategyBucketName(symbol: string, overridesBySymbol: Map<string, string>): string {
  return overridesBySymbol.get(symbol) ?? "Unclassified";
}

/**
 * The set of strategy-bucket names actually in use right now: at least one
 * currently-held (nonzero-quantity) holding assigned to that bucket,
 * excluding ordinary brokerage cash -- the same "invested" definition
 * splitInvestedFromBrokerageCash uses elsewhere. Needs only bucketName +
 * instrumentType, not market value or currency, since bucket *presence* is
 * all isLegacyInstrumentLabelTarget needs -- unlike computeCurrentAllocation
 * (which needs value to compute *weight*), this never requires an FX
 * conversion, so it can run in a context (e.g. saveTargetAllocations, before
 * any rates are loaded) that has no reason to touch currency conversion at
 * all.
 */
export function activeStrategyBucketNames(holdings: { bucketName: string; instrumentType: InstrumentType }[]): Set<string> {
  return new Set(holdings.filter((h) => h.instrumentType !== "cash").map((h) => h.bucketName));
}

export interface StrategyTargetPartition<T extends { bucketName: string }> {
  /** Real, current strategy-bucket targets -- the only ones any drift/allocation calculation should ever use. */
  active: T[];
  /** Targets whose bucketName looks like a leftover instrument-type label (see isLegacyInstrumentLabelTarget) -- never silently dropped, always reported to the caller so it can be surfaced rather than hidden. */
  legacy: T[];
}

/**
 * Splits a user's TargetAllocation rows into active vs. legacy exactly
 * once, so "which targets count for drift/allocation" can never drift
 * apart between the callers that need to agree on it: the Invest UI, the
 * worker's portfolio_drift alert, the AI export, and saveTargetAllocations'
 * own persistence-layer cleanup. Never special-cases a specific bucket name
 * (e.g. "Stocks") -- purely a function of isLegacyInstrumentLabelTarget.
 */
export function partitionStrategyTargets<T extends { bucketName: string }>(
  targets: T[],
  currentBucketNames: ReadonlySet<string>
): StrategyTargetPartition<T> {
  const active: T[] = [];
  const legacy: T[] = [];
  for (const t of targets) {
    if (isLegacyInstrumentLabelTarget(t.bucketName, currentBucketNames)) legacy.push(t);
    else active.push(t);
  }
  return { active, legacy };
}

/** Selects the latest complete report for each account, excluding exited symbols. */
export function latestHoldingsBySymbol<T extends { accountId: string; symbol: string; asOfDate: Date }>(
  holdings: T[]
): T[] {
  const dates = new Map<string, number>();
  for (const h of holdings) dates.set(h.accountId, Math.max(dates.get(h.accountId) ?? 0, h.asOfDate.getTime()));
  return holdings.filter((h) => h.asOfDate.getTime() === dates.get(h.accountId));
}
