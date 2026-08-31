import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

declare global {
  // eslint-disable-next-line no-var
  var __plaidClient: PlaidApi | undefined;
}

export function getPlaidClient(): PlaidApi {
  if (global.__plaidClient) return global.__plaidClient;

  const env = process.env.PLAID_ENV || "sandbox";
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set");
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  const client = new PlaidApi(configuration);
  global.__plaidClient = client;
  return client;
}

export class PlaidRequestError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "PlaidRequestError";
  }
}

type PlaidErrorBody = {
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
  request_id?: string;
};

/**
 * Every Plaid client call in this package must go through this. A raw
 * error thrown by the underlying Axios request carries the full HTTP
 * request on `.config`, headers included -- which means the Plaid secret
 * itself. That's not hypothetical: an uncaught one escaped createPlaidLinkToken
 * and got logged verbatim, secret and all, to Railway's production logs
 * during initial rollout (Next.js logs uncaught server-action errors by
 * default). This strips every Plaid call down to only the safe, useful
 * fields Plaid's own JSON error body provides before anything downstream
 * has a chance to log or serialize the original error.
 */
export async function callPlaid<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const data = (err as { response?: { data?: PlaidErrorBody } } | undefined)?.response?.data;
    if (data?.error_code) {
      throw new PlaidRequestError(
        data.display_message ?? data.error_message ?? data.error_code,
        data.error_code,
        data.request_id
      );
    }
    throw new PlaidRequestError(err instanceof Error ? err.message : "Plaid request failed");
  }
}
