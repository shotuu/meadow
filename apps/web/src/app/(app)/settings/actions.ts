"use server";

import { prisma } from "@finance-app/db";
import { removeAllPlaidItems } from "@finance-app/plaid-sync";
import { removeAllFinverseConnections } from "@finance-app/finverse-sync";
import { requireUserId } from "@/lib/session";

/**
 * Full account deletion. Revokes Plaid's and Finverse's access first —
 * once the PlaidItem/FinverseConnection rows are gone (via the User
 * cascade below) the tokens needed to call their revoke endpoints are gone
 * too, so revocation has to happen before the delete, not after. IBKR has
 * no analogous revoke endpoint to call (a Flex Web Service token can only
 * be deactivated by the user themselves in IBKR's own Account Management
 * UI), so IbkrFlexConfig rows are only ever removed via the cascade below.
 *
 * Every AppUser-scoped table (transactions, accounts, budgets, categories,
 * categorization rules, etc. — see packages/db/prisma/schema.prisma)
 * cascades from AppUser.id, which itself cascades from this User row, so
 * one delete removes all of it along with the session and OAuth account
 * link. The now-deleted session means the caller's next request is
 * correctly treated as signed out — no separate signOut() call needed.
 */
export async function deleteAllMyData(): Promise<void> {
  const userId = await requireUserId();

  await removeAllPlaidItems(userId);
  await removeAllFinverseConnections(userId);
  await prisma.user.delete({ where: { id: userId } });
}
