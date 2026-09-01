import type { AccountType } from "@finance-app/db";
import { formatMoney } from "@/lib/format";
import { ACCOUNT_TYPE_ICON, ACCOUNT_TYPE_COLOR } from "@/lib/account-types";

export interface AccountListRow {
  id: string;
  name: string;
  type: AccountType;
  classification: "asset" | "liability";
  balance: number;
}

export function AccountList({ accounts, currency }: { accounts: AccountListRow[]; currency: string }) {
  const sorted = [...accounts].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 5);
  if (sorted.length === 0) return null;
  const maxAbs = Math.max(...sorted.map((a) => Math.abs(a.balance)), 1);

  return (
    <ul className="space-y-2.5">
      {sorted.map((account) => {
        const Icon = ACCOUNT_TYPE_ICON[account.type];
        const barColor = account.classification === "liability" ? "var(--negative)" : ACCOUNT_TYPE_COLOR[account.type];
        return (
          <li key={account.id} className="flex items-center gap-2.5">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">{account.name}</span>
                <span className="font-amount shrink-0 text-sm font-medium">
                  {formatMoney(account.balance, currency)}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, (Math.abs(account.balance) / maxAbs) * 100)}%`,
                    background: barColor,
                  }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
