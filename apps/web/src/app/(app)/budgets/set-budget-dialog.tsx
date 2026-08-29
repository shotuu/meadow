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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setBudget } from "./actions";

export function SetBudgetDialog({
  categoryId,
  categoryName,
  defaultCurrency,
  rollover,
  triggerLabel,
}: {
  categoryId: string;
  categoryName: string;
  defaultCurrency: string;
  rollover: boolean;
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
            await setBudget(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Set budget — {categoryName}</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="categoryId" value={categoryId} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" name="currency" defaultValue={defaultCurrency} maxLength={3} className="uppercase" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="period">Period</Label>
            <Select name="period" defaultValue="monthly">
              <SelectTrigger id="period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rollover && (
            <>
              <input type="hidden" name="rolloverEnabled" value="on" />
              <div className="space-y-2">
                <Label htmlFor="rolloverCap">Rollover cap (optional — max surplus carried forward)</Label>
                <Input id="rolloverCap" name="rolloverCap" type="number" step="0.01" min="0" />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
