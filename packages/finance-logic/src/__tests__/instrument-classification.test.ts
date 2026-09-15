import { describe, expect, it } from "vitest";
import { classifyInstrumentType, instrumentTypeLabel } from "../instrument-classification";

describe("classifyInstrumentType", () => {
  it("manual override always wins, regardless of IBKR metadata", () => {
    const result = classifyInstrumentType({ ibkrAssetCategory: "STK", ibkrSubCategory: "ETF", manualOverride: "stock" });
    expect(result).toEqual({ instrumentType: "stock", source: "manual_override", confidence: 1 });
  });

  it("classifies an ETF from STK + subCategory ETF", () => {
    const result = classifyInstrumentType({ ibkrAssetCategory: "STK", ibkrSubCategory: "ETF" });
    expect(result).toEqual({ instrumentType: "etf", source: "ibkr_metadata", confidence: 1 });
  });

  it("classifies an individual stock from STK + subCategory COMMON", () => {
    const result = classifyInstrumentType({ ibkrAssetCategory: "STK", ibkrSubCategory: "COMMON" });
    expect(result).toEqual({ instrumentType: "stock", source: "ibkr_metadata", confidence: 1 });
  });

  it("is case-insensitive on both IBKR fields", () => {
    const result = classifyInstrumentType({ ibkrAssetCategory: "stk", ibkrSubCategory: "etf" });
    expect(result.instrumentType).toBe("etf");
  });

  it("distinguishes IMID (ETF) from AMD/NVDA (stock) even though both report assetCategory STK", () => {
    const imid = classifyInstrumentType({ ibkrAssetCategory: "STK", ibkrSubCategory: "ETF" });
    const amd = classifyInstrumentType({ ibkrAssetCategory: "STK", ibkrSubCategory: "COMMON" });
    expect(imid.instrumentType).toBe("etf");
    expect(amd.instrumentType).toBe("stock");
  });

  it("classifies bonds, cash, and crypto directly from assetCategory", () => {
    expect(classifyInstrumentType({ ibkrAssetCategory: "BOND", ibkrSubCategory: null }).instrumentType).toBe("bond");
    expect(classifyInstrumentType({ ibkrAssetCategory: "CASH", ibkrSubCategory: null }).instrumentType).toBe("cash");
    expect(classifyInstrumentType({ ibkrAssetCategory: "CRYPTO", ibkrSubCategory: null }).instrumentType).toBe("crypto");
  });

  it("classifies options/futures/warrants as option", () => {
    expect(classifyInstrumentType({ ibkrAssetCategory: "OPT", ibkrSubCategory: null }).instrumentType).toBe("option");
    expect(classifyInstrumentType({ ibkrAssetCategory: "FUT", ibkrSubCategory: null }).instrumentType).toBe("option");
  });

  it("classifies a known-but-unmapped category as other, with reduced confidence", () => {
    const result = classifyInstrumentType({ ibkrAssetCategory: "CMDTY", ibkrSubCategory: null });
    expect(result).toEqual({ instrumentType: "other", source: "ibkr_metadata", confidence: 0.6 });
  });

  it("returns unresolved (never a guess) for STK with no recognized subCategory", () => {
    const result = classifyInstrumentType({ ibkrAssetCategory: "STK", ibkrSubCategory: null });
    expect(result).toEqual({ instrumentType: "unknown", source: "unresolved", confidence: null });
  });

  it("returns unresolved for an unknown STK subCategory value rather than assuming stock", () => {
    const result = classifyInstrumentType({ ibkrAssetCategory: "STK", ibkrSubCategory: "SOMETHING_NEW" });
    expect(result.source).toBe("unresolved");
    expect(result.confidence).toBeNull();
  });

  it("returns unresolved when assetCategory itself is missing entirely", () => {
    const result = classifyInstrumentType({ ibkrAssetCategory: null, ibkrSubCategory: null });
    expect(result).toEqual({ instrumentType: "unknown", source: "unresolved", confidence: null });
  });

  it("never fabricates confidence for an unresolved case", () => {
    const result = classifyInstrumentType({ ibkrAssetCategory: "STK", ibkrSubCategory: "" });
    expect(result.confidence).toBeNull();
  });
});

describe("instrumentTypeLabel", () => {
  it("maps normalized instrument types to display labels", () => {
    expect(instrumentTypeLabel("etf")).toBe("ETFs");
    expect(instrumentTypeLabel("stock")).toBe("Stocks");
    expect(instrumentTypeLabel("unknown")).toBe("Unknown");
  });
});
