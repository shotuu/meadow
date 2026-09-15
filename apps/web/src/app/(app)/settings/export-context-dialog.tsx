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
import { generateAiFinancialContextExport } from "./export-actions";

export function ExportContextDialog() {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const json = await generateAiFinancialContextExport();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `meadow-financial-context-${new Date().toISOString().slice(0, 10)}.json`;
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
            transactions (older transactions as monthly category totals), budgets, recurring
            charges, investment holdings, and planning data — meant for you to hand to an AI tool
            of your choosing for financial advice. Account numbers, bank login credentials, and
            other app internals are never included. Nothing is sent anywhere by Meadow itself —
            only your browser downloads the file.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating…" : "Generate & download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
