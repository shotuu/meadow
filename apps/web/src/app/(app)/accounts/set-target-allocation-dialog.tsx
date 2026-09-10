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
import { setTargetAllocation } from "./actions";

export function SetTargetAllocationDialog({
  bucketName,
  targetWeightPct,
  driftThresholdPct,
  triggerLabel,
}: {
  bucketName: string;
  targetWeightPct?: number;
  driftThresholdPct?: number;
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
            await setTargetAllocation(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Target allocation — {bucketName}</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="bucketName" value={bucketName} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetWeightPct">Target weight (%)</Label>
              <Input
                id="targetWeightPct"
                name="targetWeightPct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                defaultValue={targetWeightPct}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driftThresholdPct">Drift threshold (%)</Label>
              <Input
                id="driftThresholdPct"
                name="driftThresholdPct"
                type="number"
                step="0.1"
                min="0.1"
                defaultValue={driftThresholdPct ?? 5}
                required
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            You&apos;ll get an alert when this bucket drifts more than the threshold away from its target.
          </p>

          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
