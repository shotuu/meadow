import { Wallet, CircleDollarSign } from "lucide-react";
import { prisma, type AccountType } from "@finance-app/db";
import { readAccountBalances, readCurrentHoldings } from "@finance-app/finance-data";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewAccountDialog } from "./new-account-dialog";
import { ConnectPlaidButton } from "./connect-plaid-button";
import { ConnectIbkrDialog } from "./connect-ibkr-dialog";
import { ConnectFinverseButton } from "./connect-finverse-button";
import { FinverseLinkStatus } from "./finverse-link-status";
import { archiveAccount, unarchiveAccount } from "./actions";
import { formatMoney, formatFreshness } from "@/lib/format";
import { summarizeByClassification } from "@/lib/balances";
import { ACCOUNT_TYPE_ICON, SYNC_SOURCE_LABEL } from "@/lib/account-types";
import { CompositionChart } from "@/components/composition-chart";
import { EmptyState } from "@/components/empty-state";
import { SyncNowButton } from "./sync-now-button";
import { AppHeader } from "@/components/app-header";
import { SectionLabel } from "@/components/typography";

// Accounts is the lower-frequency account-management destination as of
// Phase 5 of the UI/UX redesign: connected accounts, balances,
// connection/sync/configuration actions. Portfolio content (holdings,
// strategy, portfolio value) moved to /invest -- see PROGRESS.md's Phase 5
// entry and DESIGN.md's "Header system" section. No longer a primary-tab
// destination (unlike Phase 2's temporary /invest-renders-AccountsBody
// compromise), so this is a plain sub-mode-only page now, matching
// Categories/Alerts/Settings.
export default async function AccountsPage() {
  const userId = await requireUserId();

  const [appUser, accounts, archivedAccounts] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.financialAccount.findMany({
      where: { userId, isArchived: false },
      include: {
        _count: { select: { transactions: true } },
        ibkrFlexConfig: { select: { lastRunAt: true } },
      },
      orderBy: [{ classification: "asc" }, { name: "asc" }],
    }),
    prisma.financialAccount.findMany({
      where: { userId, isArchived: true },
      select: { id: true, name: true, type: true, institutionName: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const computedBalances = await readAccountBalances(userId, accounts);
  const balanceByAccount = new Map([...computedBalances].map(([id, result]) => [id, result.balance]));
  const ibkrAccountIds = accounts.filter((a) => a.syncSource === "ibkr_flex").map((a) => a.id);
  const holdingCountByAccount = new Map<string, number>();
  if (ibkrAccountIds.length > 0) {
    const holdings = await readCurrentHoldings(userId, ibkrAccountIds);
    for (const h of holdings.filter((h) => Number(h.quantity) !== 0)) {
      holdingCountByAccount.set(h.accountId, (holdingCountByAccount.get(h.accountId) ?? 0) + 1);
    }
  }

  const assets = accounts.filter((a) => a.classification === "asset");
  const liabilities = accounts.filter((a) => a.classification === "liability");

  const byCurrency = summarizeByClassification(
    accounts.map((a) => ({
      classification: a.classification,
      currency: a.currency,
      balance: Number(balanceByAccount.get(a.id)) || 0,
    }))
  );

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <FinverseLinkStatus />
      <AppHeader
        title="Accounts"
        primaryAction={<NewAccountDialog defaultCurrency={appUser.defaultCurrency} />}
        overflow={
          <>
            {accounts.some((a) => ["plaid", "ibkr_flex", "finverse"].includes(a.syncSource)) && <SyncNowButton />}
            <ConnectPlaidButton />
            <ConnectIbkrDialog />
            <ConnectFinverseButton />
          </>
        }
      />

      {byCurrency.size > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...byCurrency.entries()].map(([currency, totals]) => (
            <Card key={currency}>
              <CardHeader>
                <CardTitle className="text-base">Composition ({currency})</CardTitle>
              </CardHeader>
              <CardContent>
                <CompositionChart assets={totals.assets} liabilities={totals.liabilities} currency={currency} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AccountGroup
        title="Assets"
        accounts={assets}
        balanceByAccount={balanceByAccount}
        holdingCountByAccount={holdingCountByAccount}
      />
      <AccountGroup
        title="Liabilities"
        accounts={liabilities}
        balanceByAccount={balanceByAccount}
        holdingCountByAccount={holdingCountByAccount}
      />

      {accounts.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Connect a bank, connect IBKR, or add one manually to start tracking transactions."
        />
      )}

      {archivedAccounts.length > 0 && (
        <div className="space-y-3">
          <SectionLabel>Archived</SectionLabel>
          <Card>
            <CardContent className="divide-y p-0">
              {archivedAccounts.map((account) => {
                const Icon = ACCOUNT_TYPE_ICON[account.type] ?? CircleDollarSign;
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-muted-foreground"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">
                        {account.name}
                        {account.institutionName && ` · ${account.institutionName}`}
                      </span>
                    </span>
                    <form action={unarchiveAccount.bind(null, account.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Unarchive
                      </Button>
                    </form>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function AccountGroup({
  title,
  accounts,
  balanceByAccount,
  holdingCountByAccount,
}: {
  title: string;
  accounts: Array<{
    id: string;
    name: string;
    type: AccountType;
    currency: string;
    institutionName: string | null;
    syncSource: "plaid" | "ibkr_flex" | "finverse" | "csv" | "manual";
    balanceAsOf: Date | null;
    _count: { transactions: number };
    ibkrFlexConfig: { lastRunAt: Date | null } | null;
  }>;
  balanceByAccount: Map<string, number>;
  holdingCountByAccount: Map<string, number>;
}) {
  if (accounts.length === 0) return null;
  return (
    <div className="space-y-3">
      <SectionLabel>{title}</SectionLabel>
      <Card>
        <CardContent className="divide-y p-0">
          {accounts.map((account) => {
            const Icon = ACCOUNT_TYPE_ICON[account.type] ?? CircleDollarSign;
            const countLabel =
              account.syncSource === "ibkr_flex"
                ? `${holdingCountByAccount.get(account.id) ?? 0} holding${(holdingCountByAccount.get(account.id) ?? 0) === 1 ? "" : "s"}`
                : `${account._count.transactions} transaction${account._count.transactions === 1 ? "" : "s"}`;
            const freshness =
              account.syncSource === "ibkr_flex"
                ? formatFreshness(account.ibkrFlexConfig?.lastRunAt ?? null)
                : account.syncSource === "plaid" || account.syncSource === "finverse"
                  ? formatFreshness(account.balanceAsOf)
                  : null;
            const metaParts = [
              account.institutionName,
              SYNC_SOURCE_LABEL[account.syncSource],
              countLabel,
              freshness,
            ].filter(Boolean);

            return (
              <div key={account.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className="text-xs text-muted-foreground">{metaParts.join(" · ")}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="font-amount text-sm font-semibold">
                    {formatMoney(balanceByAccount.get(account.id), account.currency)}
                  </p>
                  <form action={archiveAccount.bind(null, account.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Archive
                    </Button>
                  </form>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
