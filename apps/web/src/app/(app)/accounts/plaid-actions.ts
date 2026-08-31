"use server";

import { revalidatePath } from "next/cache";
import { createPlaidLinkToken, linkPlaidItem } from "@finance-app/plaid-sync";
import { requireUserId } from "@/lib/session";

export async function createLinkToken(): Promise<string> {
  const userId = await requireUserId();
  // AUTH_URL is already this app's canonical base URL (Auth.js relies on
  // it too) -- reused here instead of a second env var. Must exactly match
  // an entry in the Plaid Dashboard's Allowed redirect URIs list.
  const redirectUri = process.env.AUTH_URL ? `${process.env.AUTH_URL}/plaid-oauth-callback` : undefined;
  return createPlaidLinkToken(userId, redirectUri);
}

export async function completePlaidLink(publicToken: string, institutionName: string | null) {
  const userId = await requireUserId();
  const { sync } = await linkPlaidItem(userId, publicToken, institutionName);

  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");

  return sync;
}
