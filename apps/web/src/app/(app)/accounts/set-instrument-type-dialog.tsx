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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setInstrumentTypeOverride } from "./actions";
import { INSTRUMENT_TYPE_OPTIONS } from "@/lib/instrument-type-options";

export function SetInstrumentTypeDialog({
  symbol,
  currentInstrumentType,
  triggerLabel,
}: {
  symbol: string;
  currentInstrumentType: string;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [instrumentType, setInstrumentType] = useState(currentInstrumentType);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await setInstrumentTypeOverride(formData);
            setOpen(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Instrument type — {symbol}</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="symbol" value={symbol} />
          <input type="hidden" name="instrumentType" value={instrumentType} />

          <div className="space-y-2">
            <Label htmlFor="instrumentType">What is this security?</Label>
            <Select value={instrumentType} onValueChange={setInstrumentType}>
              <SelectTrigger id="instrumentType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSTRUMENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Overrides Meadow&apos;s classification (from IBKR&apos;s own security data, or unresolved) for this
            symbol. Survives future IBKR syncs until you remove it.
          </p>

          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
