export interface CsvColumnMapping {
  dateColumn: string;
  descriptionColumn: string;
  amountColumn: string;
  merchantColumn: string;
  flipSign: boolean;
}

/**
 * CsvImportTemplate models the mapping as an opaque columnMapping JSON blob
 * plus a required dateFormat/amountSignConvention pair, not the dialog's
 * discrete fields -- this is the serialization layer between the two.
 * dateFormat is stored as a constant since this app parses dates with plain
 * `new Date(...)` today, not a configurable format string.
 */
export function toTemplateFields(mapping: CsvColumnMapping): {
  columnMapping: Pick<CsvColumnMapping, "dateColumn" | "descriptionColumn" | "amountColumn" | "merchantColumn">;
  dateFormat: string;
  amountSignConvention: "as_is" | "flipped";
} {
  return {
    columnMapping: {
      dateColumn: mapping.dateColumn,
      descriptionColumn: mapping.descriptionColumn,
      amountColumn: mapping.amountColumn,
      merchantColumn: mapping.merchantColumn,
    },
    dateFormat: "auto",
    amountSignConvention: mapping.flipSign ? "flipped" : "as_is",
  };
}

/**
 * Reverse of toTemplateFields, tolerant of a malformed/legacy columnMapping
 * blob (returns empty strings rather than throwing) so a broken saved
 * template never crashes the import dialog.
 */
export function fromTemplateFields(row: { columnMapping: unknown; amountSignConvention: string }): CsvColumnMapping {
  const raw = row.columnMapping;
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const str = (key: string) => (typeof obj[key] === "string" ? (obj[key] as string) : "");

  return {
    dateColumn: str("dateColumn"),
    descriptionColumn: str("descriptionColumn"),
    amountColumn: str("amountColumn"),
    merchantColumn: str("merchantColumn"),
    flipSign: row.amountSignConvention === "flipped",
  };
}
