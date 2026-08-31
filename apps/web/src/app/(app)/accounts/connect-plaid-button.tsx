"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import { createLinkToken } from "./plaid-actions";
import { usePlaidLinkCompletion, PLAID_LINK_TOKEN_STORAGE_KEY } from "./use-plaid-link-completion";

export function ConnectPlaidButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "syncing">("idle");

  const complete = usePlaidLinkCompletion(() => {
    window.localStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
    setStatus("idle");
    setLinkToken(null);
  });

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (...args) => {
      setStatus("syncing");
      await complete(...args);
    },
    [complete]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => {
      window.localStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
      setStatus("idle");
      setLinkToken(null);
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function startLink() {
    setStatus("loading");
    const token = await createLinkToken();
    // Stored so the OAuth callback page can resume this same Link session
    // after the browser comes back from the bank's OAuth redirect --
    // non-OAuth institutions just never read it back.
    window.localStorage.setItem(PLAID_LINK_TOKEN_STORAGE_KEY, token);
    setLinkToken(token);
  }

  return (
    <Button variant="outline" onClick={startLink} disabled={status !== "idle"}>
      {status === "syncing" ? "Syncing…" : status === "loading" ? "Connecting…" : "Connect a bank"}
    </Button>
  );
}
