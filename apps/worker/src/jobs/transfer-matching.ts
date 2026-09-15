import { prisma, type TransferCounterpartType } from "@finance-app/db";
import { matchTransfers, type MoneyMovementEvent } from "@finance-app/finance-logic";

// Recent-window scan only, not full history -- keeps the nightly job cheap
// and recent transactions are the ones actually worth flagging (an older
// un-flagged transfer is lower priority than a fresh one).
const WINDOW_DAYS = 45;

type TaggedEvent = MoneyMovementEvent & { domain: TransferCounterpartType };

export async function matchTransfersForAllUsers(): Promise<void> {
  const userIds = await prisma.appUser.findMany({ select: { id: true } });
  const failures: unknown[] = [];
  for (const { id: userId } of userIds) {
    try {
      await matchTransfersForUser(userId);
    } catch (err) {
      failures.push(err);
      console.error(`[worker] matchTransfers: user ${userId} failed`, err);
    }
  }
  if (failures.length) throw new AggregateError(failures, "User job incomplete");
}

export async function matchTransfersForUser(userId: string): Promise<void> {
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS);

  const [transactions, investmentTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, isTransfer: false, date: { gte: windowStart } },
      select: { id: true, accountId: true, amount: true, currency: true, date: true },
    }),
    prisma.investmentTransaction.findMany({
      where: {
        tradeType: { in: ["deposit", "withdrawal"] },
        linkedFromTransaction: null,
        account: { userId },
        tradeDate: { gte: windowStart },
      },
      select: { id: true, accountId: true, amount: true, currency: true, tradeDate: true },
    }),
  ]);



  // One combined event list, not two separate matchTransfers() passes --
  // running bank-vs-bank and bank-vs-investment as separate passes would
  // introduce an ordering bias (whichever pass runs first can greedily
  // consume a transaction that would have been a *better* match in the
  // other pass).
  const events: TaggedEvent[] = [
    ...transactions.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      amount: Number(t.amount),
      currency: t.currency,
      date: t.date,
      domain: "transaction" as const,
    })),
    ...investmentTransactions.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      amount: Number(t.amount),
      currency: t.currency,
      date: t.tradeDate,
      domain: "investment_transaction" as const,
    })),
  ];
  const eventsById = new Map(events.map((e) => [e.id, e]));

  const matches = matchTransfers(events, {
    eligiblePair: (a, b) => eventsById.get(a.id)?.domain === "transaction" || eventsById.get(b.id)?.domain === "transaction",
  });
  const seenTriples = new Set<string>();

  for (const match of matches) {
    const a = eventsById.get(match.aId)!;
    const b = eventsById.get(match.bId)!;

    // TransferMatchCandidate.transactionId is a hard FK to Transaction, so
    // the anchor must always be a real bank transaction. Canonicalize the
    // outflow (negative-amount) side as the anchor for a Transaction<->
    // Transaction pair so the same real pair is never proposed as both
    // (A,B) and (B,A).
    let anchor: TaggedEvent;
    let counterpart: TaggedEvent;
    if (a.domain === "transaction" && b.domain === "transaction") {
      [anchor, counterpart] = a.amount < 0 ? [a, b] : [b, a];
    } else if (a.domain === "transaction") {
      [anchor, counterpart] = [a, b];
    } else if (b.domain === "transaction") {
      [anchor, counterpart] = [b, a];
    } else {
      // Both sides are investment_transaction events -- shouldn't happen in
      // practice (deposits/withdrawals are always paired with a bank-side
      // movement, never with each other), but matchTransfers has no domain
      // awareness, so guard rather than write an invalid candidate.
      continue;
    }

    const counterpartType = counterpart.domain;
    seenTriples.add(`${anchor.id}:${counterpartType}:${counterpart.id}`);

    const existing = await prisma.transferMatchCandidate.findUnique({
      where: {
        transactionId_counterpartType_counterpartId: {
          transactionId: anchor.id,
          counterpartType,
          counterpartId: counterpart.id,
        },
      },
    });
    // Never overwrite a decision the user already made -- a dismissed
    // suggestion must never reappear.
    if (existing && existing.status !== "pending") continue;

    await prisma.transferMatchCandidate.upsert({
      where: {
        transactionId_counterpartType_counterpartId: {
          transactionId: anchor.id,
          counterpartType,
          counterpartId: counterpart.id,
        },
      },
      create: {
        userId,
        transactionId: anchor.id,
        counterpartType,
        counterpartId: counterpart.id,
        confidenceScore: match.confidenceScore,
        status: "pending",
      },
      update: {
        confidenceScore: match.confidenceScore,
      },
    });
  }

  // Clean up pending suggestions this run no longer reproduces (e.g. one
  // side got reconciled elsewhere, or a better match now exists) so the
  // review queue doesn't pile up stale suggestions night over night.
  const stalePending = await prisma.transferMatchCandidate.findMany({
    where: { userId, status: "pending" },
    select: { id: true, transactionId: true, counterpartType: true, counterpartId: true },
  });
  const staleIds = stalePending
    .filter((c) => !seenTriples.has(`${c.transactionId}:${c.counterpartType}:${c.counterpartId}`))
    .map((c) => c.id);
  if (staleIds.length > 0) {
    await prisma.transferMatchCandidate.deleteMany({ where: { id: { in: staleIds }, userId, status: "pending" } });
  }
}
