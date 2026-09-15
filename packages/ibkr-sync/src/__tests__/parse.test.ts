import { describe, expect, it } from "vitest";
import { asArray, parseIbkrDate, parseIbkrDateTime, parseCashReportRows } from "../parse";

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

describe("invalid report dates", () => {
  it.each(["20260231", "20261301", "undefined", "2026011"])("rejects %s", (date) => {
    expect(() => parseIbkrDate(date)).toThrow("Invalid IBKR date");
  });
});

describe("parseCashReportRows", () => {
  it("returns [] when the Cash Report section is absent (not enabled on the Flex Query)", () => {
    expect(parseCashReportRows(undefined)).toEqual([]);
  });

  it("parses a single-currency row (fast-xml-parser's single-occurrence footgun) and a multi-currency array the same way", () => {
    // Real shape observed from a live Flex Query with Currency Breakout on
    // and Base Currency Summary off: no BASE_SUMMARY aggregate row.
    const single = parseCashReportRows({
      CashReportCurrency: { "@_accountId": "U13508599", "@_currency": "SGD", "@_endingCash": "156.1385146" },
    });
    expect(single).toEqual([{ currency: "SGD", endingCash: 156.1385146 }]);

    const multi = parseCashReportRows({
      CashReportCurrency: [
        { "@_accountId": "U13508599", "@_currency": "SGD", "@_endingCash": "156.1385146" },
        { "@_accountId": "U13508599", "@_currency": "USD", "@_endingCash": "0.734351999" },
      ],
    });
    expect(multi).toEqual([
      { currency: "SGD", endingCash: 156.1385146 },
      { currency: "USD", endingCash: 0.734351999 },
    ]);
  });

  it("rejects a row missing currency or with a non-finite ending cash", () => {
    expect(() => parseCashReportRows({ CashReportCurrency: { "@_endingCash": "100" } })).toThrow(
      "Invalid IBKR cash report row"
    );
    expect(() =>
      parseCashReportRows({ CashReportCurrency: { "@_currency": "USD", "@_endingCash": "not-a-number" } })
    ).toThrow("Invalid IBKR cash report row");
  });
});
