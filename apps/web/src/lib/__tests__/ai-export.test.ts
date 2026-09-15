import { describe, expect, it } from "vitest";
import type { Prisma } from "@finance-app/db";
import { buildCategoryPath, buildAccountLabel } from "../ai-export/allowlist";
import { toDecimalString } from "../ai-export/decimal";

/** A minimal Decimal-shaped stub -- avoids pulling in the real @finance-app/db
 * runtime (which eagerly constructs a PrismaClient) for what's otherwise a
 * pure-function test, matching this test tier's existing DB-free convention. */
function fakeDecimal(value: string): Prisma.Decimal {
  return { toString: () => value } as Prisma.Decimal;
}

describe("buildCategoryPath", () => {
  it("returns null for an uncategorized row", () => {
    expect(buildCategoryPath(null)).toBeNull();
  });

  it("returns just the name for a top-level category", () => {
    expect(buildCategoryPath({ name: "Food", parentCategory: null })).toBe("Food");
  });

  it("joins parent and child with '>' for a subcategory", () => {
    expect(buildCategoryPath({ name: "Groceries", parentCategory: { name: "Food" } })).toBe("Food > Groceries");
  });
});

describe("buildAccountLabel", () => {
  it("uses the institution name when present", () => {
    expect(buildAccountLabel({ name: "Checking", institutionName: "Chase" })).toBe("Chase — Checking");
  });

  it("falls back to 'Manual' when there's no institution (manual/CSV accounts)", () => {
    expect(buildAccountLabel({ name: "Cash Wallet", institutionName: null })).toBe("Manual — Cash Wallet");
    expect(buildAccountLabel({ name: "Cash Wallet" })).toBe("Manual — Cash Wallet");
  });
});

describe("toDecimalString", () => {
  it("returns null for null or undefined", () => {
    expect(toDecimalString(null)).toBeNull();
    expect(toDecimalString(undefined)).toBeNull();
  });

  it("preserves exact decimal precision, unlike Number()", () => {
    expect(toDecimalString(fakeDecimal("156.1385146"))).toBe("156.1385146");
  });
});
