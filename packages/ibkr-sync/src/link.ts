import { prisma } from "@finance-app/db";
import { encryptSecret } from "@finance-app/crypto";
import { syncIbkrFlexConfig, type SyncResult } from "./sync";

/**
 * Creates the IbkrFlexConfig row for an already-created brokerage
 * FinancialAccount (encrypting the Flex token before it's stored — it's a
 * standing credential to the account, same class of secret as a Plaid
 * access token), then runs an immediate sync so holdings/transactions show
 * up right away instead of waiting for the nightly worker job.
 */
export async function linkIbkrFlexConfig(
  userId: string,
  accountId: string,
  flexToken: string,
  flexQueryId: string
): Promise<{ configId: string; sync: SyncResult }> {
  const config = await prisma.ibkrFlexConfig.create({
    data: { userId, accountId, flexToken: encryptSecret(flexToken), flexQueryId },
  });

  const sync = await syncIbkrFlexConfig(config.id);

  return { configId: config.id, sync };
}
