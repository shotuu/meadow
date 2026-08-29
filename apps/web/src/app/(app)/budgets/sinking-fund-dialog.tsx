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
import { addSinkingFund, contributeSinkingFund } from "./actions";

export function AddSinkingFundDialog({
  categoryId,
  defaultCurrency,
}: {
  categoryId: string;
  defaultCurrency: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Add sinking fund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await addSinkingFund(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Add sinking fund</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="categoryId" value={categoryId} />

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. Car insurance renewal" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetAmount">Target amount</Label>
              <Input id="targetAmount" name="targetAmount" type="number" step="0.01" min="0.01" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" name="currency" defaultValue={defaultCurrency} maxLength={3} className="uppercase" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deadlineDate">Deadline</Label>
              <Input id="deadlineDate" name="deadlineDate" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence">Recurrence</Label>
              <Select name="recurrence" defaultValue="one_time">
                <SelectTrigger id="recurrence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="repeating">Repeating</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContributeForm({ sinkingFundId }: { sinkingFundId: string }) {
  return (
    <form action={contributeSinkingFund} className="flex items-center gap-2">
      <input type="hidden" name="sinkingFundId" value={sinkingFundId} />
      <Input name="amount" type="number" step="0.01" placeholder="Amount" className="w-28" required />
      <Button type="submit" size="sm" variant="secondary">
        Contribute
      </Button>
    </form>
  );
}
