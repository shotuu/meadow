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
  return new Date(Date.UTC(year, month - 1, day));
}

/** Some fields are "YYYYMMDD;HHMMSS" — this takes just the date half. */
export function parseIbkrDateTime(value: string): Date {
  return parseIbkrDate(value.split(";")[0]);
}
