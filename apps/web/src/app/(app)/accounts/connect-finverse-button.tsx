"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startFinverseLink } from "./finverse-actions";

export function ConnectFinverseButton() {
  const [connecting, setConnecting] = useState(false);

  async function start() {
    setConnecting(true);
    try {
      const url = await startFinverseLink();
      // Finverse Link is a hosted page, not an embedded widget -- a plain
      // full-page redirect, no client library needed. The browser comes
      // back via finverse-oauth-callback once the user finishes there.
      window.location.href = url;
    } catch {
      toast.error("Couldn't start connecting a Singapore bank — please try again in a moment.");
      setConnecting(false);
    }
  }

  return (
    <Button variant="outline" onClick={start} disabled={connecting}>
      {connecting ? "Connecting…" : "Connect a Singapore bank"}
    </Button>
  );
}
