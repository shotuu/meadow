"use client";

import { useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
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
import { importCsvTransactions } from "./actions";

type Account = { id: string; name: string };

const NONE_VALUE = "__none__";

export function ImportCsvDialog({ accounts }: { accounts: Account[] }) {
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setColumns([]);
      return;
    }
    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, preview: 1 });
    setColumns(parsed.meta.fields ?? []);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Import CSV</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            setImporting(true);
            try {
              const result = await importCsvTransactions(formData);
              toast.success(
                `Imported ${result.imported} transactions (${result.duplicates} duplicates, ${result.errors} errors skipped)`
              );
              setOpen(false);
              setColumns([]);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Import failed");
            } finally {
              setImporting(false);
            }
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Import transactions from CSV</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="csv-account">Account</Label>
            <Select name="accountId" defaultValue={accounts[0]?.id}>
              <SelectTrigger id="csv-account">
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
            <Label htmlFor="file">CSV file</Label>
            <Input id="file" name="file" type="file" accept=".csv" onChange={handleFileChange} required />
          </div>

          {columns.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <ColumnSelect name="dateColumn" label="Date column" columns={columns} />
                <ColumnSelect name="amountColumn" label="Amount column" columns={columns} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ColumnSelect name="descriptionColumn" label="Description column" columns={columns} />
                <ColumnSelect name="merchantColumn" label="Merchant column (optional)" columns={columns} optional />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="flipSign" />
                My bank shows spending as positive numbers (flip the sign on import)
              </label>
            </>
          )}

          <DialogFooter>
            <Button type="submit" disabled={columns.length === 0 || importing}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ColumnSelect({
  name,
  label,
  columns,
  optional,
}: {
  name: string;
  label: string;
  columns: string[];
  optional?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Select name={name} defaultValue={optional ? NONE_VALUE : undefined}>
        <SelectTrigger id={name}>
          <SelectValue placeholder="Select column" />
        </SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value={NONE_VALUE}>None</SelectItem>}
          {columns.map((col) => (
            <SelectItem key={col} value={col}>
              {col}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
