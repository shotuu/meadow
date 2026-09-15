import { instrumentTypeLabel, type InstrumentType } from "@finance-app/finance-logic";

const ALL_INSTRUMENT_TYPES: InstrumentType[] = ["stock", "etf", "fund", "bond", "cash", "crypto", "option", "other", "unknown"];

/** Options for a manual instrument-type override picker, in a sensible display order. */
export const INSTRUMENT_TYPE_OPTIONS: { value: InstrumentType; label: string }[] = ALL_INSTRUMENT_TYPES.map((value) => ({
  value,
  label: instrumentTypeLabel(value),
}));
