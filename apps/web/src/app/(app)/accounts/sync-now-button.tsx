"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { syncAllAccounts } from "./sync-actions";

export function SyncNowButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  async function handleClick() {
    setSyncing(true);
    try {
      const { syncedCount, errors } = await syncAllAccounts();
      if (syncedCount === 0 && errors.length === 0) {
        toast.info("No connected accounts to sync.");
      } else if (errors.length > 0) {
        toast.error(
          `Synced ${syncedCount}, ${errors.length} failed — ${errors.join("; ")}`
        );
      } else {
        toast.success(`Synced ${syncedCount} account${syncedCount === 1 ? "" : "s"}.`);
      }
      router.refresh();
    } catch {
      toast.error("Sync failed — please try again in a moment.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={syncing}>
      <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
      {syncing ? "Syncing…" : "Sync now"}
    </Button>
  );
}
