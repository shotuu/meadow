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
import { setPrepaidCoverage } from "./actions";

export function SetPrepaidCoverageDialog({
  categoryId,
  categoryName,
  coverageMonths,
  triggerLabel,
}: {
  categoryId: string;
  categoryName: string;
  coverageMonths?: number;
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
            await setPrepaidCoverage(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Prepaid coverage — {categoryName}</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="categoryId" value={categoryId} />

          <div className="space-y-2">
            <Label htmlFor="coverageMonths">Coverage length (months)</Label>
            <Input
              id="coverageMonths"
              name="coverageMonths"
              type="number"
              step="1"
              min="1"
              defaultValue={coverageMonths}
              required
            />
            <p className="text-sm text-muted-foreground">
              How many months a single payment covers — e.g. 6 for a car insurance premium paid
              twice a year, 3 for housing paid quarterly.
            </p>
          </div>

          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
