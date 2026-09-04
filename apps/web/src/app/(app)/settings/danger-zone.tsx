"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAllMyData } from "./actions";

const CONFIRM_PHRASE = "DELETE";

export function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteAllMyData();
      router.push("/sign-in");
    } catch {
      toast.error("Something went wrong deleting your data. Nothing was removed — try again.");
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">Delete all my data</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete all my data</DialogTitle>
          <DialogDescription>
            This permanently deletes every account, transaction, budget, category, and
            categorization rule tied to your Meadow account, and revokes Meadow&apos;s access to
            any bank you&apos;ve connected via Plaid or a Singapore bank. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="confirm">
            Type <span className="font-semibold">{CONFIRM_PHRASE}</span> to confirm
          </Label>
          <Input
            id="confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={confirmText !== CONFIRM_PHRASE || deleting}
            onClick={handleDelete}
          >
            {deleting ? "Deleting…" : "Permanently delete everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
