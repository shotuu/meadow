import { Wallet, CircleDollarSign } from "lucide-react";
import { prisma, type AccountType } from "@finance-app/db";
import { readAccountBalances, readCurrentHoldings, readPortfolioHistory, readUsdRates, requireConversion } from "@finance-app/finance-data";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewAccountDialog } from "./new-account-dialog";
import { ConnectPlaidButton } from "./connect-plaid-button";
import { ConnectIbkrDialog } from "./connect-ibkr-dialog";
import { ConnectFinverseButton } from "./connect-finverse-button";
import { FinverseLinkStatus } from "./finverse-link-status";
import { archiveAccount, unarchiveAccount } from "./actions";
import { formatMoney } from "@/lib/format";
import { summarizeByClassification } from "@/lib/balances";
import { ACCOUNT_TYPE_ICON } from "@/lib/account-types";
import { CompositionChart } from "@/components/composition-chart";
import { EmptyState } from "@/components/empty-state";
import { HoldingsSection } from "./holdings-section";
import { TargetAllocationSection } from "./target-allocation-section";
import { SyncNowButton } from "./sync-now-button";

export default async function AccountsPage() {
  const userId = await requireUserId();

  const [appUser, accounts, archivedAccounts] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.financialAccount.findMany({
      where: { userId, isArchived: false },
      include: {
        _count: { select: { transactions: true } },
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
  const ibkrCurrency = appUser.defaultCurrency;
  const rates = await readUsdRates();
  const ibkrAccountIds = accounts.filter((a) => a.syncSource === "ibkr_flex").map((a) => a.id);
  const holdingCountByAccount = new Map<string, number>();
  const latestHoldings: {
    accountId: string;
    symbol: string;
    securityType: string;
    ibkrSubCategory: string | null;
    quantity: number;
    avgCost: number | null;
    marketValue: number;
    currency: string;
  }[] = [];
  let portfolioHistory: { asOfDate: Date; value: number | null }[] = [];
  let targetAllocations: { bucketName: string; targetWeightPct: number; driftThresholdPct: number }[] = [];
  let bucketAssignments: { symbol: string; bucketName: string }[] = [];
  let instrumentTypeOverrides: { symbol: string; instrumentType: string }[] = [];
  if (ibkrAccountIds.length > 0) {
    const [holdings, historyRows, targetAllocationRows, bucketAssignmentRows, instrumentTypeOverrideRows] = await Promise.all([
      readCurrentHoldings(userId, ibkrAccountIds),
      readPortfolioHistory(userId, ibkrCurrency, ibkrAccountIds),
      prisma.targetAllocation.findMany({ where: { userId } }),
      prisma.holdingBucketAssignment.findMany({ where: { userId } }),
      prisma.instrumentTypeOverride.findMany({ where: { userId } }),
    ]);
    const latestBySymbol = holdings.filter((h) => Number(h.quantity) !== 0);
    for (const h of latestBySymbol) {
      holdingCountByAccount.set(h.accountId, (holdingCountByAccount.get(h.accountId) ?? 0) + 1);
      latestHoldings.push({
        accountId: h.accountId,
        symbol: h.symbol,
        securityType: h.securityType,
        ibkrSubCategory: h.ibkrSubCategory,
        quantity: Number(h.quantity),
        avgCost: h.avgCost !== null ? requireConversion(Number(h.avgCost), h.currency, ibkrCurrency, rates) : null,
        marketValue: requireConversion(Number(h.marketValue), h.currency, ibkrCurrency, rates),
        currency: ibkrCurrency,
      });
    }
    portfolioHistory = historyRows;
    targetAllocations = targetAllocationRows.map((t) => ({
      bucketName: t.bucketName,
      targetWeightPct: Number(t.targetWeightPct),
      driftThresholdPct: Number(t.driftThresholdPct),
    }));
    bucketAssignments = bucketAssignmentRows.map((b) => ({ symbol: b.symbol, bucketName: b.bucketName }));
    instrumentTypeOverrides = instrumentTypeOverrideRows.map((o) => ({ symbol: o.symbol, instrumentType: o.instrumentType }));
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <div className="flex flex-wrap gap-2">
          {accounts.some((a) => ["plaid", "ibkr_flex", "finverse"].includes(a.syncSource)) && <SyncNowButton />}
          <ConnectPlaidButton />
          <ConnectIbkrDialog />
          <ConnectFinverseButton />
          <NewAccountDialog defaultCurrency={appUser.defaultCurrency} />
        </div>
      </div>

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

      {latestHoldings.length > 0 && (
        <HoldingsSection
          holdings={latestHoldings}
          history={portfolioHistory}
          currency={ibkrCurrency}
          bucketAssignments={bucketAssignments}
          instrumentTypeOverrides={instrumentTypeOverrides}
        />
      )}

      {latestHoldings.length > 0 && (
        <TargetAllocationSection
          holdings={latestHoldings}
          targets={targetAllocations}
          bucketAssignments={bucketAssignments}
        />
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
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Archived</h2>
          <Card>
            <CardContent className="divide-y p-0">
              {archivedAccounts.map((account) => {
                const Icon = ACCOUNT_TYPE_ICON[account.type] ?? CircleDollarSign;
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between px-4 py-3 text-muted-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 shrink-0" />
                      {account.name}
                      {account.institutionName && ` · ${account.institutionName}`}
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
    syncSource: string;
    _count: { transactions: number };
  }>;
  balanceByAccount: Map<string, number>;
  holdingCountByAccount: Map<string, number>;
}) {
  if (accounts.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</h2>
      <div className="grid gap-3">
        {accounts.map((account) => {
          const Icon = ACCOUNT_TYPE_ICON[account.type] ?? CircleDollarSign;
          return (
          <Card key={account.id}>
            <CardHeader className="flex items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">{account.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {account.institutionName ? `${account.institutionName} · ` : ""}
                    {account.type.replace("_", " ")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-amount text-lg font-semibold">
                  {formatMoney(balanceByAccount.get(account.id), account.currency)}
                </p>
                <Badge variant="secondary">{account.syncSource}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {account.syncSource === "ibkr_flex" ? (
                  <>
                    {holdingCountByAccount.get(account.id) ?? 0} holding
                    {(holdingCountByAccount.get(account.id) ?? 0) === 1 ? "" : "s"}
                  </>
                ) : (
                  <>
                    {account._count.transactions} transaction{account._count.transactions === 1 ? "" : "s"}
                  </>
                )}
              </p>
              <form action={archiveAccount.bind(null, account.id)}>
                <Button type="submit" variant="ghost" size="sm">
                  Archive
                </Button>
              </form>
            </CardContent>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
