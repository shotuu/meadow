import { describe, expect, it } from "vitest";
import { median, mostCommon } from "../recurring";

describe("median", () => {
  it("returns the middle value for an odd-length array", () => {
    expect(median([1, 3, 2])).toBe(2);
  });

  it("averages the two middle values for an even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("does not mutate the input array", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("mostCommon", () => {
  it("returns the most frequently occurring value", () => {
    expect(mostCommon(["USD", "USD", "EUR"])).toBe("USD");
  });

  it("returns undefined for an empty array", () => {
    expect(mostCommon([])).toBeUndefined();
  });

  it("returns the single value when there is no tie to break", () => {
    expect(mostCommon(["cat-a"])).toBe("cat-a");
  });
});
