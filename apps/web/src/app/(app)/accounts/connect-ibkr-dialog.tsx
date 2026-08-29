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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectIbkrAccount } from "./ibkr-actions";

export function ConnectIbkrDialog() {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Connect IBKR</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            setConnecting(true);
            try {
              await connectIbkrAccount(formData);
              setOpen(false);
            } catch {
              toast.error("Couldn't connect that IBKR account — check the token and Query ID.");
            } finally {
              setConnecting(false);
            }
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Connect IBKR account</DialogTitle>
            <DialogDescription>
              From IBKR Account Management: Reports → Flex Queries → Flex Web Service
              Configuration for the token, and your saved Activity Flex Query for the Query ID.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="ibkr-name">Account name</Label>
            <Input id="ibkr-name" name="name" placeholder="e.g. IBKR Individual" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ibkr-currency">Currency</Label>
            <Input
              id="ibkr-currency"
              name="currency"
              defaultValue="USD"
              maxLength={3}
              className="uppercase"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ibkr-token">Flex Web Service token</Label>
            <Input id="ibkr-token" name="flexToken" type="password" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ibkr-query">Activity Flex Query ID</Label>
            <Input id="ibkr-query" name="flexQueryId" required />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={connecting}>
              {connecting ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
