import { prisma } from "@finance-app/db";

const SOURCE = "frankfurter";

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * Fetches USD-based rates for every currency Frankfurter (ECB-sourced, free,
 * no API key) supports and stores them as ExchangeRate rows. Stored with
 * baseCurrency always "USD" — conversions between any two currencies
 * triangulate through USD (@finance-app/finance-logic's convertCurrency)
 * rather than needing every pair fetched/stored directly.
 */
export async function refreshExchangeRates(): Promise<void> {
  const response = await fetch("https://api.frankfurter.dev/v1/latest?base=USD");
  if (!response.ok) {
    throw new Error(`Frankfurter API returned ${response.status}`);
  }
  const data = (await response.json()) as FrankfurterResponse;
  const asOfDate = new Date(data.date);

  const entries: Array<[string, number]> = [["USD", 1], ...Object.entries(data.rates)];

  for (const [quoteCurrency, rate] of entries) {
    await prisma.exchangeRate.upsert({
      where: {
        baseCurrency_quoteCurrency_asOfDate: { baseCurrency: "USD", quoteCurrency, asOfDate },
      },
      create: { baseCurrency: "USD", quoteCurrency, rate, asOfDate, source: SOURCE },
      update: { rate, source: SOURCE },
    });
  }

  console.log(`[worker] refreshExchangeRates: stored ${entries.length} rates for ${data.date}`);
}
