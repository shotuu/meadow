"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";

/**
 * Confirms a suggested reversal pairing. Unlike confirmTransferMatch, this
 * never edits either Transaction row -- a reversal candidate is a
 * presentation/relationship layer over the existing ledger, not a
 * destructive rewrite of it, so there's no reciprocal Transaction field to
 * keep in sync. The one real invariant to protect is that a transaction
 * can't end up in two contradictory *active* reversal relationships: once
 * this pairing is confirmed, any other still-pending suggestion touching
 * either side is now moot (not a live alternative) and is auto-dismissed
 * in the same transaction, not left to accumulate.
 */
export async function confirmReversalMatch(candidateId: string) {
  const userId = await requireUserId();

  const candidate = await prisma.reversalMatchCandidate.findFirstOrThrow({
    where: { id: candidateId, userId },
  });
  if (candidate.status !== "pending") {
    throw new Error("This suggestion has already been resolved");
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.reversalMatchCandidate.updateMany({
      where: { id: candidate.id, userId, status: "pending" },
      data: { status: "confirmed", resolvedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error("This suggestion has already been resolved");

    await tx.reversalMatchCandidate.updateMany({
      where: {
        userId,
        status: "pending",
        id: { not: candidate.id },
        OR: [
          { chargeTransactionId: { in: [candidate.chargeTransactionId, candidate.reversalTransactionId] } },
          { reversalTransactionId: { in: [candidate.chargeTransactionId, candidate.reversalTransactionId] } },
        ],
      },
      data: { status: "dismissed", resolvedAt: new Date() },
    });
  });

  revalidatePath("/transactions");
  revalidatePath("/activity");
}

export async function dismissReversalMatch(candidateId: string) {
  const userId = await requireUserId();

  await prisma.reversalMatchCandidate.updateMany({
    where: { id: candidateId, userId, status: "pending" },
    data: { status: "dismissed", resolvedAt: new Date() },
  });

  revalidatePath("/transactions");
  revalidatePath("/activity");
}
