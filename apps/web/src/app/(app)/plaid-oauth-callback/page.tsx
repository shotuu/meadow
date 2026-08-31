"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { usePlaidLinkCompletion, PLAID_LINK_TOKEN_STORAGE_KEY } from "../accounts/use-plaid-link-completion";

const noopSubscribe = () => () => {};

/**
 * Only reached mid-flow, redirected here by Plaid after the user
 * authenticates at an OAuth institution's own site (e.g. Chase, BofA) --
 * see createPlaidLinkToken's redirect_uri and Plaid's OAuth Link guide.
 * Not linked from anywhere in the app's own nav.
 */
export default function PlaidOAuthCallbackPage() {
  const router = useRouter();
  // Reads localStorage synchronously post-hydration rather than via a
  // useEffect + setState (this repo's lint config disallows that pattern,
  // same reasoning as providers.tsx's useHasMounted).
  const linkToken = useSyncExternalStore(
    noopSubscribe,
    () => window.localStorage.getItem(PLAID_LINK_TOKEN_STORAGE_KEY),
    () => null
  );

  const onDone = usePlaidLinkCompletion(() => {
    window.localStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
    router.replace("/accounts");
  });

  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: typeof window === "undefined" ? undefined : window.location.href,
    onSuccess: onDone,
    onExit: () => {
      window.localStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
      router.replace("/accounts");
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 p-6 text-center">
      <p className="text-muted-foreground">
        {linkToken === null
          ? "Something went wrong resuming your bank connection — please try connecting again from Accounts."
          : "Finishing bank connection…"}
      </p>
    </div>
  );
}
