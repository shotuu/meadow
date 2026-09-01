import { prisma, type RecurringCadence, type RecurringStatus } from "@finance-app/db";
import {
  detectRecurring,
  classifyConfidence,
  computeNextExpectedDate,
  isMissed,
  normalizeMerchantKey,
} from "@finance-app/finance-logic";

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [v, count] of counts) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

interface Occurrence {
  id: string;
  amount: number;
  currency: string;
  date: Date;
  categoryId: string | null;
}

/**
 * Groups every user's non-transfer, named-merchant transactions by
 * normalized merchant key, scores each group with
 * @finance-app/finance-logic's detectRecurring, and upserts RecurringSeries
 * rows — including lifecycle transitions (missed/resumed/cancelled/
 * amount_changed) logged as RecurringSeriesEvent rows, which nothing wrote
 * to before this.
 */
export async function recomputeRecurringSeriesForAllUsers(): Promise<void> {
  const userIds = await prisma.appUser.findMany({ select: { id: true } });
  for (const { id: userId } of userIds) {
    try {
      await recomputeRecurringSeriesForUser(userId);
    } catch (err) {
      console.error(`[worker] recomputeRecurringSeries: user ${userId} failed`, err);
    }
  }
}

async function recomputeRecurringSeriesForUser(userId: string): Promise<void> {
  const transactions = await prisma.transaction.findMany({
    where: { userId, isTransfer: false, merchantName: { not: null } },
    select: { id: true, merchantName: true, amount: true, currency: true, date: true, categoryId: true },
    orderBy: { date: "asc" },
  });

  const groups = new Map<string, Occurrence[]>();
  for (const tx of transactions) {
    const key = normalizeMerchantKey(tx.merchantName!);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push({ id: tx.id, amount: Number(tx.amount), currency: tx.currency, date: tx.date, categoryId: tx.categoryId });
    groups.set(key, group);
  }

  const existingSeries = await prisma.recurringSeries.findMany({ where: { userId } });
  const existingByKey = new Map(existingSeries.map((s) => [s.merchantKey, s]));
  const now = new Date();

  for (const [merchantKey, occurrences] of groups) {
    const existing = existingByKey.get(merchantKey);
    existingByKey.delete(merchantKey);

    const result = detectRecurring({
      occurrenceDates: occurrences.map((o) => o.date),
      amounts: occurrences.map((o) => o.amount),
    });
    const classification = result ? classifyConfidence(result.combinedConfidence) : "discard";

    if (!result || classification === "discard") {
      if (existing && existing.status !== "cancelled") {
        await prisma.$transaction([
          prisma.recurringSeries.update({ where: { id: existing.id }, data: { status: "cancelled" } }),
          prisma.recurringSeriesEvent.create({
            data: { recurringSeriesId: existing.id, eventType: "cancelled" },
          }),
        ]);
      }
      continue;
    }

    const signedAmounts = occurrences.map((o) => o.amount);
    const expectedAmount = median(signedAmounts);
    const lastSeenDate = occurrences[occurrences.length - 1].date;
    const cadence = result.cadence as RecurringCadence;
    const nextExpectedDate = computeNextExpectedDate(lastSeenDate, result.cadence);
    const currency = mostCommon(occurrences.map((o) => o.currency)) ?? occurrences[0].currency;
    const categoryId = mostCommon(occurrences.map((o) => o.categoryId).filter((c): c is string => c !== null)) ?? null;

    let status: RecurringStatus = "active";
    const events: Array<{ eventType: "amount_increased" | "amount_decreased" | "missed" | "resumed" }> = [];

    if (existing) {
      const tolerance = Number(existing.amountTolerancePct);
      const oldAmount = Number(existing.expectedAmount);
      const changeRatio = oldAmount === 0 ? 0 : Math.abs(expectedAmount - oldAmount) / Math.abs(oldAmount);
      if (changeRatio > tolerance) {
        events.push({ eventType: expectedAmount < oldAmount ? "amount_decreased" : "amount_increased" });
        status = "amount_changed";
      }
      if (existing.status === "missed") {
        events.push({ eventType: "resumed" });
      }
    }

    if (nextExpectedDate && isMissed(nextExpectedDate, result.cadence, now)) {
      status = "missed";
      if (!existing || existing.status !== "missed") {
        events.push({ eventType: "missed" });
      }
    }

    const series = await prisma.recurringSeries.upsert({
      where: { userId_merchantKey: { userId, merchantKey } },
      create: {
        userId,
        merchantKey,
        categoryId,
        cadence,
        expectedAmount,
        currency,
        lastSeenDate,
        nextExpectedDate,
        status,
        confidenceScore: result.combinedConfidence,
      },
      update: {
        categoryId,
        cadence,
        expectedAmount,
        currency,
        lastSeenDate,
        nextExpectedDate,
        status,
        confidenceScore: result.combinedConfidence,
      },
    });

    if (events.length > 0) {
      await prisma.recurringSeriesEvent.createMany({
        data: events.map((e) => ({
          recurringSeriesId: series.id,
          eventType: e.eventType,
          oldValue: existing ? String(existing.expectedAmount) : null,
          newValue: String(expectedAmount),
        })),
      });
    }

    const alreadyLinked = await prisma.recurringSeriesTransaction.findMany({
      where: { transactionId: { in: occurrences.map((o) => o.id) } },
      select: { transactionId: true },
    });
    const linkedIds = new Set(alreadyLinked.map((l) => l.transactionId));
    const toLink = occurrences.filter((o) => !linkedIds.has(o.id));
    if (toLink.length > 0) {
      await prisma.recurringSeriesTransaction.createMany({
        data: toLink.map((o) => ({ recurringSeriesId: series.id, transactionId: o.id })),
      });
    }
  }

  // Any series left in existingByKey had no matching transaction group this
  // run at all (e.g. the merchant name changed) — treat the same as a
  // discarded detection rather than leaving a stale "active" row forever.
  for (const stale of existingByKey.values()) {
    if (stale.status !== "cancelled") {
      await prisma.$transaction([
        prisma.recurringSeries.update({ where: { id: stale.id }, data: { status: "cancelled" } }),
        prisma.recurringSeriesEvent.create({
          data: { recurringSeriesId: stale.id, eventType: "cancelled" },
        }),
      ]);
    }
  }
}
