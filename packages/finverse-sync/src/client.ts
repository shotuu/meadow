import { Configuration, PublicApi, LinkApi, LoginIdentityApi } from "@finverse/sdk-typescript";

const DEFAULT_BASE_PATH = "https://api.prod.finverse.net";

function getBasePath(): string {
  return process.env.FINVERSE_BASE_URL || DEFAULT_BASE_PATH;
}

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.FINVERSE_CLIENT_ID;
  const clientSecret = process.env.FINVERSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("FINVERSE_CLIENT_ID and FINVERSE_CLIENT_SECRET must be set");
  }
  return { clientId, clientSecret };
}

declare global {
  // eslint-disable-next-line no-var
  var __finverseCustomerToken: { token: string; expiresAt: number } | undefined;
}

/**
 * The app-level (not per-user) client-credentials bearer token that
 * authenticates link-token generation. Cached in memory and refreshed
 * before expiry (expires_in minus a 60s safety buffer, per Finverse's own
 * documented advice) rather than fetched on every call.
 */
async function getCustomerAccessToken(): Promise<string> {
  const cached = global.__finverseCustomerToken;
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const { clientId, clientSecret } = getCredentials();
  const configuration = new Configuration({ basePath: getBasePath() });
  const response = await callFinverse(() =>
    new PublicApi(configuration).generateCustomerAccessToken({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    })
  );

  const { access_token: token, expires_in: expiresIn } = response.data;
  global.__finverseCustomerToken = {
    token,
    expiresAt: Date.now() + (Number(expiresIn) - 60) * 1000,
  };
  return token;
}

/** A LinkApi client authenticated with the app-level customer token. */
export async function getFinverseLinkApi(): Promise<LinkApi> {
  const accessToken = await getCustomerAccessToken();
  return new LinkApi(new Configuration({ basePath: getBasePath(), accessToken }));
}

/**
 * A LoginIdentityApi client authenticated with one user's own
 * login-identity access token (not the app-level customer token) -- every
 * data call is scoped to whichever FinverseConnection the caller decrypted
 * this token from.
 */
export function getFinverseLoginIdentityApi(loginIdentityAccessToken: string): LoginIdentityApi {
  return new LoginIdentityApi(
    new Configuration({ basePath: getBasePath(), accessToken: loginIdentityAccessToken })
  );
}

export function getFinverseClientId(): string {
  return getCredentials().clientId;
}

export class FinverseRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "FinverseRequestError";
  }
}

type FinverseErrorBody = {
  message?: string;
  error?: string;
  error_description?: string;
};

/**
 * Every Finverse client call in this package must go through this. Mirrors
 * packages/plaid-sync/src/client.ts's callPlaid() -- an uncaught Axios
 * error carries the full HTTP request on `.config`, headers included,
 * which means FINVERSE_CLIENT_SECRET itself. That's a real, previously
 * confirmed failure mode in this project (the Plaid secret leaked to
 * production logs the same way), so it's stripped down to only the safe
 * fields before anything downstream has a chance to log or serialize the
 * original error.
 */
export async function callFinverse<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const response = (err as { response?: { status?: number; data?: FinverseErrorBody } } | undefined)?.response;
    if (response?.data) {
      throw new FinverseRequestError(
        response.data.error_description ?? response.data.message ?? response.data.error ?? "Finverse request failed",
        response.status
      );
    }
    throw new FinverseRequestError(err instanceof Error ? err.message : "Finverse request failed");
  }
}
