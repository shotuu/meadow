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
import { BUDGET_TYPE_OPTIONS } from "@/lib/budget-type";
import { createCategory } from "./actions";

export function NewCategoryDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add category</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await createCategory(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Add category</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. Dining Out" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="kind">Kind</Label>
            <Select name="kind" defaultValue="expense">
              <SelectTrigger id="kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budgetType">Budget behavior</Label>
            <Select name="budgetType" defaultValue="none">
              <SelectTrigger id="budgetType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUDGET_TYPE_OPTIONS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="submit">Create category</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
