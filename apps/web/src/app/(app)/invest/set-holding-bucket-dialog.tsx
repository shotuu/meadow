"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setHoldingBucket } from "./actions";

export function SetHoldingBucketDialog({
  symbol,
  currentBucketName,
  triggerLabel,
}: {
  symbol: string;
  currentBucketName: string;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await setHoldingBucket(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Strategy bucket — {symbol}</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="symbol" value={symbol} />

          <div className="space-y-2">
            <Label htmlFor="bucketName">Bucket name</Label>
            <Input
              id="bucketName"
              name="bucketName"
              placeholder="e.g. Core, Satellite, Gold"
              defaultValue={currentBucketName}
              required
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Overrides the automatic security-type label for this symbol everywhere allocation is
            shown or checked for drift.
          </p>

          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
