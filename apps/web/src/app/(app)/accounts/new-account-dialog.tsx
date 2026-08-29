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
import { createAccount } from "./actions";

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit card" },
  { value: "brokerage", label: "Brokerage" },
  { value: "cash", label: "Cash" },
  { value: "loan", label: "Loan" },
  { value: "other", label: "Other" },
];

const SYNC_SOURCES = [
  { value: "manual", label: "Manual entry" },
  { value: "csv", label: "CSV import" },
  { value: "ibkr_flex", label: "IBKR Flex Query (not yet connected)" },
];

export function NewAccountDialog({ defaultCurrency }: { defaultCurrency: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add account</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await createAccount(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Add account</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. Chase Checking" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select name="type" defaultValue="checking">
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="institutionName">Institution (optional)</Label>
            <Input id="institutionName" name="institutionName" placeholder="e.g. Chase" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="syncSource">How will transactions get in?</Label>
            <Select name="syncSource" defaultValue="manual">
              <SelectTrigger id="syncSource">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYNC_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="submit">Create account</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
