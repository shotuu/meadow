"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PlaidLinkOnSuccess } from "react-plaid-link";
import { completePlaidLink } from "./plaid-actions";

// The link_token must survive the browser navigating away to the bank's own
// OAuth page and back (for OAuth institutions) -- localStorage is the only
// option that reliably does, per Plaid's own OAuth integration guide.
export const PLAID_LINK_TOKEN_STORAGE_KEY = "meadow.plaidLinkToken";

export function usePlaidLinkCompletion(onDone: () => void): PlaidLinkOnSuccess {
  const router = useRouter();
  return useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      await completePlaidLink(publicToken, metadata.institution?.name ?? null);
      router.refresh();
      onDone();
    },
    [router, onDone]
  );
}
