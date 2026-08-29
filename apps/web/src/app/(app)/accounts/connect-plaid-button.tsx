"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import { createLinkToken, completePlaidLink } from "./plaid-actions";

export function ConnectPlaidButton() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "syncing">("idle");

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setStatus("syncing");
      await completePlaidLink(publicToken, metadata.institution?.name ?? null);
      setStatus("idle");
      setLinkToken(null);
      router.refresh();
    },
    [router]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => {
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
    setLinkToken(token);
  }

  return (
    <Button variant="outline" onClick={startLink} disabled={status !== "idle"}>
      {status === "syncing" ? "Syncing…" : status === "loading" ? "Connecting…" : "Connect a bank"}
    </Button>
  );
}
