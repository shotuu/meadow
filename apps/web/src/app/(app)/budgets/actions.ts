"use server";

import { revalidatePath } from "next/cache";
import { prisma, BudgetPeriod, SinkingFundRecurrence } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { getPeriodRange } from "@finance-app/finance-logic";

export async function setBudget(formData: FormData) {
  const userId = await requireUserId();

  const categoryId = String(formData.get("categoryId") || "");
  const amount = Number(formData.get("amount"));
  const currency = String(formData.get("currency") || "USD").toUpperCase();
  const period = String(formData.get("period") || "monthly") as BudgetPeriod;
  const rolloverEnabled = formData.get("rolloverEnabled") === "on";
  const rolloverCapRaw = formData.get("rolloverCap");
  const rolloverCap = rolloverCapRaw ? Number(rolloverCapRaw) : null;

  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be positive");

  await prisma.category.findFirstOrThrow({ where: { id: categoryId, userId } });

  if (!Object.values(BudgetPeriod).includes(period)) throw new Error("Invalid budget period");
  const today = getPeriodRange(period, new Date()).start;
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  if (!Object.values(BudgetPeriod).includes(period)) throw new Error("Invalid budget period");
  if (rolloverCap !== null && (!Number.isFinite(rolloverCap) || rolloverCap < 0)) throw new Error("Invalid rollover cap");
  await prisma.$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM app.categories WHERE id = ${categoryId} AND user_id = ${userId} FOR UPDATE`;
    const active = await db.budget.findFirst({ where: { categoryId, userId, effectiveTo: null } });
    if (active && (active.period !== period || active.currency !== currency)) {
      throw new Error("Keep the existing budget period and currency to preserve its history");
    }
    const data = { amount, currency, period, rolloverEnabled, rolloverCap };
    if (active && active.effectiveFrom.getTime() === today.getTime()) {
      await db.budget.update({ where: { id: active.id }, data });
    } else {
      await db.budget.updateMany({ where: { categoryId, userId, effectiveTo: null }, data: { effectiveTo: yesterday } });
      await db.budget.create({ data: { userId, categoryId, ...data, effectiveFrom: today } });
    }
  });

  revalidatePath("/budgets");
}

export async function setPrepaidCoverage(formData: FormData) {
  const userId = await requireUserId();

  const categoryId = String(formData.get("categoryId") || "");
  const coverageMonths = Number(formData.get("coverageMonths"));

  if (!Number.isInteger(coverageMonths) || coverageMonths <= 0) {
    throw new Error("Coverage length must be a positive whole number of months");
  }

  await prisma.category.findFirstOrThrow({ where: { id: categoryId, userId } });

  await prisma.prepaidCoverage.upsert({
    where: { categoryId },
    create: { userId, categoryId, coverageMonths },
    update: { coverageMonths },
  });

  revalidatePath("/budgets");
}

export async function addSinkingFund(formData: FormData) {
  const userId = await requireUserId();

  const categoryId = String(formData.get("categoryId") || "");
  const name = String(formData.get("name") || "").trim();
  const targetAmount = Number(formData.get("targetAmount"));
  const currency = String(formData.get("currency") || "USD").toUpperCase();
  const deadlineDate = new Date(String(formData.get("deadlineDate")));
  const recurrence = String(formData.get("recurrence") || "one_time") as SinkingFundRecurrence;

  if (!name) throw new Error("Name is required");
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) throw new Error("Target amount must be positive");
  if (Number.isNaN(deadlineDate.getTime())) throw new Error("Deadline is required");

  await prisma.category.findFirstOrThrow({ where: { id: categoryId, userId } });

  await prisma.sinkingFund.create({
    data: { userId, categoryId, name, targetAmount, currency, deadlineDate, recurrence },
  });

  revalidatePath("/budgets");
}

export async function contributeSinkingFund(formData: FormData) {
  const userId = await requireUserId();

  const sinkingFundId = String(formData.get("sinkingFundId") || "");
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Amount must be non-zero");

  const fund = await prisma.sinkingFund.findFirstOrThrow({ where: { id: sinkingFundId, userId } });

  await prisma.$transaction([
    prisma.sinkingFund.update({
      where: { id: fund.id },
      data: { currentBalance: { increment: amount } },
    }),
    prisma.sinkingFundContribution.create({
      data: { sinkingFundId: fund.id, amount, date: new Date() },
    }),
  ]);

  revalidatePath("/budgets");
}
