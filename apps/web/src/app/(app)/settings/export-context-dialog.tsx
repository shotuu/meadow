"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateAiFinancialContextExport } from "./export-actions";
import type { ExportMode } from "@/lib/ai-export/schema";

const MODE_DESCRIPTIONS: Record<ExportMode, string> = {
  privacy_safe: "Omits transaction notes, and best-effort redacts P2P counterparty names, your own name, account-number suffixes, and long reference/confirmation numbers. Recommended default for sharing with an AI.",
  standard: "Includes transaction notes and descriptions exactly as recorded, with no redaction pass. Useful for your own records, not recommended for sharing externally.",
};

export function ExportContextDialog() {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<ExportMode>("privacy_safe");

  async function handleGenerate() {
    setGenerating(true);
    try {
      const json = await generateAiFinancialContextExport(mode);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `meadow-financial-context-${mode}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch {
      toast.error("Something went wrong generating the export — try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Generate export</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Financial Context export</DialogTitle>
          <DialogDescription>
            Downloads a JSON file with your accounts, balances, the last 12 months of
            transactions (older transactions as monthly category totals), budgets, sinking funds,
            recurring charges, investment holdings and strategy allocation, and planning data —
            meant for you to hand to an AI tool of your choosing for financial advice. Account
            numbers, bank login credentials, and other app internals are never included. Nothing
            is sent anywhere by Meadow itself — only your browser downloads the file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="exportMode">Export mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as ExportMode)}>
            <SelectTrigger id="exportMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="privacy_safe">Privacy-safe (recommended)</SelectItem>
              <SelectItem value="standard">Standard (full detail)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{MODE_DESCRIPTIONS[mode]}</p>
        </div>

        <DialogFooter>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating…" : "Generate & download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
