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
import { createAlertRule } from "./actions";

const RULE_TYPES = [
  { value: "budget_over_target", label: "Budget over target", needsCategory: true, needsAccount: false, valueLabel: "Alert at % of budget spent", valueDefault: "100" },
  { value: "low_balance", label: "Low balance", needsCategory: false, needsAccount: true, valueLabel: "Floor amount", valueDefault: "0" },
  { value: "emergency_fund_below_floor", label: "Emergency fund below floor", needsCategory: false, needsAccount: true, valueLabel: "Floor amount", valueDefault: "0" },
  { value: "large_transaction", label: "Large transaction", needsCategory: false, needsAccount: false, valueLabel: "Threshold amount", valueDefault: "0" },
  { value: "recurring_missed", label: "Recurring charge missed", needsCategory: false, needsAccount: false, valueLabel: null, valueDefault: "" },
  { value: "recurring_amount_changed", label: "Recurring amount changed", needsCategory: false, needsAccount: false, valueLabel: null, valueDefault: "" },
  { value: "sinking_fund_underfunded", label: "Sinking fund underfunded", needsCategory: true, needsAccount: false, valueLabel: "Warn when fewer than N months left", valueDefault: "1" },
] as const;

type Account = { id: string; name: string };
type Category = { id: string; name: string };

export function NewAlertDialog({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [ruleType, setRuleType] = useState<(typeof RULE_TYPES)[number]["value"]>("budget_over_target");
  const meta = RULE_TYPES.find((r) => r.value === ruleType)!;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add alert</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await createAlertRule(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Add alert</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="ruleType">Alert type</Label>
            <Select
              name="ruleType"
              value={ruleType}
              onValueChange={(v) => setRuleType(v as typeof ruleType)}
            >
              <SelectTrigger id="ruleType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {meta.needsAccount && (
            <div className="space-y-2">
              <Label htmlFor="accountId">Account</Label>
              <Select name="accountId">
                <SelectTrigger id="accountId">
                  <SelectValue placeholder="Select an account" />
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
          )}

          {(meta.needsCategory || ruleType === "recurring_missed" || ruleType === "recurring_amount_changed") && (
            <div className="space-y-2">
              <Label htmlFor="categoryId">
                Category{meta.needsCategory ? "" : " (optional — leave unset for all categories)"}
              </Label>
              <Select name="categoryId">
                <SelectTrigger id="categoryId">
                  <SelectValue placeholder="Select a category" />
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

          {meta.valueLabel && (
            <div className="space-y-2">
              <Label htmlFor="value">{meta.valueLabel}</Label>
              <Input
                key={ruleType}
                id="value"
                name="value"
                type="number"
                step="any"
                defaultValue={meta.valueDefault}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="submit">Add alert</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
