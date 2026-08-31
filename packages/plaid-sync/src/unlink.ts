import { prisma } from "@finance-app/db";
import { getPlaidClient, callPlaid } from "./client";
import { decryptSecret } from "@finance-app/crypto";

/**
 * Revokes Plaid's access to every linked institution for a user (calling
 * /item/remove so Plaid itself invalidates the access token, not just
 * deleting our copy of it) and removes the PlaidItem rows. Used by account
 * deletion — FinancialAccount/Transaction rows are deleted separately by
 * the caller since this package doesn't own those models.
 */
export async function removeAllPlaidItems(userId: string): Promise<void> {
  const items = await prisma.plaidItem.findMany({ where: { userId } });
  const client = getPlaidClient();

  for (const item of items) {
    try {
      await callPlaid(() => client.itemRemove({ access_token: decryptSecret(item.accessToken) }));
    } catch (err) {
      // Still remove our record even if Plaid's side fails (e.g. already
      // revoked) — an orphaned local row is worse than a redundant call.
      console.error(`[plaid-sync] itemRemove failed for PlaidItem ${item.id}`, err);
    }
  }

  await prisma.plaidItem.deleteMany({ where: { userId } });
}
