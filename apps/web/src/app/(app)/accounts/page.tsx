import {
  Wallet,
  PiggyBank,
  CreditCard,
  TrendingUp,
  Banknote,
  HandCoins,
  CircleDollarSign,
  type LucideIcon,
} from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewAccountDialog } from "./new-account-dialog";
import { ConnectPlaidButton } from "./connect-plaid-button";
import { ConnectIbkrDialog } from "./connect-ibkr-dialog";
import { archiveAccount } from "./actions";
import { formatMoney } from "@/lib/format";
import { summarizeByClassification } from "@/lib/balances";
import { CompositionChart } from "@/components/composition-chart";
import { EmptyState } from "@/components/empty-state";
import { HoldingsSection } from "./holdings-section";

const ACCOUNT_TYPE_ICON: Record<string, LucideIcon> = {
  checking: Wallet,
  savings: PiggyBank,
  credit_card: CreditCard,
  brokerage: TrendingUp,
  cash: Banknote,
  loan: HandCoins,
  other: CircleDollarSign,
};

export default async function AccountsPage() {
  const userId = await requireUserId();

  const [appUser, accounts] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.financialAccount.findMany({
      where: { userId, isArchived: false },
      include: {
        _count: { select: { transactions: true } },
      },
      orderBy: [{ classification: "asc" }, { name: "asc" }],
    }),
  ]);

  const balances = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { userId },
    _sum: { amount: true },
  });
  const balanceByAccount = new Map<string, unknown>(balances.map((b) => [b.accountId, b._sum.amount]));

  // IBKR-synced accounts have no Transaction rows at all — their balance
  // comes from InvestmentHolding market values instead (latest asOfDate
  // per symbol), not the transaction sum every other sync source uses.
  const ibkrAccountIds = accounts.filter((a) => a.syncSource === "ibkr_flex").map((a) => a.id);
  const holdingCountByAccount = new Map<string, number>();
  const latestHoldings: {
    symbol: string;
    quantity: number;
    avgCost: number | null;
    marketValue: number;
    currency: string;
  }[] = [];
  let portfolioHistory: { asOfDate: Date; value: number }[] = [];
  if (ibkrAccountIds.length > 0) {
    const [holdings, historyRows] = await Promise.all([
      prisma.investmentHolding.findMany({
        where: { accountId: { in: ibkrAccountIds } },
      }),
      prisma.investmentHoldingHistory.groupBy({
        by: ["asOfDate"],
        where: { accountId: { in: ibkrAccountIds } },
        _sum: { marketValue: true },
        orderBy: { asOfDate: "asc" },
      }),
    ]);
    const latestBySymbol = new Map<string, (typeof holdings)[number]>();
    for (const h of holdings) {
      const key = `${h.accountId}:${h.symbol}`;
      const existing = latestBySymbol.get(key);
      if (!existing || h.asOfDate > existing.asOfDate) latestBySymbol.set(key, h);
    }
    for (const h of latestBySymbol.values()) {
      balanceByAccount.set(h.accountId, (Number(balanceByAccount.get(h.accountId)) || 0) + Number(h.marketValue));
      holdingCountByAccount.set(h.accountId, (holdingCountByAccount.get(h.accountId) ?? 0) + 1);
      latestHoldings.push({
        symbol: h.symbol,
        quantity: Number(h.quantity),
        avgCost: h.avgCost !== null ? Number(h.avgCost) : null,
        marketValue: Number(h.marketValue),
        currency: h.currency,
      });
    }
    portfolioHistory = historyRows.map((r) => ({ asOfDate: r.asOfDate, value: Number(r._sum.marketValue ?? 0) }));
  }

  const ibkrCurrency = accounts.find((a) => a.syncSource === "ibkr_flex")?.currency ?? appUser.defaultCurrency;

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <div className="flex flex-wrap gap-2">
          <ConnectPlaidButton />
          <ConnectIbkrDialog />
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
        <HoldingsSection holdings={latestHoldings} history={portfolioHistory} currency={ibkrCurrency} />
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
    type: string;
    currency: string;
    institutionName: string | null;
    syncSource: string;
    _count: { transactions: number };
  }>;
  balanceByAccount: Map<string, unknown>;
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
