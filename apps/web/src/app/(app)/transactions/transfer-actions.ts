"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";

/**
 * Confirms a suggested transfer match. Uses a conditional updateMany (WHERE
 * isTransfer = false) rather than this codebase's usual read-then-write
 * pattern, because this is the only mutation in the app maintaining a
 * two-row reciprocal invariant (Transaction.transferPairId). A naive
 * read-check-then-write has a real race: two overlapping candidates sharing
 * an anchor transaction (possible before either is resolved) could both
 * pass a pre-check before either commits, double-linking the anchor. The
 * conditional update's row-count check makes "is this still unreconciled"
 * atomic with the write itself.
 */
export async function confirmTransferMatch(candidateId: string) {
  const userId = await requireUserId();

  const candidate = await prisma.transferMatchCandidate.findFirstOrThrow({
    where: { id: candidateId, userId },
  });
  if (candidate.status !== "pending") {
    throw new Error("This suggestion has already been resolved");
  }

  if (candidate.counterpartType === "transaction") {
    const counterpart = await prisma.transaction.findFirstOrThrow({
      where: { id: candidate.counterpartId, userId },
    });

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.transferMatchCandidate.updateMany({
        where: { id: candidate.id, userId, status: "pending" }, data: { status: "confirmed", resolvedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("This suggestion has already been resolved");
      const [a, b] = await Promise.all([
        tx.transaction.updateMany({
          where: { id: candidate.transactionId, userId, isTransfer: false },
          data: { isTransfer: true, transferPairId: counterpart.id },
        }),
        tx.transaction.updateMany({
          where: { id: counterpart.id, userId, isTransfer: false },
          data: { isTransfer: true, transferPairId: candidate.transactionId },
        }),
      ]);
      if (a.count !== 1 || b.count !== 1) {
        throw new Error("One side of this transfer was already reconciled -- refresh and try again");
      }
      await tx.transferMatchCandidate.update({
        where: { id: candidate.id },
        data: { status: "confirmed", resolvedAt: new Date() },
      });
    });
  } else {
    const counterpart = await prisma.investmentTransaction.findFirstOrThrow({
      where: { id: candidate.counterpartId, account: { userId }, linkedFromTransaction: null },
    });

    // Transaction.linkedInvestmentTransactionId is @unique, so the database
    // itself is the final guard against two pending candidates racing to
    // link the same investment counterpart (the pre-transaction lookup
    // above can't see an in-flight commit from another request). Translate
    // that constraint violation into the same friendly message the
    // transaction/transaction branch above produces from its own atomic
    // recheck.
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.transferMatchCandidate.updateMany({
          where: { id: candidate.id, userId, status: "pending" }, data: { status: "confirmed", resolvedAt: new Date() },
        });
        if (claimed.count !== 1) throw new Error("This suggestion has already been resolved");
        const result = await tx.transaction.updateMany({
          where: { id: candidate.transactionId, userId, isTransfer: false },
          data: { isTransfer: true, linkedInvestmentTransactionId: counterpart.id },
        });
        if (result.count !== 1) {
          throw new Error("This transaction was already reconciled -- refresh and try again");
        }
        await tx.transferMatchCandidate.update({
          where: { id: candidate.id },
          data: { status: "confirmed", resolvedAt: new Date() },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new Error("This investment transaction was already reconciled by another transfer -- refresh and try again");
      }
      throw err;
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/accounts");
}

export async function dismissTransferMatch(candidateId: string) {
  const userId = await requireUserId();

  await prisma.transferMatchCandidate.updateMany({
    where: { id: candidateId, userId, status: "pending" },
    data: { status: "dismissed", resolvedAt: new Date() },
  });

  revalidatePath("/transactions");
}
