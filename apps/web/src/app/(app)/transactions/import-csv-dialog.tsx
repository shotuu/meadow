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
import { fromTemplateFields, type CsvColumnMapping } from "@/lib/csv-template";
import { importCsvTransactions } from "./actions";

type Account = { id: string; name: string };
type CsvTemplate = { id: string; institutionName: string; columnMapping: unknown; amountSignConvention: string };

const NONE_VALUE = "__none__";
const EMPTY_MAPPING: CsvColumnMapping = {
  dateColumn: "",
  descriptionColumn: "",
  amountColumn: "",
  merchantColumn: "",
  flipSign: false,
};

export function ImportCsvDialog({ accounts, templates }: { accounts: Account[]; templates: CsvTemplate[] }) {
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [mapping, setMapping] = useState<CsvColumnMapping>(EMPTY_MAPPING);
  const [institutionName, setInstitutionName] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

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

  function applyTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const restored = fromTemplateFields(template);
    // Only pre-fill a column if the saved name still exists in this file's
    // headers -- a stale template shouldn't silently point at nothing.
    setMapping({
      dateColumn: columns.includes(restored.dateColumn) ? restored.dateColumn : "",
      descriptionColumn: columns.includes(restored.descriptionColumn) ? restored.descriptionColumn : "",
      amountColumn: columns.includes(restored.amountColumn) ? restored.amountColumn : "",
      merchantColumn: columns.includes(restored.merchantColumn) ? restored.merchantColumn : "",
      flipSign: restored.flipSign,
    });
    setInstitutionName(template.institutionName);
  }

  function resetForm() {
    setColumns([]);
    setMapping(EMPTY_MAPPING);
    setInstitutionName("");
    setSaveAsTemplate(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
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
                `Imported ${result.imported} transactions (${result.duplicates} duplicates, ${result.errors} errors skipped)` +
                  (result.templateSaved ? " — template saved" : "")
              );
              setOpen(false);
              resetForm();
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
              {templates.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="csv-template">Load a saved template</Label>
                  <Select onValueChange={applyTemplate}>
                    <SelectTrigger id="csv-template">
                      <SelectValue placeholder="Choose an institution's saved mapping" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.institutionName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <ColumnSelect
                  name="dateColumn"
                  label="Date column"
                  columns={columns}
                  value={mapping.dateColumn}
                  onValueChange={(v) => setMapping((m) => ({ ...m, dateColumn: v }))}
                />
                <ColumnSelect
                  name="amountColumn"
                  label="Amount column"
                  columns={columns}
                  value={mapping.amountColumn}
                  onValueChange={(v) => setMapping((m) => ({ ...m, amountColumn: v }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ColumnSelect
                  name="descriptionColumn"
                  label="Description column"
                  columns={columns}
                  value={mapping.descriptionColumn}
                  onValueChange={(v) => setMapping((m) => ({ ...m, descriptionColumn: v }))}
                />
                <ColumnSelect
                  name="merchantColumn"
                  label="Merchant column (optional)"
                  columns={columns}
                  optional
                  value={mapping.merchantColumn}
                  onValueChange={(v) => setMapping((m) => ({ ...m, merchantColumn: v }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="flipSign"
                  checked={mapping.flipSign}
                  onChange={(e) => setMapping((m) => ({ ...m, flipSign: e.target.checked }))}
                />
                My bank shows spending as positive numbers (flip the sign on import)
              </label>

              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center gap-2">
                  <Input
                    name="institutionName"
                    placeholder="Institution name (e.g. Chase)"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="saveAsTemplate"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    disabled={!institutionName.trim()}
                  />
                  Save this column mapping as a reusable template
                </label>
              </div>
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
  value,
  onValueChange,
}: {
  name: string;
  label: string;
  columns: string[];
  optional?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Select
        name={name}
        value={value === "" && optional ? NONE_VALUE : value}
        onValueChange={(v) => onValueChange(v === NONE_VALUE ? "" : v)}
      >
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
