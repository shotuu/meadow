import { prisma } from "@finance-app/db";
import { matchReversals, normalizeMerchantKey, planReversalCandidateSync, type ReversalCandidateEvent } from "@finance-app/finance-logic";

// Recent-window scan only, mirrors matchTransfersForUser's own window --
// matchReversals' own default 10-day pairing distance means anything
// outside this wider fetch window could never match anyway; the wider
// window just gives the matcher a reasonable pool to search.
const WINDOW_DAYS = 45;

export async function matchReversalsForAllUsers(): Promise<void> {
  const userIds = await prisma.appUser.findMany({ select: { id: true } });
  const failures: unknown[] = [];
  for (const { id: userId } of userIds) {
    try {
      await matchReversalsForUser(userId);
    } catch (err) {
      failures.push(err);
      console.error(`[worker] matchReversals: user ${userId} failed`, err);
    }
  }
  if (failures.length) throw new AggregateError(failures, "User job incomplete");
}

export async function matchReversalsForUser(userId: string): Promise<void> {
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS);

  const [confirmedRows, existingCandidates, transactions] = await Promise.all([
    // A transaction already settled into a confirmed reversal pairing is
    // retired from candidate generation entirely -- re-matching it against
    // something else would create a contradictory active relationship for
    // an already-resolved side. (Dismissed pairs are NOT excluded here --
    // dismissal is a judgment about one specific pairing, not a blanket
    // "this transaction is never a reversal of anything.")
    prisma.reversalMatchCandidate.findMany({
      where: { userId, status: "confirmed" },
      select: { chargeTransactionId: true, reversalTransactionId: true },
    }),
    prisma.reversalMatchCandidate.findMany({
      where: { userId },
      select: { id: true, chargeTransactionId: true, reversalTransactionId: true, status: true },
    }),
    prisma.transaction.findMany({
      where: { userId, isTransfer: false, date: { gte: windowStart } },
      select: { id: true, accountId: true, amount: true, currency: true, date: true, merchantName: true, description: true, pending: true },
    }),
  ]);
  const confirmedTransactionIds = new Set(confirmedRows.flatMap((r) => [r.chargeTransactionId, r.reversalTransactionId]));

  const events: ReversalCandidateEvent[] = transactions
    .filter((t) => !confirmedTransactionIds.has(t.id))
    .map((t) => ({
      id: t.id,
      accountId: t.accountId,
      amount: Number(t.amount),
      currency: t.currency,
      date: t.date,
      merchantKey: normalizeMerchantKey(t.merchantName ?? t.description) || null,
      pending: t.pending,
    }));
  const eventById = new Map(events.map((e) => [e.id, e]));

  const results = matchReversals(events);
  // matchReversals returns an unordered {aId, bId} pair with no directional
  // info -- the negative (money-out) side is always the charge, assigned
  // here from the real amount sign, not from result order.
  const matches = results.map((r) => {
    const a = eventById.get(r.aId)!;
    const b = eventById.get(r.bId)!;
    const [charge, reversal] = a.amount < 0 ? [a, b] : [b, a];
    return {
      chargeTransactionId: charge.id,
      reversalTransactionId: reversal.id,
      confidenceScore: r.confidenceScore,
      daysApart: r.daysApart,
    };
  });

  const plan = planReversalCandidateSync(existingCandidates, matches);

  await Promise.all([
    ...plan.toCreate.map((m) =>
      prisma.reversalMatchCandidate.create({
        data: {
          userId,
          chargeTransactionId: m.chargeTransactionId,
          reversalTransactionId: m.reversalTransactionId,
          confidenceScore: m.confidenceScore,
          daysApart: m.daysApart,
          status: "pending",
        },
      })
    ),
    ...plan.toUpdate.map((u) =>
      prisma.reversalMatchCandidate.update({
        where: { id: u.id },
        data: { confidenceScore: u.confidenceScore, daysApart: u.daysApart },
      })
    ),
  ]);
  if (plan.stalePendingIds.length > 0) {
    await prisma.reversalMatchCandidate.deleteMany({ where: { id: { in: plan.stalePendingIds }, userId, status: "pending" } });
  }
}
