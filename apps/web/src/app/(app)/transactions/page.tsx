import Link from "next/link";
import { Wallet, Receipt, Repeat, ArrowRightLeft, Info } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LOW_CONFIDENCE_THRESHOLD } from "@finance-app/categorization-ai/constants";
import { NewTransactionDialog } from "./new-transaction-dialog";
import { ImportCsvDialog } from "./import-csv-dialog";
import { CategoryPicker } from "./category-picker";
import { CategoryFilter } from "./category-filter";
import { SpendingBreakdownCard } from "./spending-breakdown-card";
import { TransactionsPagination } from "./pagination";
import { SearchInput } from "./search-input";
import { SuggestedTransfersTab, type TransferMatchRow } from "./suggested-transfers-tab";
import { SuggestedReversalsSection, type ReversalMatchRow } from "./suggested-reversals-section";
import { ReversedTransactionRow, type ReversedPairSide } from "./reversed-transaction-row";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { AppHeader } from "@/components/app-header";
import { SPEND_RANGE_KINDS } from "@/lib/spend-range";
import {
  resolveSpendRange,
  convertCurrency,
  findPossibleCrossCurrencyTransfers,
  netSpendByCategory,
  summarizeSpendByCategory,
  type SpendRangeKind,
  type UsdRateMap,
} from "@finance-app/finance-logic";

const TRANSACTION_SELECT = {
  id: true,
  description: true,
  merchantName: true,
  amount: true,
  currency: true,
  date: true,
  isTransfer: true,
  categoryId: true,
  categorySource: true,
  categoryConfidence: true,
  account: { select: { name: true } },
  category: { select: { name: true } },
} as const;

type TransactionRowData = {
  id: string;
  description: string;
  merchantName: string | null;
  amount: unknown;
  currency: string;
  date: Date;
  isTransfer: boolean;
  categoryId: string | null;
  categorySource: "rule" | "ai" | "manual" | "uncategorized";
  categoryConfidence: unknown;
  account: { name: string };
  category: { name: string } | null;
};

const PAGE_SIZE = 50;

// Extracted so /activity (the real primary destination as of the nav-shell
// phase) and this legacy /transactions route can share one implementation
// while rendering AppHeader in different modes.
const TAB_VALUES = ["all", "review", "transfers"] as const;

