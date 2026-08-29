/** USD -> currency rates, e.g. { EUR: 0.86, JPY: 159.4 } (1 USD = 0.86 EUR). USD itself is implicit (1). */
export type UsdRateMap = Record<string, number>;

/**
 * Converts an amount between currencies by triangulating through USD as a
 * pivot (amount / rate[from] * rate[to]) rather than requiring every
 * currency pair to be stored directly — one fetch of USD-based rates covers
 * every pair. Returns null if a needed currency isn't in the rate map
 * (e.g. rates haven't been refreshed yet, or it's an unsupported currency),
 * so the caller can degrade gracefully instead of silently showing a wrong
 * number.
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  usdRates: UsdRateMap
): number | null {
  if (from === to) return amount;

  const fromRate = from === "USD" ? 1 : usdRates[from];
  const toRate = to === "USD" ? 1 : usdRates[to];
  if (fromRate == null || toRate == null) return null;

  const amountInUsd = amount / fromRate;
  return amountInUsd * toRate;
}
