/**
 * fast-xml-parser returns a single object (not a 1-element array) when a
 * repeating element only occurs once in the XML — e.g. a Flex Query with
 * exactly one trade returns `Trades.Trade` as an object, not `[object]`.
 * Every collection access in this package goes through this to avoid that
 * footgun.
 */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** IBKR dates are plain "YYYYMMDD" strings (no separators). */
export function parseIbkrDate(yyyymmdd: string): Date {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!/^\d{8}$/.test(yyyymmdd) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Invalid IBKR date");
  }
  return date;
}

/** Some fields are "YYYYMMDD;HHMMSS" — this takes just the date half. */
export function parseIbkrDateTime(value: string): Date {
  return parseIbkrDate(value.split(";")[0]);
}

export interface IbkrCashRow {
  currency: string;
  endingCash: number;
}

/**
 * Extracts and validates each currency's ending cash balance from the Cash
 * Report section. That section is absent entirely (not an empty object)
 * when a Flex Query hasn't enabled it, so this degrades to [] rather than
 * throwing -- brokerage cash import is an enhancement, not a requirement
 * for the rest of the sync to work.
 */
export function parseCashReportRows(cashReport: { CashReportCurrency?: unknown } | undefined): IbkrCashRow[] {
  return asArray(cashReport?.CashReportCurrency).map((row) => {
    const r = row as Record<string, unknown>;
    const currency = r["@_currency"];
    const endingCash = Number(r["@_endingCash"]);
    if (typeof currency !== "string" || !currency || !Number.isFinite(endingCash)) {
      throw new Error("Invalid IBKR cash report row");
    }
    return { currency, endingCash };
  });
}
