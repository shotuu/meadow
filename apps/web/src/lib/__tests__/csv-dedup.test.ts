import { describe, expect, it } from "vitest";
import { externalIdFor } from "../csv-dedup";

describe("externalIdFor", () => {
  it("is deterministic for the same inputs", () => {
    const a = externalIdFor("acct1", "2026-08-01", "Whole Foods", -42.5);
    const b = externalIdFor("acct1", "2026-08-01", "Whole Foods", -42.5);
    expect(a).toBe(b);
  });

  it("differs when any single field differs", () => {
    const base = externalIdFor("acct1", "2026-08-01", "Whole Foods", -42.5);
    expect(externalIdFor("acct2", "2026-08-01", "Whole Foods", -42.5)).not.toBe(base);
    expect(externalIdFor("acct1", "2026-08-02", "Whole Foods", -42.5)).not.toBe(base);
    expect(externalIdFor("acct1", "2026-08-01", "Trader Joe's", -42.5)).not.toBe(base);
    expect(externalIdFor("acct1", "2026-08-01", "Whole Foods", -42.51)).not.toBe(base);
  });

  it("produces a hex sha1 digest", () => {
    const id = externalIdFor("acct1", "2026-08-01", "Whole Foods", -42.5);
    expect(id).toMatch(/^[0-9a-f]{40}$/);
  });
});
