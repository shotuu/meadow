export function formatMoney(amount: unknown, currency: string, opts?: Intl.NumberFormatOptions): string {
  const value = amount == null ? 0 : Number(amount);
  return new Intl.NumberFormat(undefined, { style: "currency", currency, ...opts }).format(value);
}
