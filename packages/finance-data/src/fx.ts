import { prisma, Prisma } from "@finance-app/db";
import { convertCurrency, type UsdRateMap } from "@finance-app/finance-logic";

/**
 * Latest known rates on or before the valuation day; never use future
 * rates. Accepts an optional transaction client so a caller assembling
 * several reads (e.g. an export) can run them all against one consistent
 * database snapshot instead of the default singleton.
 */
export async function readUsdRates(asOf: Date = new Date(), client: Prisma.TransactionClient = prisma): Promise<UsdRateMap> {
  const rows = await client.exchangeRate.findMany({
    where: { baseCurrency: "USD", asOfDate: { lte: asOf } },
    orderBy: { asOfDate: "desc" }, distinct: ["quoteCurrency"],
  });
  return Object.fromEntries(rows.map((r) => [r.quoteCurrency, Number(r.rate)]));
}

/** Missing FX must not turn into a misleading partial total. */
export function requireConversion(amount: number, from: string, to: string, rates: UsdRateMap): number {
  const result = convertCurrency(amount, from, to, rates);
  if (result === null || !Number.isFinite(result)) throw new Error(`Missing or invalid exchange rate: ${from} to ${to}`);
  return result;
}
