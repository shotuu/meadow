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
import { createIncomeStream } from "./actions";

type Account = { id: string; name: string };

export function NewIncomeStreamDialog({
  accounts,
  defaultCurrency,
}: {
  accounts: Account[];
  defaultCurrency: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Add income stream
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await createIncomeStream(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Add income stream</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. Singapore salary" required />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="grossAmount">Gross amount</Label>
              <Input id="grossAmount" name="grossAmount" type="number" step="0.01" min="0.01" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="netAmount">Net amount (optional)</Label>
              <Input id="netAmount" name="netAmount" type="number" step="0.01" min="0" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                name="currency"
                defaultValue={defaultCurrency}
                maxLength={3}
                className="uppercase"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency</Label>
              <Select name="frequency" defaultValue="monthly">
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="semiannual">Semiannual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nextExpectedDate">Next expected date</Label>
              <Input id="nextExpectedDate" name="nextExpectedDate" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End date (optional)</Label>
              <Input id="endDate" name="endDate" type="date" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="confidence">Confidence</Label>
              <Select name="confidence" defaultValue="estimated">
                <SelectTrigger id="confidence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="estimated">Estimated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountId">Deposited to</Label>
              <Select name="accountId" defaultValue="__none__">
                <SelectTrigger id="accountId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
