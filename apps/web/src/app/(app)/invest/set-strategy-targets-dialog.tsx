"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { saveTargetAllocations } from "./actions";

type Row = { bucketName: string; targetWeightPct: number; driftThresholdPct: number };

function buildInitialRows(currentTargets: Row[], currentStrategyBucketNames: string[]): Row[] {
  if (currentTargets.length > 0) return currentTargets;
  if (currentStrategyBucketNames.length > 0) {
    return currentStrategyBucketNames.map((bucketName) => ({ bucketName, targetWeightPct: 0, driftThresholdPct: 5 }));
  }
  return [{ bucketName: "", targetWeightPct: 0, driftThresholdPct: 5 }];
}

/**
 * The single mechanism for setting up, editing, or migrating a strategy
 * target -- first-time setup, ongoing edits, and the guided
 * Stocks->Core/Satellite migration all go through this one dialog rather
 * than three separate flows. Never presupposes a bucket name or a 90/10
 * split: rows default to the user's real currently-assigned strategy
 * buckets (via HoldingBucketAssignment) with a blank 0% target to fill in,
 * or a single empty row if the user hasn't assigned any yet -- see
 * PROGRESS.md's Phase 5 entry.
 */
export function SetStrategyTargetsDialog({
  currentTargets,
  staleTargets,
  currentStrategyBucketNames,
  triggerLabel,
  triggerVariant = "outline",
}: {
  currentTargets: Row[];
  staleTargets: { bucketName: string; targetWeightPct: number }[];
  currentStrategyBucketNames: string[];
  triggerLabel: string;
  triggerVariant?: "outline" | "default" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => buildInitialRows(currentTargets, currentStrategyBucketNames));
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (next) {
      setRows(buildInitialRows(currentTargets, currentStrategyBucketNames));
      setError(null);
    }
    setOpen(next);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const totalPct = rows.reduce((sum, r) => sum + (Number.isFinite(r.targetWeightPct) ? r.targetWeightPct : 0), 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form
          action={async (formData) => {
            setError(null);
            formData.set("rows", JSON.stringify(rows.filter((r) => r.bucketName.trim())));
            // Which existing rows to retire as stale is now recomputed
            // server-side from real data (see saveTargetAllocations) --
            // staleTargets here is only used for this dialog's own display.
            try {
              await saveTargetAllocations(formData);
              setOpen(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't save target allocation");
            }
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Strategy target</DialogTitle>
          </DialogHeader>

          {staleTargets.length > 0 && (
            <div className="rounded-lg border border-dashed border-border p-3 text-sm">
              <p className="font-medium">
                Your current target ({staleTargets.map((s) => `${s.bucketName} ${s.targetWeightPct}%`).join(", ")}) was
                set before instrument type and investment strategy were separate concepts.
              </p>
              <p className="mt-1 text-muted-foreground">
                It measures security type, not investment strategy, so drift against it isn&apos;t meaningful. Choose a
                real strategy target below — saving replaces the old one.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  {i === 0 && <Label className="text-xs">Bucket</Label>}
                  <Input
                    placeholder="e.g. Core"
                    value={row.bucketName}
                    onChange={(e) => updateRow(i, { bucketName: e.target.value })}
                    required
                  />
                </div>
                <div className="w-20 space-y-1">
                  {i === 0 && <Label className="text-xs">Target %</Label>}
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={row.targetWeightPct}
                    onChange={(e) => updateRow(i, { targetWeightPct: Number(e.target.value) })}
                  />
                </div>
                <div className="w-24 space-y-1">
                  {i === 0 && <Label className="text-xs">Alert at ±%</Label>}
                  <Input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={row.driftThresholdPct}
                    onChange={(e) => updateRow(i, { driftThresholdPct: Number(e.target.value) })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove bucket"
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  disabled={rows.length === 1}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows([...rows, { bucketName: "", targetWeightPct: 0, driftThresholdPct: 5 }])}
          >
            <Plus className="size-4" /> Add bucket
          </Button>

          <p className={cn("text-sm", totalPct > 100 ? "text-negative" : "text-muted-foreground")}>
            {totalPct.toFixed(1)}% targeted{totalPct > 100 && " — exceeds 100%"}
          </p>
          {error && <p className="text-sm text-negative">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={totalPct > 100}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
