"use server";

import { revalidatePath } from "next/cache";
import { prisma, AccountType, AccountClassification, SyncSource } from "@finance-app/db";
import { requireUserId } from "@/lib/session";

const LIABILITY_TYPES: AccountType[] = ["credit_card", "loan"];

function classificationForType(type: AccountType): AccountClassification {
  return LIABILITY_TYPES.includes(type) ? "liability" : "asset";
}

export async function createAccount(formData: FormData) {
  const userId = await requireUserId();

  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "checking") as AccountType;
  const currency = String(formData.get("currency") || "USD")
    .trim()
    .toUpperCase();
  const institutionName = String(formData.get("institutionName") || "").trim() || null;
  const syncSource = String(formData.get("syncSource") || "manual") as SyncSource;

  if (!name) throw new Error("Account name is required");

  await prisma.financialAccount.create({
    data: {
      userId,
      name,
      type,
      classification: classificationForType(type),
      currency,
      institutionName,
      syncSource,
    },
  });

  revalidatePath("/accounts");
}

export async function archiveAccount(accountId: string) {
  const userId = await requireUserId();

  await prisma.financialAccount.updateMany({
    where: { id: accountId, userId },
    data: { isArchived: true },
  });

  revalidatePath("/accounts");
}

export async function setTargetAllocation(formData: FormData) {
  const userId = await requireUserId();

  const bucketName = String(formData.get("bucketName") || "").trim();
  const targetWeightPct = Number(formData.get("targetWeightPct"));
  const driftThresholdPct = Number(formData.get("driftThresholdPct"));

  if (!bucketName) throw new Error("Bucket name is required");
  if (!Number.isFinite(targetWeightPct) || targetWeightPct < 0 || targetWeightPct > 100) {
    throw new Error("Target weight must be between 0 and 100");
  }
  if (!Number.isFinite(driftThresholdPct) || driftThresholdPct <= 0) {
    throw new Error("Drift threshold must be a positive number");
  }

  await prisma.targetAllocation.upsert({
    where: { userId_bucketName: { userId, bucketName } },
    create: { userId, bucketName, targetWeightPct, driftThresholdPct },
    update: { targetWeightPct, driftThresholdPct },
  });

  revalidatePath("/accounts");
}

export async function deleteTargetAllocation(bucketName: string) {
  const userId = await requireUserId();

  await prisma.targetAllocation.deleteMany({ where: { userId, bucketName } });

  revalidatePath("/accounts");
}

export async function unarchiveAccount(accountId: string) {
  const userId = await requireUserId();

  await prisma.financialAccount.updateMany({
    where: { id: accountId, userId },
    data: { isArchived: false },
  });

  revalidatePath("/accounts");
}

export async function setHoldingBucket(formData: FormData) {
  const userId = await requireUserId();

  const symbol = String(formData.get("symbol") || "").trim();
  const bucketName = String(formData.get("bucketName") || "").trim();

  if (!symbol) throw new Error("Symbol is required");
  if (!bucketName) throw new Error("Bucket name is required");

  await prisma.holdingBucketAssignment.upsert({
    where: { userId_symbol: { userId, symbol } },
    create: { userId, symbol, bucketName, assignedBy: "user" },
    update: { bucketName, assignedBy: "user" },
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/holdings/${encodeURIComponent(symbol)}`);
}

export async function removeHoldingBucket(symbol: string) {
  const userId = await requireUserId();

  await prisma.holdingBucketAssignment.deleteMany({ where: { userId, symbol } });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/holdings/${encodeURIComponent(symbol)}`);
}
