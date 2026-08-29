"use server";

import { revalidatePath } from "next/cache";
import { createPlaidLinkToken, linkPlaidItem } from "@finance-app/plaid-sync";
import { requireUserId } from "@/lib/session";

export async function createLinkToken(): Promise<string> {
  const userId = await requireUserId();
  return createPlaidLinkToken(userId);
}

export async function completePlaidLink(publicToken: string, institutionName: string | null) {
  const userId = await requireUserId();
  const { sync } = await linkPlaidItem(userId, publicToken, institutionName);

  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");

  return sync;
}
