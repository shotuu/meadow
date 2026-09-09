import { describe, expect, it } from "vitest";
import { asArray, parseIbkrDate, parseIbkrDateTime } from "../parse";

describe("asArray", () => {
  it("returns an empty array for null or undefined", () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
  });

  it("wraps a single object in an array (fast-xml-parser's single-occurrence footgun)", () => {
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }]);
  });

  it("passes an actual array through unchanged", () => {
    const arr = [{ a: 1 }, { a: 2 }];
    expect(asArray(arr)).toBe(arr);
  });
});

describe("parseIbkrDate", () => {
  it("parses a plain YYYYMMDD string as a UTC date", () => {
    const date = parseIbkrDate("20260315");
    expect(date.toISOString()).toBe(new Date(Date.UTC(2026, 2, 15)).toISOString());
  });
});

describe("parseIbkrDateTime", () => {
  it("takes just the date half of a YYYYMMDD;HHMMSS value", () => {
    const date = parseIbkrDateTime("20260315;143000");
    expect(date.toISOString()).toBe(new Date(Date.UTC(2026, 2, 15)).toISOString());
  });

  it("handles a bare date with no time component", () => {
    const date = parseIbkrDateTime("20260315");
    expect(date.toISOString()).toBe(new Date(Date.UTC(2026, 2, 15)).toISOString());
  });
});
