import { prisma } from "@finance-app/db";
import { getPlaidClient, callPlaid } from "./client";
import { upsertPlaidAccounts } from "./accounts";
import { applyCategorizationRules } from "./categorize";
import { decryptSecret } from "@finance-app/crypto";

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
}

/**
 * Pulls everything new since the PlaidItem's stored cursor via
 * /transactions/sync, paging through has_more, and persists the delta.
 * Plaid signs amounts opposite to this schema (positive = money out for
 * Plaid; negative = money out here), so amounts are negated on the way in.
 */
export async function syncPlaidItem(plaidItemId: string): Promise<SyncResult> {
  const item = await prisma.plaidItem.findUniqueOrThrow({ where: { id: plaidItemId } });
  const client = getPlaidClient();
  const accessToken = decryptSecret(item.accessToken);

  let cursor = item.cursor ?? undefined;
  let hasMore = true;
  const result: SyncResult = { added: 0, modified: 0, removed: 0 };
  let accountIdByPlaidId: Map<string, string> | null = null;

  while (hasMore) {
    const response = await callPlaid(() =>
      client.transactionsSync({
        access_token: accessToken,
        cursor,
        count: 500,
      })
    );
    const data = response.data;

    if (!accountIdByPlaidId) {
      accountIdByPlaidId = await upsertPlaidAccounts(item.userId, data.accounts, item.institutionName);
    }

    for (const tx of data.added) {
      const accountId = accountIdByPlaidId.get(tx.account_id);
      if (!accountId) continue;

      const existing = await prisma.transaction.findUnique({
        where: { accountId_externalTransactionId: { accountId, externalTransactionId: tx.transaction_id } },
      });
      if (existing) continue;

      const merchantName = tx.merchant_name ?? null;
      const categoryId = await applyCategorizationRules(item.userId, merchantName, tx.name);

      await prisma.transaction.create({
        data: {
          userId: item.userId,
          accountId,
          amount: -tx.amount,
          currency: tx.iso_currency_code || "USD",
          description: tx.name,
          merchantName,
          date: new Date(tx.date),
          authorizedDate: tx.authorized_date ? new Date(tx.authorized_date) : null,
          pending: tx.pending,
          categoryId,
          categorySource: categoryId ? "rule" : "uncategorized",
          externalTransactionId: tx.transaction_id,
        },
      });
      result.added++;
    }

    for (const tx of data.modified) {
      const accountId = accountIdByPlaidId.get(tx.account_id);
      if (!accountId) continue;

      const updated = await prisma.transaction.updateMany({
        where: { accountId, externalTransactionId: tx.transaction_id },
        data: {
          amount: -tx.amount,
          description: tx.name,
          merchantName: tx.merchant_name ?? null,
          date: new Date(tx.date),
          authorizedDate: tx.authorized_date ? new Date(tx.authorized_date) : null,
          pending: tx.pending,
        },
      });
      result.modified += updated.count;
    }

    for (const removedTx of data.removed) {
      const accountId = accountIdByPlaidId.get(removedTx.account_id);
      if (!accountId || !removedTx.transaction_id) continue;

      const deleted = await prisma.transaction.deleteMany({
        where: { accountId, externalTransactionId: removedTx.transaction_id },
      });
      result.removed += deleted.count;
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  await prisma.plaidItem.update({
    where: { id: item.id },
    data: { cursor, lastSyncedAt: new Date() },
  });

  return result;
}