export async function TransactionsBody({
  searchParams,
  headerMode = "sub",
}: {
  searchParams: Promise<{ category?: string; page?: string; reviewPage?: string; range?: string; tab?: string; q?: string }>;
  headerMode?: "root" | "sub";
}) {
  const userId = await requireUserId();
  const { category: categoryParam, page: pageParam, reviewPage: reviewPageParam, range: rangeParam, tab: tabParam, q: queryParam } = await searchParams;
  const initialTab = TAB_VALUES.includes(tabParam as (typeof TAB_VALUES)[number]) ? (tabParam as (typeof TAB_VALUES)[number]) : "all";
  const categoryFilter = categoryParam && categoryParam !== "__all__" ? categoryParam : undefined;
  const searchQuery = queryParam?.trim() || undefined;
  const page = Math.max(1, Number(pageParam) || 1);
  const reviewPage = Math.max(1, Number(reviewPageParam) || 1);
  const spendRange: SpendRangeKind = SPEND_RANGE_KINDS.includes(rangeParam as SpendRangeKind)
    ? (rangeParam as SpendRangeKind)
    : "mtd";
  const transactionWhere = {
    userId,
    ...(categoryFilter && { categoryId: categoryFilter }),
    ...(searchQuery && {
      OR: [
        { description: { contains: searchQuery, mode: "insensitive" as const } },
        { merchantName: { contains: searchQuery, mode: "insensitive" as const } },
      ],
    }),
  };
  // Ignores the category filter -- most rows here are uncategorized (no
  // categoryId to filter on), so filtering by category would make this tab
  // look empty whenever any specific category is selected.
  const needsReviewWhere = {
    userId,
    isTransfer: false,
    OR: [
      { categorySource: "uncategorized" as const },
      { categorySource: "ai" as const, categoryConfidence: { lt: LOW_CONFIDENCE_THRESHOLD } },
    ],
  };

  const [
    appUser,
    accounts,
    categories,
    csvTemplates,
    transactions,
    transactionCount,
    needsReview,
    needsReviewCount,
    pendingTransferMatches,
    pendingReversalMatches,
  ] = await Promise.all([
      prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
      prisma.financialAccount.findMany({
        where: { userId, isArchived: false },
        select: { id: true, name: true, currency: true },
        orderBy: { name: "asc" },
      }),
      prisma.category.findMany({
        where: { userId, isArchived: false, kind: { in: ["income", "expense"] } },
        select: { id: true, name: true, kind: true },
        orderBy: { name: "asc" },
      }),
      prisma.csvImportTemplate.findMany({
        where: { userId },
        orderBy: { institutionName: "asc" },
      }),
      prisma.transaction.findMany({
        where: transactionWhere,
        select: TRANSACTION_SELECT,
        orderBy: { date: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.transaction.count({ where: transactionWhere }),
      prisma.transaction.findMany({
        where: needsReviewWhere,
        select: TRANSACTION_SELECT,
        orderBy: { date: "desc" },
        skip: (reviewPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.transaction.count({ where: needsReviewWhere }),
      prisma.transferMatchCandidate.findMany({
        where: { userId, status: "pending" },
        orderBy: { confidenceScore: "desc" },
        include: {
          transaction: {
            select: {
              id: true,
              date: true,
              amount: true,
              currency: true,
              description: true,
              account: { select: { name: true } },
            },
          },
        },
      }),
      prisma.reversalMatchCandidate.findMany({
        where: { userId, status: "pending" },
        orderBy: { confidenceScore: "desc" },
        include: {
          chargeTransaction: { select: { id: true, date: true, amount: true, currency: true, description: true, account: { select: { name: true } } } },
          reversalTransaction: { select: { id: true, date: true, amount: true, currency: true, description: true, account: { select: { name: true } } } },
        },
      }),
    ]);
  const totalPages = Math.max(1, Math.ceil(transactionCount / PAGE_SIZE));
  const needsReviewTotalPages = Math.max(1, Math.ceil(needsReviewCount / PAGE_SIZE));

  const transactionCounterpartIds = pendingTransferMatches
    .filter((c) => c.counterpartType === "transaction")
    .map((c) => c.counterpartId);
  const investmentCounterpartIds = pendingTransferMatches
    .filter((c) => c.counterpartType === "investment_transaction")
    .map((c) => c.counterpartId);

  const [transactionCounterparts, investmentCounterparts] = await Promise.all([
    transactionCounterpartIds.length > 0
      ? prisma.transaction.findMany({
          where: { id: { in: transactionCounterpartIds }, userId },
          select: {
            id: true,
            date: true,
            amount: true,
            currency: true,
            description: true,
            account: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    investmentCounterpartIds.length > 0
      ? prisma.investmentTransaction.findMany({
          where: { id: { in: investmentCounterpartIds }, account: { userId } },
          select: {
            id: true,
            tradeDate: true,
            amount: true,
            currency: true,
            tradeType: true,
            symbol: true,
            account: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const transactionCounterpartById = new Map(transactionCounterparts.map((t) => [t.id, t]));
  const investmentCounterpartById = new Map(investmentCounterparts.map((t) => [t.id, t]));

  const transferMatchRows: TransferMatchRow[] = pendingTransferMatches.flatMap((c) => {
    const anchor = {
      id: c.transaction.id,
      date: c.transaction.date,
      amount: Number(c.transaction.amount),
      currency: c.transaction.currency,
      description: c.transaction.description,
      accountName: c.transaction.account.name,
    };

    if (c.counterpartType === "transaction") {
      const counterpart = transactionCounterpartById.get(c.counterpartId);
      if (!counterpart) return [];
      return [
        {
          id: c.id,
          confidenceScore: Number(c.confidenceScore),
          anchor,
          counterpart: {
            id: counterpart.id,
            date: counterpart.date,
            amount: Number(counterpart.amount),
            currency: counterpart.currency,
            description: counterpart.description,
            accountName: counterpart.account.name,
          },
        },
      ];
    }

    const counterpart = investmentCounterpartById.get(c.counterpartId);
    if (!counterpart) return [];
    const tradeLabel = counterpart.tradeType === "deposit" ? "Deposit" : "Withdrawal";
    return [
      {
        id: c.id,
        confidenceScore: Number(c.confidenceScore),
        anchor,
        counterpart: {
          id: counterpart.id,
          date: counterpart.tradeDate,
          amount: Number(counterpart.amount),
          currency: counterpart.currency,
          description: counterpart.symbol ? `${tradeLabel} (${counterpart.symbol})` : tradeLabel,
          accountName: counterpart.account.name,
        },
      },
    ];
  });

  const reversalMatchRows: ReversalMatchRow[] = pendingReversalMatches.map((c) => ({
    id: c.id,
    confidenceScore: Number(c.confidenceScore),
    charge: {
      id: c.chargeTransaction.id,
      date: c.chargeTransaction.date,
      amount: Number(c.chargeTransaction.amount),
      currency: c.chargeTransaction.currency,
      description: c.chargeTransaction.description,
      accountName: c.chargeTransaction.account.name,
    },
    reversal: {
      id: c.reversalTransaction.id,
      date: c.reversalTransaction.date,
      amount: Number(c.reversalTransaction.amount),
      currency: c.reversalTransaction.currency,
      description: c.reversalTransaction.description,
      accountName: c.reversalTransaction.account.name,
    },
  }));

  // Confirmed reversal pairs touching the current page render as one
  // collapsed economic event in the "All" list instead of two independent-
  // looking rows -- a presentation layer only, the underlying Transaction
  // rows are never modified. The reversal (credit) side of a confirmed pair
  // is looked up here too so it can be fetched even if it fell on a
  // different page than its charge (rare, since matched pairs are within
  // 10 days of each other, but not impossible near a page boundary).
  const pageTxIds = transactions.map((t) => t.id);
  const confirmedReversals = pageTxIds.length
    ? await prisma.reversalMatchCandidate.findMany({
        where: {
          userId,
          status: "confirmed",
          OR: [{ chargeTransactionId: { in: pageTxIds } }, { reversalTransactionId: { in: pageTxIds } }],
        },
      })
    : [];
  const pageTxIdSet = new Set(pageTxIds);
  const missingPartnerIds = confirmedReversals.flatMap((c) => {
    const missing: string[] = [];
    if (!pageTxIdSet.has(c.chargeTransactionId)) missing.push(c.chargeTransactionId);
    if (!pageTxIdSet.has(c.reversalTransactionId)) missing.push(c.reversalTransactionId);
    return missing;
  });
  const partnerTransactions = missingPartnerIds.length
    ? await prisma.transaction.findMany({ where: { id: { in: missingPartnerIds } }, select: TRANSACTION_SELECT })
    : [];
  const reversalSideById = new Map<string, ReversedPairSide>(
    [...transactions, ...partnerTransactions].map((t) => [
      t.id,
      { id: t.id, date: t.date, amount: Number(t.amount), currency: t.currency, description: t.description, accountName: t.account.name },
    ])
  );
  const reversalByChargeId = new Map(confirmedReversals.map((c) => [c.chargeTransactionId, c]));
  const reversalAbsorbedIds = new Set(confirmedReversals.map((c) => c.reversalTransactionId));

  // Read-only, informational only -- cross-currency transfers are never
  // auto-matched (the app only has a "latest FX rate," not a historical
  // rate for the transfer date, so an FX-tolerant auto-match could be
  // quietly wrong). Scans the same recent window as the nightly matcher.
  const crossCurrencyWindowStart = new Date();
  crossCurrencyWindowStart.setUTCDate(crossCurrencyWindowStart.getUTCDate() - 45);
  const recentTransactionsForCrossCurrency = await prisma.transaction.findMany({
    where: { userId, isTransfer: false, date: { gte: crossCurrencyWindowStart } },
    select: {
      id: true,
      accountId: true,
      amount: true,
      currency: true,
      date: true,
      description: true,
      account: { select: { name: true } },
    },
  });
  const crossCurrencyById = new Map(recentTransactionsForCrossCurrency.map((t) => [t.id, t]));
  const crossCurrencyCandidates = findPossibleCrossCurrencyTransfers(
    recentTransactionsForCrossCurrency.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      amount: Number(t.amount),
      currency: t.currency,
      date: t.date,
    }))
  );
  const crossCurrencyRows = crossCurrencyCandidates.flatMap((c) => {
    const a = crossCurrencyById.get(c.aId);
    const b = crossCurrencyById.get(c.bId);
    if (!a || !b) return [];
    return [
      {
        daysApart: c.daysApart,
        a: {
          id: a.id,
          date: a.date,
          amount: Number(a.amount),
          currency: a.currency,
          description: a.description,
          accountName: a.account.name,
        },
        b: {
          id: b.id,
          date: b.date,
          amount: Number(b.amount),
          currency: b.currency,
          description: b.description,
          accountName: b.account.name,
        },
      },
    ];
  });

  const { start: spendRangeStart, end: spendRangeEnd } = resolveSpendRange(spendRange, new Date());
  const rangedExpenses = await prisma.transaction.findMany({
    where: {
      userId,
      isTransfer: false,
      category: { kind: "expense" },
      date: { gte: spendRangeStart, lt: spendRangeEnd },
    },
    select: { amount: true, currency: true, categoryId: true, category: { select: { name: true } } },
  });

  const latestRateDate = await prisma.exchangeRate.aggregate({
    where: { baseCurrency: "USD" },
    _max: { asOfDate: true },
  });
  const rateRows = latestRateDate._max.asOfDate
    ? await prisma.exchangeRate.findMany({
        where: { baseCurrency: "USD", asOfDate: latestRateDate._max.asOfDate },
      })
    : [];
  const usdRates: UsdRateMap = Object.fromEntries(rateRows.map((r) => [r.quoteCurrency, Number(r.rate)]));

  const convertedExpenses = rangedExpenses.map((t) => ({
    categoryId: t.categoryId,
    categoryName: t.category?.name,
    converted: convertCurrency(Number(t.amount), t.currency, appUser.defaultCurrency, usdRates),
  }));
  const spendConversionIncomplete = convertedExpenses.some((e) => e.converted === null);
  // Signed here (not abs'd yet) so netSpendByCategory can offset a refund
  // against its own category's spend instead of counting both directions
  // as separate spend -- see packages/finance-logic/src/spend.ts.
  const signedSpendRows = convertedExpenses.flatMap((e) =>
    e.converted !== null && e.categoryId && e.categoryName
      ? [{ categoryId: e.categoryId, categoryName: e.categoryName, amount: e.converted }]
      : []
  );
  const spendBuckets = summarizeSpendByCategory(netSpendByCategory(signedSpendRows), 5);

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      {headerMode === "root" ? (
        <AppHeader mode="root" pageTitle="Activity" />
      ) : (
        <AppHeader
          title="Transactions"
          primaryAction={<NewTransactionDialog accounts={accounts} categories={categories} />}
          overflow={
            <>
              <ImportCsvDialog accounts={accounts} templates={csvTemplates} />
              <Button variant="ghost" asChild>
                <Link href="/recurring">
                  <Repeat className="size-4" />
                  Recurring charges
                </Link>
              </Button>
            </>
          }
        />
      )}

      <SearchInput initialQuery={searchQuery} />

      <SpendingBreakdownCard
        spendBuckets={spendBuckets}
        currency={appUser.defaultCurrency}
        spendRange={spendRange}
        conversionIncomplete={spendConversionIncomplete}
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add an account first before recording transactions."
        />
      ) : transactionCount === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Add one manually or import a CSV."
        />
      ) : (
        <Tabs defaultValue={initialTab}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList>
              <TabsTrigger value="all">All ({transactionCount})</TabsTrigger>
              <TabsTrigger value="review">
                Needs review
                {needsReviewCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {needsReviewCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="transfers">
                Transfers
                {transferMatchRows.length + reversalMatchRows.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {transferMatchRows.length + reversalMatchRows.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <CategoryFilter categories={categories} selected={categoryFilter} />
          </div>

          <TabsContent value="all" className="mt-3 space-y-3">
            <TransactionList
              transactions={transactions}
              categories={categories}
              reversalByChargeId={reversalByChargeId}
              reversalAbsorbedIds={reversalAbsorbedIds}
              reversalSideById={reversalSideById}
            />
            {totalPages > 1 && <TransactionsPagination page={page} totalPages={totalPages} />}
          </TabsContent>
          <TabsContent value="review" className="mt-3 space-y-3">
            {needsReviewCount === 0 ? (
              <EmptyState icon={Receipt} title="Nothing needs review" description="Every transaction has a confident category." />
            ) : (
              <>
                <TransactionList transactions={needsReview} categories={categories} />
                {needsReviewTotalPages > 1 && (
                  <TransactionsPagination page={reviewPage} totalPages={needsReviewTotalPages} paramName="reviewPage" />
                )}
              </>
            )}
          </TabsContent>
          <TabsContent value="transfers" className="mt-3 space-y-6">
            {transferMatchRows.length === 0 && crossCurrencyRows.length === 0 && reversalMatchRows.length === 0 ? (
              <EmptyState
                icon={ArrowRightLeft}
                title="Nothing to review"
                description="Suggested transfers between your own accounts and possible charge reversals will show up here."
              />
            ) : (
              <>
                <SuggestedReversalsSection rows={reversalMatchRows} suppressEmptyState />
                {(transferMatchRows.length > 0 || crossCurrencyRows.length > 0) && reversalMatchRows.length > 0 && (
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Suggested transfers</h3>
                )}
                <SuggestedTransfersTab rows={transferMatchRows} crossCurrencyRows={crossCurrencyRows} suppressEmptyState />
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; reviewPage?: string; range?: string; tab?: string; q?: string }>;
}) {
  return <TransactionsBody searchParams={searchParams} headerMode="sub" />;
}

function TransactionList({
  transactions,
  categories,
  reversalByChargeId,
  reversalAbsorbedIds,
  reversalSideById,
}: {
  transactions: TransactionRowData[];
  categories: { id: string; name: string }[];
  /** Confirmed reversal pairs touching this list -- charge id -> candidate. Only meaningful for the "All" list. */
  reversalByChargeId?: Map<string, { chargeTransactionId: string; reversalTransactionId: string }>;
  /** Reversal (credit) transaction ids already absorbed into a combined row -- skip rendering them standalone. */
  reversalAbsorbedIds?: Set<string>;
  reversalSideById?: Map<string, ReversedPairSide>;
}) {
  return (
    <div className="divide-y divide-border">
      {transactions.map((t) => {
        if (reversalAbsorbedIds?.has(t.id)) return null; // rendered as part of its charge's combined row instead
        const reversalCandidate = reversalByChargeId?.get(t.id);
        if (reversalCandidate && reversalSideById) {
          const charge = reversalSideById.get(reversalCandidate.chargeTransactionId);
          const reversal = reversalSideById.get(reversalCandidate.reversalTransactionId);
          if (charge && reversal) {
            return <ReversedTransactionRow key={t.id} charge={charge} reversal={reversal} />;
          }
        }
        return <TransactionRow key={t.id} transaction={t} categories={categories} />;
      })}
    </div>
  );
}

function TransactionRow({
  transaction: t,
  categories,
}: {
  transaction: TransactionRowData;
  categories: { id: string; name: string }[];
}) {
  const amount = Number(t.amount);
  // Prefer the cleaned-up merchant name when one exists (a confident value
  // set by rule/CSV/Plaid import, never invented here) -- raw bank
  // descriptions like "Zelle Transfer Conf# 99CWNC4CJ; LINA PH..." are
  // still the ground truth, so they're never dropped, just moved behind an
  // info tooltip instead of always occupying the row's primary line.
  const displayName = t.merchantName?.trim() || t.description;
  const hasRawDescription = displayName !== t.description;
  return (
    <div className="flex flex-col gap-1 px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <p className="truncate font-medium">{displayName}</p>
          {hasRawDescription && (
            <Tooltip>
              <TooltipTrigger aria-label="Bank description">
                <Info className="size-3.5 shrink-0 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{t.description}</TooltipContent>
            </Tooltip>
          )}
        </span>
        <p
          className={cn(
            "font-amount shrink-0 text-right font-semibold",
            amount > 0 ? "text-positive" : amount < 0 ? "text-negative" : ""
          )}
        >
          {formatMoney(amount, t.currency, { signDisplay: "always" })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        {!t.isTransfer && (
          <CategoryPicker
            transactionId={t.id}
            categoryId={t.categoryId}
            categories={categories}
            categorySource={t.categorySource}
            categoryConfidence={t.categoryConfidence == null ? null : Number(t.categoryConfidence)}
          />
        )}
        <span>
          {t.isTransfer && (
            <Badge variant="outline" className="mr-1.5">
              transfer
            </Badge>
          )}
          {new Date(t.date).toLocaleDateString()} · {t.account.name}
        </span>
      </div>
    </div>
  );
}
