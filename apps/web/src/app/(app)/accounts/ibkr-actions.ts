"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@finance-app/db";
import { linkIbkrFlexConfig } from "@finance-app/ibkr-sync";
import { requireUserId } from "@/lib/session";

export async function connectIbkrAccount(formData: FormData) {
  const userId = await requireUserId();

  const name = String(formData.get("name") || "").trim();
  const currency = String(formData.get("currency") || "USD").trim().toUpperCase();
  const flexToken = String(formData.get("flexToken") || "").trim();
  const flexQueryId = String(formData.get("flexQueryId") || "").trim();

  if (!name) throw new Error("Account name is required");
  if (!flexToken) throw new Error("Flex Web Service token is required");
  if (!flexQueryId) throw new Error("Flex Query ID is required");

  const account = await prisma.financialAccount.create({
    data: {
      userId,
      name,
      type: "brokerage",
      classification: "asset",
      currency,
      syncSource: "ibkr_flex",
    },
  });

  await linkIbkrFlexConfig(userId, account.id, flexToken, flexQueryId);

  revalidatePath("/accounts");
}
