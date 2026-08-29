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
import { createTransaction } from "./actions";

type Account = { id: string; name: string; currency: string };
type Category = { id: string; name: string; kind: string };

export function NewTransactionDialog({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const [isTransfer, setIsTransfer] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add transaction</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await createTransaction(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="accountId">Account</Label>
              <Select name="accountId" defaultValue={accounts[0]?.id}>
                <SelectTrigger id="accountId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" defaultValue={today()} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" placeholder="e.g. Trader Joe's" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="merchantName">Merchant (optional)</Label>
              <Input id="merchantName" name="merchantName" placeholder="e.g. Trader Joe's" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">
                Amount <span className="text-muted-foreground">(negative = money out)</span>
              </Label>
              <Input id="amount" name="amount" type="number" step="0.01" required />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isTransfer"
              checked={isTransfer}
              onChange={(e) => setIsTransfer(e.target.checked)}
            />
            This is a transfer between my own accounts
          </label>

          {isTransfer ? (
            <div className="space-y-2">
              <Label htmlFor="transferAccountId">To/from account</Label>
              <Select name="transferAccountId">
                <SelectTrigger id="transferAccountId">
                  <SelectValue placeholder="Select the other account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="categoryId">Category (optional — rules may auto-fill this)</Label>
              <Select name="categoryId">
                <SelectTrigger id="categoryId">
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
