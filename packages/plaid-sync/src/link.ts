import { prisma } from "@finance-app/db";
import { CountryCode, Products } from "plaid";
import { getPlaidClient, callPlaid } from "./client";
import { upsertPlaidAccounts } from "./accounts";
import { syncPlaidItem } from "./sync";
import { encryptSecret } from "@finance-app/crypto";

/**
 * `redirectUri` is required for OAuth institutions (many large US banks --
 * Chase, BofA, etc.) which redirect the browser away to the bank's own
 * OAuth page and back; non-OAuth institutions ignore it. Must be the bare
 * path with no query string, and must exactly match an entry in the Plaid
 * Dashboard's Allowed redirect URIs list or linkTokenCreate itself rejects
 * it -- see apps/web/src/app/(app)/plaid-oauth-callback/page.tsx, the page
 * that receives this redirect and resumes Link.
 */
export async function createPlaidLinkToken(userId: string, redirectUri?: string): Promise<string> {
  const client = getPlaidClient();
  const response = await callPlaid(() =>
    client.linkTokenCreate({
      client_name: "Meadow",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: userId },
      products: [Products.Transactions],
      // Default is 90 days if unset, and per Plaid's own docs this cannot
      // be changed later once Transactions has been added to an Item --
      // only takes effect for accounts connected from here on, not
      // already-linked ones. No extra-fee language anywhere in Plaid's
      // docs for this (unlike Asset Reports' explicit "Additional History"
      // fee), so this is free -- Transactions is billed per connected
      // Item, not per day of history.
      transactions: { days_requested: 730 },
      ...(redirectUri && { redirect_uri: redirectUri }),
    })
  );
  return response.data.link_token;
}

/**
 * Exchanges a Link `public_token` for a persisted access token, creates the
 * FinancialAccount rows for every account at the institution, then runs an
 * immediate sync so the user sees transactions right away instead of
 * waiting for the nightly worker job.
 */
export async function linkPlaidItem(
  userId: string,
  publicToken: string,
  institutionName: string | null
): Promise<{ plaidItemId: string; sync: Awaited<ReturnType<typeof syncPlaidItem>> }> {
  const client = getPlaidClient();

  const exchangeResponse = await callPlaid(() => client.itemPublicTokenExchange({ public_token: publicToken }));
  const { access_token: accessToken, item_id: plaidItemId } = exchangeResponse.data;

  const item = await prisma.plaidItem.create({
    data: { userId, plaidItemId, accessToken: encryptSecret(accessToken), institutionName },
  });

  const accountsResponse = await callPlaid(() => client.accountsGet({ access_token: accessToken }));
  await upsertPlaidAccounts(userId, accountsResponse.data.accounts, institutionName);

  const sync = await syncPlaidItem(item.id);

  return { plaidItemId: item.id, sync };
}
