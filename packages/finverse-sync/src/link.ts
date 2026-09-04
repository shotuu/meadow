import { prisma } from "@finance-app/db";
import { encryptSecret } from "@finance-app/crypto";
import { TokenGrantTypeEnum } from "@finverse/sdk-typescript";
import { getFinverseLinkApi, getFinverseLoginIdentityApi, getFinverseClientId, callFinverse } from "./client";
import { syncFinverseConnection, type SyncResult } from "./sync";

/**
 * Finverse Link is a hosted redirect page (link.prod.finverse.net), not an
 * embedded widget like Plaid Link -- the caller just navigates the browser
 * to the returned link_url. response_mode "form_post" (per Finverse's own
 * documented example) means the browser comes back via a POSTed form, not
 * a query string -- see the finverse-oauth-callback route handler, not a
 * page component reading searchParams.
 */
export async function createFinverseLinkUrl(userId: string, redirectUri: string, state: string): Promise<string> {
  const linkApi = await getFinverseLinkApi();
  const response = await callFinverse(() =>
    linkApi.generateLinkToken({
      client_id: getFinverseClientId(),
      user_id: userId,
      redirect_uri: redirectUri,
      state,
      ui_mode: "redirect",
      response_mode: "form_post",
      response_type: "code",
      grant_type: "client_credentials",
    })
  );
  return response.data.link_url;
}

/**
 * Exchanges the authorization code the callback received for a
 * login-identity-scoped access token, persists the connection (encrypted
 * token), then runs an immediate sync -- which itself triggers Finverse's
 * refresh + waits for data to be ready, so accounts/transactions show up
 * right away instead of waiting for the nightly worker job. Mirrors
 * plaid-sync's linkPlaidItem.
 */
export async function linkFinverseConnection(
  userId: string,
  code: string,
  redirectUri: string
): Promise<{ connectionId: string; sync: SyncResult }> {
  const linkApi = await getFinverseLinkApi();
  const clientId = getFinverseClientId();

  const tokenResponse = await callFinverse(() =>
    linkApi.token(TokenGrantTypeEnum.AuthorizationCode, code, clientId, redirectUri)
  );
  const loginIdentityAccessToken = tokenResponse.data.access_token;

  const dataApi = getFinverseLoginIdentityApi(loginIdentityAccessToken);
  const identityResponse = await callFinverse(() => dataApi.getLoginIdentity());
  const loginIdentity = identityResponse.data.login_identity;
  if (!loginIdentity) {
    throw new Error("Finverse: getLoginIdentity returned no login_identity after linking");
  }

  const connection = await prisma.finverseConnection.create({
    data: {
      userId,
      loginIdentityId: loginIdentity.login_identity_id,
      accessToken: encryptSecret(loginIdentityAccessToken),
      // Finverse's LoginIdentity only carries institution_id (a machine
      // id, e.g. likely "ocbc_sg"), not a ready-made display name -- shown
      // as-is rather than guessing a nicer label for institutions we
      // haven't seen real data from yet.
      institutionName: loginIdentity.institution_id ?? null,
    },
  });

  const sync = await syncFinverseConnection(connection.id);
  return { connectionId: connection.id, sync };
}
