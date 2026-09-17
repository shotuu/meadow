import { describe, expect, it } from "vitest";
import { planReversalCandidateSync, type ReversalCandidateRecord, type ReversalCandidateMatch } from "../reversal-sync";

const record = (overrides: Partial<ReversalCandidateRecord> & Pick<ReversalCandidateRecord, "id">): ReversalCandidateRecord => ({
  chargeTransactionId: "charge-1",
  reversalTransactionId: "reversal-1",
  status: "pending",
  ...overrides,
});

const match = (overrides: Partial<ReversalCandidateMatch> = {}): ReversalCandidateMatch => ({
  chargeTransactionId: "charge-1",
  reversalTransactionId: "reversal-1",
  confidenceScore: 0.9,
  daysApart: 0,
  ...overrides,
});

describe("planReversalCandidateSync", () => {
  it("creates a candidate for a fresh match with no existing row", () => {
    const plan = planReversalCandidateSync([], [match()]);
    expect(plan.toCreate).toEqual([match()]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.stalePendingIds).toEqual([]);
  });

  it("updates score/daysApart in place when the existing row is still pending", () => {
    const existing = [record({ id: "row-1", status: "pending" })];
    const plan = planReversalCandidateSync(existing, [match({ confidenceScore: 0.95, daysApart: 1 })]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([{ id: "row-1", confidenceScore: 0.95, daysApart: 1 }]);
    expect(plan.stalePendingIds).toEqual([]);
  });

  it("never touches a confirmed row, even if this run recomputed a different score", () => {
    const existing = [record({ id: "row-1", status: "confirmed" })];
    const plan = planReversalCandidateSync(existing, [match({ confidenceScore: 0.5, daysApart: 9 })]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.stalePendingIds).toEqual([]);
  });

  it("never touches a dismissed row, even if this run reproduces the exact same pairing", () => {
    const existing = [record({ id: "row-1", status: "dismissed" })];
    const plan = planReversalCandidateSync(existing, [match()]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.stalePendingIds).toEqual([]);
  });

  it("prunes a pending row this run no longer reproduces", () => {
    const existing = [record({ id: "row-1", status: "pending" })];
    const plan = planReversalCandidateSync(existing, []);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.stalePendingIds).toEqual(["row-1"]);
  });

  it("never prunes a confirmed row this run no longer reproduces", () => {
    const existing = [record({ id: "row-1", status: "confirmed" })];
    const plan = planReversalCandidateSync(existing, []);
    expect(plan.stalePendingIds).toEqual([]);
  });

  it("never prunes a dismissed row this run no longer reproduces", () => {
    const existing = [record({ id: "row-1", status: "dismissed" })];
    const plan = planReversalCandidateSync(existing, []);
    expect(plan.stalePendingIds).toEqual([]);
  });

  it("is idempotent: applying a plan and re-running against the resulting state produces no further changes", () => {
    // Simulate applying toCreate -- the row now exists as pending.
    const afterFirstRun = [record({ id: "row-1", status: "pending" })];
    const secondPlan = planReversalCandidateSync(afterFirstRun, [match()]);
    expect(secondPlan.toCreate).toEqual([]);
    expect(secondPlan.toUpdate).toEqual([{ id: "row-1", confidenceScore: 0.9, daysApart: 0 }]);
    expect(secondPlan.stalePendingIds).toEqual([]);
  });

  it("is idempotent after confirmation: re-running the same match against a confirmed row changes nothing", () => {
    const afterConfirm = [record({ id: "row-1", status: "confirmed" })];
    const plan = planReversalCandidateSync(afterConfirm, [match()]);
    expect(plan).toEqual({ toCreate: [], toUpdate: [], stalePendingIds: [] });
  });

  it("handles multiple independent pairs without cross-contamination", () => {
    const existing = [
      record({ id: "row-1", chargeTransactionId: "c1", reversalTransactionId: "r1", status: "pending" }),
      record({ id: "row-2", chargeTransactionId: "c2", reversalTransactionId: "r2", status: "confirmed" }),
      record({ id: "row-3", chargeTransactionId: "c3", reversalTransactionId: "r3", status: "dismissed" }),
    ];
    // This run only reproduces c1/r1 (refined) and a brand-new c4/r4 pair;
    // c2/r2 and c3/r3 aren't reproduced at all (e.g. one side aged out of
    // the matching window).
    const matches = [
      match({ chargeTransactionId: "c1", reversalTransactionId: "r1", confidenceScore: 0.99 }),
      match({ chargeTransactionId: "c4", reversalTransactionId: "r4" }),
    ];
    const plan = planReversalCandidateSync(existing, matches);
    expect(plan.toCreate).toEqual([match({ chargeTransactionId: "c4", reversalTransactionId: "r4" })]);
    expect(plan.toUpdate).toEqual([{ id: "row-1", confidenceScore: 0.99, daysApart: 0 }]);
    // row-2 (confirmed) and row-3 (dismissed) are never pruned even though
    // this run didn't reproduce them; only pending rows are prune-eligible.
    expect(plan.stalePendingIds).toEqual([]);
  });

  it("prunes a stale pending row while simultaneously creating an unrelated new one", () => {
    const existing = [record({ id: "row-1", chargeTransactionId: "c1", reversalTransactionId: "r1", status: "pending" })];
    const matches = [match({ chargeTransactionId: "c2", reversalTransactionId: "r2" })];
    const plan = planReversalCandidateSync(existing, matches);
    expect(plan.toCreate).toEqual(matches);
    expect(plan.stalePendingIds).toEqual(["row-1"]);
  });
});
