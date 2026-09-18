import { describe, expect, it } from "vitest";
import { findStaleEntityIds } from "../alerts";

describe("findStaleEntityIds", () => {
  it("returns open entity ids that no longer have a current target", () => {
    // Regression for a real bug: after migrating a strategy target from a
    // legacy "Stocks" bucket to real Core/Satellite buckets, the open
    // "Stocks has drifted from target" AlertEvent stayed open forever
    // because the worker only ever resolved alerts for buckets still
    // present in the current target set.
    const openEntityIds = ["user1:Stocks", "user1:Core", "user1:Satellite"];
    const currentEntityIds = ["user1:Core", "user1:Satellite"];
    expect(findStaleEntityIds(openEntityIds, currentEntityIds)).toEqual(["user1:Stocks"]);
  });

  it("returns every open entity id when no targets remain at all", () => {
    const openEntityIds = ["user1:Core", "user1:Satellite"];
    expect(findStaleEntityIds(openEntityIds, [])).toEqual(["user1:Core", "user1:Satellite"]);
  });

  it("returns nothing when every open entity id still has a current target", () => {
    const openEntityIds = ["user1:Core"];
    const currentEntityIds = ["user1:Core", "user1:Satellite"];
    expect(findStaleEntityIds(openEntityIds, currentEntityIds)).toEqual([]);
  });

  it("returns nothing when there are no open entity ids", () => {
    expect(findStaleEntityIds([], ["user1:Core"])).toEqual([]);
  });
});
