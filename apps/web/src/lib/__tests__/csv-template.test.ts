import { describe, expect, it } from "vitest";
import { toTemplateFields, fromTemplateFields } from "../csv-template";

describe("toTemplateFields", () => {
  it("serializes the four column names and encodes flipSign as a convention string", () => {
    const fields = toTemplateFields({
      dateColumn: "Date",
      descriptionColumn: "Description",
      amountColumn: "Amount",
      merchantColumn: "Merchant",
      flipSign: true,
    });
    expect(fields.columnMapping).toEqual({
      dateColumn: "Date",
      descriptionColumn: "Description",
      amountColumn: "Amount",
      merchantColumn: "Merchant",
    });
    expect(fields.amountSignConvention).toBe("flipped");
    expect(fields.dateFormat).toBe("auto");
  });

  it("encodes flipSign: false as as_is", () => {
    const fields = toTemplateFields({
      dateColumn: "d",
      descriptionColumn: "desc",
      amountColumn: "amt",
      merchantColumn: "",
      flipSign: false,
    });
    expect(fields.amountSignConvention).toBe("as_is");
  });
});

describe("fromTemplateFields", () => {
  it("round-trips through toTemplateFields", () => {
    const original = {
      dateColumn: "Date",
      descriptionColumn: "Description",
      amountColumn: "Amount",
      merchantColumn: "Merchant",
      flipSign: true,
    };
    const saved = toTemplateFields(original);
    const restored = fromTemplateFields(saved);
    expect(restored).toEqual(original);
  });

  it("tolerates a malformed columnMapping instead of throwing", () => {
    const restored = fromTemplateFields({ columnMapping: null, amountSignConvention: "as_is" });
    expect(restored).toEqual({
      dateColumn: "",
      descriptionColumn: "",
      amountColumn: "",
      merchantColumn: "",
      flipSign: false,
    });
  });
});
