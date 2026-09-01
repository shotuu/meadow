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

export async function unarchiveAccount(accountId: string) {
  const userId = await requireUserId();

  await prisma.financialAccount.updateMany({
    where: { id: accountId, userId },
    data: { isArchived: false },
  });

  revalidatePath("/accounts");
}
