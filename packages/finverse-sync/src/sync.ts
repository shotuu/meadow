import { withAdvisoryLock, prisma } from "@finance-app/db";
import { decryptSecret } from "@finance-app/crypto";
import type { LoginIdentityApi } from "@finverse/sdk-typescript";
import { getFinverseLoginIdentityApi, callFinverse } from "./client";
import { upsertFinverseAccounts } from "./accounts";
import { applyCategorizationRules } from "./categorize";

export interface SyncResult {
  accounts: number;
  added: number;
}

const TRANSACTION_PAGE_SIZE = 500;
const MAX_STATUS_POLLS = 20;
const STATUS_POLL_DELAY_MS = 3000;
const TERMINAL_STATUSES = new Set(["DATA_RETRIEVAL_COMPLETE", "DATA_RETRIEVAL_PARTIALLY_SUCCESSFUL", "ERROR"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Finverse's data retrieval is asynchronous -- a login identity starts in
 * an in-progress state while Finverse pulls fresh data from the bank in
 * the background, so this polls getLoginIdentity() until a terminal
 * status rather than assuming the very next call already has fresh data.
 * Mirrors packages/ibkr-sync/src/client.ts's fetchFlexStatement retry loop
 * (same class of "external system needs a moment to generate the report"
 * problem), same bounded attempt count.
 */
async function waitForDataReady(api: LoginIdentityApi): Promise<void> {
  for (let attempt = 0; attempt < MAX_STATUS_POLLS; attempt++) {
    const response = await callFinverse(() => api.getLoginIdentity());
    const identity = response.data.login_identity;
    const status = identity?.status;
    if (status && TERMINAL_STATUSES.has(status)) {
      if (status === "ERROR") {
        throw new Error(`Finverse login identity data retrieval failed: ${identity?.error?.message ?? "unknown error"}`);
      }
      return;
    }
    await sleep(STATUS_POLL_DELAY_MS);
  }
  throw new Error("Finverse login identity: data retrieval did not complete in time");
}

/**
 * Triggers a fresh pull from the bank, waits for it to finish, then
 * upserts accounts and paginates every transaction for the login
 * identity. No stored cursor -- Finverse's transactions endpoint is
 * offset/limit paginated, not a delta feed like Plaid's
 * /transactions/sync -- so this pulls the full list every run and relies
 * on the existing accountId+externalTransactionId unique constraint
 * (same dedup mechanism CSV import already uses) to skip anything already
 * imported.
 */
export async function syncFinverseConnection(connectionId: string): Promise<SyncResult> {
  return withAdvisoryLock(`finverse-sync:${connectionId}`, () => syncUnlocked(connectionId));
}

async function syncUnlocked(connectionId: string): Promise<SyncResult> {
  const connection = await prisma.finverseConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const accessToken = decryptSecret(connection.accessToken);
  const api = getFinverseLoginIdentityApi(accessToken);

  await callFinverse(() => api.refreshLoginIdentity());
  await waitForDataReady(api);

  const accountsResponse = await callFinverse(() => api.listAccounts());
  const accountIdByFinverseId = await upsertFinverseAccounts(
    connection.userId,
    accountsResponse.data.accounts ?? [],
    connection.institutionName
  );

  const result: SyncResult = { accounts: accountIdByFinverseId.size, added: 0 };

  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const response = await callFinverse(() =>
      api.listTransactionsByLoginIdentityId(offset, TRANSACTION_PAGE_SIZE, true)
    );
    const transactions = response.data.transactions ?? [];
    total = response.data.total_transactions ?? transactions.length;
    if (transactions.length === 0) break;

    for (const tx of transactions) {
      const accountId = accountIdByFinverseId.get(tx.account_id);
      if (!accountId || tx.amount?.value == null || !tx.posted_date) continue;

      const existing = await prisma.transaction.findUnique({
        where: { accountId_externalTransactionId: { accountId, externalTransactionId: tx.transaction_id } },
      });
      const refreshed = {
        amount: tx.amount.value, currency: tx.amount.currency || "SGD",
        description: tx.description || tx.merchant_name || "Transaction",
        merchantName: tx.merchant_name ?? null, date: new Date(tx.posted_date), pending: tx.is_pending ?? false,
      };
      if (!Number.isFinite(Number(refreshed.amount)) || !Number.isFinite(refreshed.date.getTime())) {
        throw new Error("Invalid Finverse transaction amount or date");
      }
      if (existing) {
        // Unlike Plaid's delta feed, which only reports transactions that
        // actually changed, Finverse's full re-pull returns every
        // transaction every run. Only refresh a transaction still pending
        // in our own records (catching a real pending -> posted
        // transition, the same class of update Plaid's "modified" delta
        // covers) and never one already resolved as a transfer -- a
        // settled or transfer-reconciled row must not be silently
        // rewritten by a provider re-pull with no audit trail.
        if (existing.pending && !existing.isTransfer) {
          await prisma.transaction.update({ where: { id: existing.id }, data: refreshed });
        }
        continue;
      }

      const description = tx.description || tx.merchant_name || "Transaction";
      const merchantName = tx.merchant_name ?? null;
      const categoryId = await applyCategorizationRules(connection.userId, merchantName, description);

      await prisma.transaction.create({
        data: {
          userId: connection.userId,
          accountId,
          // Finverse's CurrencyAmount.value sign convention isn't
          // documented (unlike Plaid, which explicitly required negation)
          // -- stored as-is until confirmed against a real transaction,
          // flip this if a real expense comes through positive.
          amount: tx.amount.value,
          currency: tx.amount.currency || "SGD",
          description,
          merchantName,
          date: new Date(tx.posted_date),
          pending: tx.is_pending ?? false,
          categoryId,
          categorySource: categoryId ? "rule" : "uncategorized",
          externalTransactionId: tx.transaction_id,
        },
      });
      result.added++;
    }

    offset += transactions.length;
  }

  await prisma.finverseConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date() },
  });

  return result;
}
