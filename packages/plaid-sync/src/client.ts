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
