"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createFinverseLinkUrl, linkFinverseConnection } from "@finance-app/finverse-sync";
import { requireUserId } from "@/lib/session";

function redirectUri(): string {
  if (!process.env.AUTH_URL) throw new Error("AUTH_URL must be set");
  return `${process.env.AUTH_URL}/finverse-oauth-callback`;
}

/**
 * Returns the Finverse-hosted Link URL to redirect the browser to. Unlike
 * Plaid's embedded widget, Finverse Link is a full page the user is
 * redirected to and back from -- see finverse-oauth-callback/route.ts.
 */
export async function startFinverseLink(): Promise<string> {
  const userId = await requireUserId();
  return createFinverseLinkUrl(userId, redirectUri(), randomUUID());
}

export async function completeFinverseLink(code: string) {
  const userId = await requireUserId();
  const { sync } = await linkFinverseConnection(userId, code, redirectUri());

  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");

  return sync;
}
