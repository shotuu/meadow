const SECURITY_TYPE_LABELS: Record<string, string> = {
  STK: "Stocks",
  BOND: "Bonds",
  CASH: "Cash",
  OPT: "Options",
  FOP: "Futures Options",
  FUND: "Funds",
  FUT: "Futures",
  CFD: "CFDs",
  CMDTY: "Commodities",
  WAR: "Warrants",
  CRYPTO: "Crypto",
};

/**
 * Maps IBKR's raw Flex Query asset-category codes (STK/BOND/CASH/...) to a
 * human label. Degrades to a title-cased version of the raw code for
 * anything not in the table, rather than throwing on a category IBKR added
 * that we don't know about yet.
 */
export function bucketLabelForSecurityType(securityType: string): string {
  const known = SECURITY_TYPE_LABELS[securityType.toUpperCase()];
  if (known) return known;
  return securityType.charAt(0).toUpperCase() + securityType.slice(1).toLowerCase();
}

export interface BucketHolding {
  bucketName: string;
  marketValue: number;
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
 * Resolves the allocation bucket for one holding: prefers the user's own
 * HoldingBucketAssignment for that symbol (e.g. "core"/"satellite"/"gold")
 * when one exists, otherwise falls back to the security-type-derived label.
 * `overridesBySymbol` should be built from the user's HoldingBucketAssignment
 * rows (symbol -> bucketName).
 */
export function resolveBucketName(
  symbol: string,
  securityType: string,
  overridesBySymbol: Map<string, string>
): string {
  return overridesBySymbol.get(symbol) ?? bucketLabelForSecurityType(securityType);
}

/** Selects the latest complete report for each account, excluding exited symbols. */
export function latestHoldingsBySymbol<T extends { accountId: string; symbol: string; asOfDate: Date }>(
  holdings: T[]
): T[] {
  const dates = new Map<string, number>();
  for (const h of holdings) dates.set(h.accountId, Math.max(dates.get(h.accountId) ?? 0, h.asOfDate.getTime()));
  return holdings.filter((h) => h.asOfDate.getTime() === dates.get(h.accountId));
}
