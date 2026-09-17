export type InstrumentType = "stock" | "etf" | "fund" | "bond" | "cash" | "crypto" | "option" | "other" | "unknown";

/**
 * "ibkr_metadata" covers both a direct field read (assetCategory "CASH" ->
 * cash) and a deterministic mapping over IBKR's own fields (assetCategory
 * "STK" + subCategory "ETF" -> etf) -- both are equally authoritative and
 * auditable, so they aren't split into separate source tiers. There's no
 * probabilistic/AI tier: IBKR's own fields resolve every case this app
 * needs (see classifyInstrumentType's doc comment).
 */
export type InstrumentTypeSource = "manual_override" | "ibkr_metadata" | "unresolved";

export interface InstrumentClassification {
  instrumentType: InstrumentType;
  source: InstrumentTypeSource;
  /** null only for "unresolved" -- never a fabricated number when nothing is actually known. */
  confidence: number | null;
}

const INSTRUMENT_TYPE_LABELS: Record<InstrumentType, string> = {
  stock: "Stocks",
  etf: "ETFs",
  fund: "Funds",
  bond: "Bonds",
  cash: "Cash",
  crypto: "Crypto",
  option: "Options",
  other: "Other",
  unknown: "Unknown",
};

/** Human display label for a normalized instrument type, for chart/badge use. */
export function instrumentTypeLabel(instrumentType: InstrumentType): string {
  return INSTRUMENT_TYPE_LABELS[instrumentType];
}

const ALL_INSTRUMENT_TYPES: InstrumentType[] = [
  "stock",
  "etf",
  "fund",
  "bond",
  "cash",
  "crypto",
  "option",
  "other",
  "unknown",
];
const INSTRUMENT_TYPE_LABEL_SET: ReadonlySet<string> = new Set(ALL_INSTRUMENT_TYPES.map((t) => INSTRUMENT_TYPE_LABELS[t]));

/**
 * True when a TargetAllocation.bucketName is almost certainly a leftover
 * from before instrument type and strategy bucket were split into separate
 * concepts (e.g. a target literally named "Stocks" at 100%) rather than a
 * real user-chosen strategy bucket: it collides with an instrument-type
 * display label and no strategy bucket of that same name is currently in
 * use. Shared by Home's stale-target banner, the AI export's
 * calculationWarnings, and Invest's guided migration flow so all three
 * surfaces apply the exact same heuristic and can never disagree about
 * which target is stale.
 */
export function isLegacyInstrumentLabelTarget(bucketName: string, currentStrategyBucketNames: ReadonlySet<string>): boolean {
  return INSTRUMENT_TYPE_LABEL_SET.has(bucketName) && !currentStrategyBucketNames.has(bucketName);
}

const STK_SUBCATEGORY_MAP: Record<string, InstrumentType> = {
  ETF: "etf",
  "CLOSED-END FUND": "fund",
  CEF: "fund",
  COMMON: "stock",
  PREFERRED: "stock",
  ADR: "stock",
  REIT: "stock",
};

/**
 * Deterministic classification from IBKR's own Flex OpenPosition fields:
 * assetCategory (e.g. "STK") alone can't tell an ETF from a stock -- both
 * report as STK -- but subCategory (e.g. "ETF" vs "COMMON") does. Only STK
 * needs subCategory to disambiguate; every other assetCategory IBKR uses is
 * already unambiguous on its own. Returns "unresolved" (never a guess)
 * rather than assuming STK-with-no-subCategory is a plain stock -- that
 * case should only occur for a position synced before subCategory capture
 * existed, and clears up on the next real sync.
 */
function classifyFromIbkrMetadata(
  ibkrAssetCategory: string | null,
  ibkrSubCategory: string | null
): { instrumentType: InstrumentType; confidence: number } | null {
  const category = ibkrAssetCategory?.trim().toUpperCase() ?? "";
  const subCategory = ibkrSubCategory?.trim().toUpperCase() ?? "";

  switch (category) {
    case "CASH":
      return { instrumentType: "cash", confidence: 1 };
    case "BOND":
      return { instrumentType: "bond", confidence: 1 };
    case "CRYPTO":
      return { instrumentType: "crypto", confidence: 1 };
    case "OPT":
    case "FOP":
    case "FUT":
    case "WAR":
      return { instrumentType: "option", confidence: 0.95 };
    case "FUND":
      return { instrumentType: "fund", confidence: 1 };
    case "STK": {
      const mapped = STK_SUBCATEGORY_MAP[subCategory];
      if (mapped) return { instrumentType: mapped, confidence: 1 };
      return null; // STK with no recognized subCategory -- can't disambiguate, don't guess
    }
    default:
      if (category) return { instrumentType: "other", confidence: 0.6 }; // a known but unmapped IBKR category, e.g. CMDTY/CFD
      return null;
  }
}

/**
 * Layered instrument-type classification, in priority order: manual
 * override always wins; then IBKR's own authoritative metadata
 * (deterministic, no guessing); anything left over is "unresolved" rather
 * than assumed. Deliberately no probabilistic/AI fallback layer -- IBKR's
 * assetCategory + subCategory resolve every case Meadow actually needs to
 * distinguish (see the classification-hierarchy tests).
 */
export function classifyInstrumentType(input: {
  ibkrAssetCategory: string | null;
  ibkrSubCategory: string | null;
  manualOverride?: InstrumentType | null;
}): InstrumentClassification {
  if (input.manualOverride) {
    return { instrumentType: input.manualOverride, source: "manual_override", confidence: 1 };
  }

  const fromMetadata = classifyFromIbkrMetadata(input.ibkrAssetCategory, input.ibkrSubCategory);
  if (fromMetadata) {
    return { instrumentType: fromMetadata.instrumentType, source: "ibkr_metadata", confidence: fromMetadata.confidence };
  }

  return { instrumentType: "unknown", source: "unresolved", confidence: null };
}
