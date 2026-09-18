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
import { setCashReserve } from "./actions";

type Account = { id: string; name: string };

export function SetCashReserveDialog({
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
          Add reserve
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await setCashReserve(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Add cash reserve</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. Singapore emergency reserve" required />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="targetAmount">Target amount</Label>
              <Input id="targetAmount" name="targetAmount" type="number" step="0.01" min="0.01" required />
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="minimumAmount">Minimum floor (optional)</Label>
              <Input id="minimumAmount" name="minimumAmount" type="number" step="0.01" min="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountId">Account (optional)</Label>
              <Select name="accountId" defaultValue="__none__">
                <SelectTrigger id="accountId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Whole currency</SelectItem>
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
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
