import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Mirrors architecture.integration.test.ts's own safety guard -- these
// tests write real rows and must never run against anything but the
// dedicated disposable database.
const url = process.env.MEADOW_TEST_DATABASE_URL;
if (url && (new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/meadow_sprint_test")) {
  throw new Error("Integration tests require the dedicated disposable localhost:55439/meadow_sprint_test database");
}
const integration = url ? describe : describe.skip;

const state = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({ requireUserId: async () => state.userId }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

integration("reversal-candidate persistence against PostgreSQL", () => {
  let db: (typeof import("@finance-app/db"))["prisma"];
  let matchReversalsForUser: (userId: string) => Promise<void>;
  let confirmReversalMatch: (candidateId: string) => Promise<void>;
  let dismissReversalMatch: (candidateId: string) => Promise<void>;
  let accountId: string;
  const users: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    db = (await import("@finance-app/db")).prisma;
    ({ matchReversalsForUser } = await import("../../../../../apps/worker/src/jobs/reversal-matching"));
    ({ confirmReversalMatch, dismissReversalMatch } = await import("../../app/(app)/transactions/reversal-actions"));
  });

  beforeEach(async () => {
    state.userId = `sprint-${randomUUID()}`;
    await db.user.create({ data: { id: state.userId, profile: { create: {} } } });
    users.push(state.userId);
    const account = await db.financialAccount.create({
      data: { userId: state.userId, name: "Checking", currency: "USD", type: "checking", classification: "asset", syncSource: "manual" },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: users } } });
    await (await import("@finance-app/db")).closeLockPool();
    await db.$disconnect();
  });

  async function makePair(daysApart = 2, description = "Store purchase / refund") {
    const chargeDate = new Date();
    chargeDate.setDate(chargeDate.getDate() - daysApart - 1);
    const refundDate = new Date();
    refundDate.setDate(refundDate.getDate() - 1);
    const charge = await db.transaction.create({
      data: { userId: state.userId, accountId, amount: -40, currency: "USD", date: chargeDate, description: `Store purchase ${description}` },
    });
    const refund = await db.transaction.create({
      data: { userId: state.userId, accountId, amount: 40, currency: "USD", date: refundDate, description: `Store refund ${description}` },
    });
    return { charge, refund };
  }

  it("creates a pending candidate for a real charge/refund pair", async () => {
    const { charge, refund } = await makePair();
    await matchReversalsForUser(state.userId);

    const candidates = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].chargeTransactionId).toBe(charge.id);
    expect(candidates[0].reversalTransactionId).toBe(refund.id);
    expect(candidates[0].status).toBe("pending");
  });

  it("is idempotent: running the matcher twice produces exactly one candidate, same row", async () => {
    await makePair();
    await matchReversalsForUser(state.userId);
    const first = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });

    await matchReversalsForUser(state.userId);
    const second = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
  });

  it("keeps a dismissed candidate dismissed across subsequent matching runs", async () => {
    await makePair();
    await matchReversalsForUser(state.userId);
    const [candidate] = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });

    await dismissReversalMatch(candidate.id);
    await matchReversalsForUser(state.userId);
    await matchReversalsForUser(state.userId);

    const after = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(candidate.id);
    expect(after[0].status).toBe("dismissed");
  });

  it("keeps a confirmed candidate stable (untouched) across subsequent matching runs", async () => {
    await makePair();
    await matchReversalsForUser(state.userId);
    const [candidate] = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });

    await confirmReversalMatch(candidate.id);
    await matchReversalsForUser(state.userId);
    await matchReversalsForUser(state.userId);

    const after = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(candidate.id);
    expect(after[0].status).toBe("confirmed");
    expect(after[0].resolvedAt).not.toBeNull();
  });

  it("prunes a stale pending candidate once the matcher no longer reproduces it", async () => {
    const { charge } = await makePair();
    await matchReversalsForUser(state.userId);
    const before = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });
    expect(before).toHaveLength(1);

    // Push the charge outside the reversal matcher's date window so the
    // pairing is no longer proposed -- the stale pending suggestion should
    // be pruned, not left to rot.
    await db.transaction.update({ where: { id: charge.id }, data: { date: new Date("2020-01-01") } });
    await matchReversalsForUser(state.userId);

    const after = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });
    expect(after).toHaveLength(0);
  });

  it("confirming a candidate throws if it is already resolved (no silent double-confirm)", async () => {
    await makePair();
    await matchReversalsForUser(state.userId);
    const [candidate] = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });

    await confirmReversalMatch(candidate.id);
    await expect(confirmReversalMatch(candidate.id)).rejects.toThrow(/already been resolved/);
  });

  it("dismissing an already-confirmed candidate is a safe no-op, not a status flip", async () => {
    await makePair();
    await matchReversalsForUser(state.userId);
    const [candidate] = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });

    await confirmReversalMatch(candidate.id);
    await dismissReversalMatch(candidate.id); // conditional updateMany guarded on status:"pending" -- matches 0 rows

    const after = await db.reversalMatchCandidate.findFirstOrThrow({ where: { id: candidate.id } });
    expect(after.status).toBe("confirmed");
  });

  it("confirming a pairing auto-dismisses another pending candidate sharing either transaction, preventing a contradictory active relationship", async () => {
    // Two independent pending candidates sharing one transaction (charge),
    // created directly rather than via the matcher -- matchReversals is
    // greedy-exclusive within a single run and could never propose both at
    // once itself. This targets confirmReversalMatch's own cross-candidate
    // safeguard in isolation: real usage could reach this state across two
    // separate nightly runs (a better pairing displaces an old one before
    // the stale one is pruned), and the action must not let a transaction
    // end up in two simultaneously-active relationships regardless of how
    // it got there.
    const { charge, refund } = await makePair(2, "A");
    const thirdTx = await db.transaction.create({
      data: { userId: state.userId, accountId, amount: 40, currency: "USD", date: new Date(), description: "Store refund A late" },
    });
    const real = await db.reversalMatchCandidate.create({
      data: { userId: state.userId, chargeTransactionId: charge.id, reversalTransactionId: refund.id, confidenceScore: 0.9, daysApart: 2, status: "pending" },
    });
    const competing = await db.reversalMatchCandidate.create({
      data: { userId: state.userId, chargeTransactionId: charge.id, reversalTransactionId: thirdTx.id, confidenceScore: 0.7, daysApart: 5, status: "pending" },
    });

    await confirmReversalMatch(real.id);

    const after = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });
    const confirmedRow = after.find((c) => c.id === real.id)!;
    const dismissedRow = after.find((c) => c.id === competing.id)!;
    expect(confirmedRow.status).toBe("confirmed");
    expect(dismissedRow.status).toBe("dismissed");
  });

  it("excludes an already-confirmed transaction from future candidate generation entirely", async () => {
    const { charge, refund } = await makePair();
    await matchReversalsForUser(state.userId);
    const [candidate] = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });
    await confirmReversalMatch(candidate.id);

    // A brand-new transaction that would otherwise look like a plausible
    // reversal partner for the already-confirmed charge.
    await db.transaction.create({
      data: { userId: state.userId, accountId, amount: 40, currency: "USD", date: new Date(), description: "Store refund" },
    });
    await matchReversalsForUser(state.userId);

    const after = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(candidate.id);
    expect(after[0].status).toBe("confirmed");
    void charge;
    void refund;
  });

  it("deleting either side of a pending candidate cascades away the relationship instead of leaving it dangling", async () => {
    const { charge, refund } = await makePair();
    await matchReversalsForUser(state.userId);
    const before = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });
    expect(before).toHaveLength(1);

    await db.transaction.delete({ where: { id: refund.id } });

    const after = await db.reversalMatchCandidate.findMany({ where: { userId: state.userId } });
    expect(after).toHaveLength(0);
    const chargeStillExists = await db.transaction.findUnique({ where: { id: charge.id } });
    expect(chargeStillExists).not.toBeNull();
  });
});
