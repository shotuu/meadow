import { prisma } from "@finance-app/db";
import { decryptSecret } from "@finance-app/crypto";
import { getFinverseLoginIdentityApi, callFinverse } from "./client";

/**
 * Revokes Finverse's access for every connection a user has (calling
 * deleteLoginIdentity so Finverse itself invalidates the login identity,
 * not just deleting our copy of the token) and removes the
 * FinverseConnection rows. Mirrors packages/plaid-sync/src/unlink.ts's
 * removeAllPlaidItems.
 */
export async function removeAllFinverseConnections(userId: string): Promise<void> {
  const connections = await prisma.finverseConnection.findMany({ where: { userId } });

  for (const connection of connections) {
    try {
      const api = getFinverseLoginIdentityApi(decryptSecret(connection.accessToken));
      await callFinverse(() => api.deleteLoginIdentity());
    } catch (err) {
      // Still remove our record even if Finverse's side fails (e.g.
      // already unlinked) -- an orphaned local row is worse than a
      // redundant call, same reasoning as removeAllPlaidItems.
      console.error(`[finverse-sync] deleteLoginIdentity failed for connection ${connection.id}`, err);
    }
  }

  await prisma.finverseConnection.deleteMany({ where: { userId } });
}
