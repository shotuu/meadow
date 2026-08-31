"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@finance-app/db";
import { syncPlaidItem } from "@finance-app/plaid-sync";
import { syncIbkrFlexConfig } from "@finance-app/ibkr-sync";
import { runCategorizationBatchForUser } from "@finance-app/categorization-ai";
import { requireUserId } from "@/lib/session";

export interface SyncNowResult {
  syncedCount: number;
  errors: string[];
}

/**
 * Triggers an on-demand sync of every active Plaid item and IBKR config for
 * the current user, then the AI categorization batch -- the only other
 * triggers for any of this are link time and the worker's nightly cron,
 * which can leave a stale balance/transaction list (and uncategorized
 * transactions) for up to a day. One item/config failing (e.g. a revoked
 * bank connection) doesn't stop the rest, mirroring
 * apps/worker/src/jobs/index.ts's per-item try/catch pattern.
 */
export async function syncAllAccounts(): Promise<SyncNowResult> {
  const userId = await requireUserId();

  const [plaidItems, ibkrConfigs] = await Promise.all([
    prisma.plaidItem.findMany({ where: { userId, status: "active" } }),
    prisma.ibkrFlexConfig.findMany({ where: { userId, status: "active" } }),
  ]);

  let syncedCount = 0;
  const errors: string[] = [];

  for (const item of plaidItems) {
    try {
      await syncPlaidItem(item.id);
      syncedCount++;
    } catch (err) {
      errors.push(`${item.institutionName ?? "Bank"}: ${err instanceof Error ? err.message : "sync failed"}`);
    }
  }

  for (const config of ibkrConfigs) {
    try {
      await syncIbkrFlexConfig(config.id);
      syncedCount++;
    } catch (err) {
      errors.push(`IBKR: ${err instanceof Error ? err.message : "sync failed"}`);
    }
  }

  // This otherwise only ever runs on the worker's nightly cron -- freshly
  // synced transactions (e.g. a bank connected mid-day) would sit
  // uncategorized for up to a day with no way to see the AI pass actually
  // work. A no-op if there's nothing uncategorized.
  try {
    await runCategorizationBatchForUser(userId);
  } catch (err) {
    errors.push(`Categorization: ${err instanceof Error ? err.message : "failed"}`);
  }

  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");

  return { syncedCount, errors };
}
