"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";

/**
 * The finverse-oauth-callback route redirects here with ?finverse=success
 * or ?finverse=error (it's a plain Route Handler, not a page component, so
 * it can't show a toast itself). Reads the param once on mount, shows the
 * matching toast, then strips it from the URL.
 */
export function FinverseLinkStatus() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const result = searchParams.get("finverse");

  useEffect(() => {
    if (!result) return;
    if (result === "success") toast.success("Bank connected — syncing your accounts now.");
    else toast.error("Bank connection didn't go through — please try again.");

    const params = new URLSearchParams(searchParams.toString());
    params.delete("finverse");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
    // Only ever meant to fire once per landing on this URL with the param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  return null;
}
