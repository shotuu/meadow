"use server";

import { revalidatePath } from "next/cache";
import { prisma, type AlertRuleType } from "@finance-app/db";
import { requireUserId } from "@/lib/session";

export async function createAlertRule(formData: FormData) {
  const userId = await requireUserId();
  const ruleType = String(formData.get("ruleType") || "") as AlertRuleType;
  const accountId = String(formData.get("accountId") || "") || null;
  const categoryId = String(formData.get("categoryId") || "") || null;
  const valueRaw = formData.get("value");
  const value = valueRaw !== null && valueRaw !== "" ? Number(valueRaw) : undefined;

  if (!ruleType) throw new Error("Rule type is required");

  let config: Record<string, number> = {};
  switch (ruleType) {
    case "budget_over_target":
      config = { thresholdPct: value ?? 100 };
      break;
    case "low_balance":
    case "emergency_fund_below_floor":
      config = { floor: value ?? 0 };
      break;
    case "large_transaction":
      config = { threshold: value ?? 0 };
      break;
    case "sinking_fund_underfunded":
      config = { warningPeriods: value ?? 1 };
      break;
    default:
      config = {};
  }

  await prisma.alertRule.create({
    data: { userId, ruleType, config, accountId, categoryId },
  });

  revalidatePath("/alerts");
}

export async function toggleAlertRule(ruleId: string, isActive: boolean) {
  const userId = await requireUserId();
  await prisma.alertRule.updateMany({ where: { id: ruleId, userId }, data: { isActive } });
  revalidatePath("/alerts");
}

export async function deleteAlertRule(ruleId: string) {
  const userId = await requireUserId();
  await prisma.alertRule.deleteMany({ where: { id: ruleId, userId } });
  revalidatePath("/alerts");
}

export async function acknowledgeAlert(eventId: string) {
  const userId = await requireUserId();
  await prisma.alertEvent.updateMany({
    where: { id: eventId, userId },
    data: { acknowledgedAt: new Date() },
  });
  revalidatePath("/alerts");
}

export async function resolveAlert(eventId: string) {
  const userId = await requireUserId();
  await prisma.alertEvent.updateMany({
    where: { id: eventId, userId },
    data: { resolvedAt: new Date() },
  });
  revalidatePath("/alerts");
}
