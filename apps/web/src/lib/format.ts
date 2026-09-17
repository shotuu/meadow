export function formatMoney(amount: unknown, currency: string, opts?: Intl.NumberFormatOptions): string {
  const value = amount == null ? 0 : Number(amount);
  return new Intl.NumberFormat(undefined, { style: "currency", currency, ...opts }).format(value);
}

/**
 * "Synced 2h ago" style relative freshness, for a synced account's last
 * successful sync timestamp (never a raw date/technical field). Returns
 * null for accounts with no sync concept (manual/CSV) -- callers should
 * omit the row entirely rather than show a "never synced" placeholder.
 */
export function formatFreshness(date: Date | null | undefined): string | null {
  if (!date) return null;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `Synced ${days}d ago`;
  return `Synced ${date.toLocaleDateString()}`;
}
