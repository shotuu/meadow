"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  type ObligationFrequency,
  type ObligationPriority,
  type IncomeConfidence,
} from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { advanceObligationDueDate } from "@finance-app/finance-logic";
import { revalidateHomeSurfaces } from "@/lib/revalidate";

export async function createObligation(formData: FormData) {
  const userId = await requireUserId();

  const name = String(formData.get("name") || "").trim();
  const amount = Number(formData.get("amount"));
  const currency = String(formData.get("currency") || "USD").toUpperCase();
  const frequency = String(formData.get("frequency") || "monthly") as ObligationFrequency;
  const nextDueDate = new Date(String(formData.get("nextDueDate")));
  const priority = String(formData.get("priority") || "planned") as ObligationPriority;
  const accountIdRaw = String(formData.get("accountId") || "");
  const accountId = accountIdRaw && accountIdRaw !== "__none__" ? accountIdRaw : null;

  if (!name) throw new Error("Name is required");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be positive");
  if (Number.isNaN(nextDueDate.getTime())) throw new Error("Next due date is required");

  if (accountId) {
    await prisma.financialAccount.findFirstOrThrow({ where: { id: accountId, userId } });
  }

  await prisma.obligation.create({
    data: { userId, name, amount, currency, frequency, nextDueDate, priority, accountId },
  });

  revalidatePath("/planning");
  revalidatePath("/plan");
  revalidateHomeSurfaces();
}

export async function markObligationPaid(formData: FormData) {
  const userId = await requireUserId();

  const obligationId = String(formData.get("obligationId") || "");
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Amount must be non-zero");

  await prisma.$transaction(async (db) => {
    // Lock before reading so concurrent payments evaluate the updated cycle.
    await db.$queryRaw`SELECT id FROM app.obligations WHERE id = ${obligationId} AND user_id = ${userId} FOR UPDATE`;
    const obligation = await db.obligation.findFirstOrThrow({ where: { id: obligationId, userId, isActive: true } });
    let fundedAmount = obligation.fundedAmount.add(amount);
    if (fundedAmount.isNegative()) throw new Error("Payment would make funding negative");
    let nextDueDate = obligation.nextDueDate;
    let isActive = true;
    while (fundedAmount.greaterThanOrEqualTo(obligation.amount)) {
      const next = advanceObligationDueDate(nextDueDate, obligation.frequency);
      if (next === null) { isActive = false; break; }
      fundedAmount = fundedAmount.sub(obligation.amount);
      nextDueDate = next;
    }
    await db.obligation.update({ where: { id: obligation.id }, data: { fundedAmount, nextDueDate, isActive } });
  });

  revalidatePath("/planning");
  revalidatePath("/plan");
  revalidateHomeSurfaces();
}

export async function createIncomeStream(formData: FormData) {
  const userId = await requireUserId();

  const name = String(formData.get("name") || "").trim();
  const currency = String(formData.get("currency") || "USD").toUpperCase();
  const frequency = String(formData.get("frequency") || "monthly") as ObligationFrequency;
  const grossAmount = Number(formData.get("grossAmount"));
  const netAmountRaw = formData.get("netAmount");
  const netAmount = netAmountRaw ? Number(netAmountRaw) : null;
  const nextExpectedDate = new Date(String(formData.get("nextExpectedDate")));
  const endDateRaw = formData.get("endDate");
  const endDate = endDateRaw ? new Date(String(endDateRaw)) : null;
  const confidence = String(formData.get("confidence") || "estimated") as IncomeConfidence;
  const accountIdRaw = String(formData.get("accountId") || "");
  const accountId = accountIdRaw && accountIdRaw !== "__none__" ? accountIdRaw : null;

  if (!name) throw new Error("Name is required");
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) throw new Error("Gross amount must be positive");
  if (Number.isNaN(nextExpectedDate.getTime())) throw new Error("Next expected date is required");

  if (accountId) {
    await prisma.financialAccount.findFirstOrThrow({ where: { id: accountId, userId } });
  }

  await prisma.incomeStream.create({
    data: {
      userId,
      name,
      currency,
      frequency,
      grossAmount,
      netAmount,
      nextExpectedDate,
      endDate,
      confidence,
      accountId,
    },
  });

  revalidatePath("/planning");
  revalidatePath("/plan");
}

export async function deactivateIncomeStream(incomeStreamId: string) {
  const userId = await requireUserId();

  await prisma.incomeStream.updateMany({
    where: { id: incomeStreamId, userId },
    data: { isActive: false },
  });

  revalidatePath("/planning");
  revalidatePath("/plan");
}

export async function setCashReserve(formData: FormData) {
  const userId = await requireUserId();

  const name = String(formData.get("name") || "").trim();
  const currency = String(formData.get("currency") || "USD").toUpperCase();
  const targetAmount = Number(formData.get("targetAmount"));
  const minimumAmountRaw = formData.get("minimumAmount");
  const minimumAmount = minimumAmountRaw ? Number(minimumAmountRaw) : null;
  const accountIdRaw = String(formData.get("accountId") || "");
  const accountId = accountIdRaw && accountIdRaw !== "__none__" ? accountIdRaw : null;

  if (!name) throw new Error("Name is required");
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) throw new Error("Target amount must be positive");

  if (accountId) {
    await prisma.financialAccount.findFirstOrThrow({ where: { id: accountId, userId } });
  }

  await prisma.cashReserve.create({
    data: { userId, name, currency, targetAmount, minimumAmount, accountId },
  });

  revalidatePath("/planning");
  revalidatePath("/plan");
  revalidateHomeSurfaces();
}

export async function deleteCashReserve(cashReserveId: string) {
  const userId = await requireUserId();

  await prisma.cashReserve.deleteMany({ where: { id: cashReserveId, userId } });

  revalidatePath("/planning");
  revalidatePath("/plan");
  revalidateHomeSurfaces();
}
