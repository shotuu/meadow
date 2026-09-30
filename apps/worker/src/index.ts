import { prisma, withAdvisoryLock, closeLockPool } from "@finance-app/db";
import { computeBalanceSnapshots, evaluateAlertRules, matchReversals, matchTransfers, recomputeRecurringSeries, refreshExchangeRates, runCategorizationBatch, syncFinverseAccounts, syncIbkrFlexAccounts, syncPlaidAccounts } from "./jobs/index.js";

/**
 * Railway Cron Job entrypoint (see the service's own Cron Schedule setting,
 * currently hourly): started fresh on schedule, runs to completion, and
 * exits -- no in-process scheduler. A previously always-on node-cron
 * process billed for a full month of idle RAM to do ~1 real run/day; this
 * is billed only for the minutes it actually runs (see PROGRESS.md's
 * 2026-09-30 cost entry). The "already succeeded today" check below is
 * what turns "hourly invocation" into "once-daily work, with automatic
 * catch-up if an earlier hour's run failed or a scheduled tick was
 * skipped" -- unchanged from the prior design.
 */
async function refreshIfDue(): Promise<void> {
  await withAdvisoryLock("worker:nightly", async () => {
    const due = new Date();
    due.setUTCHours(2, 0, 0, 0);
    if (due > new Date()) due.setUTCDate(due.getUTCDate() - 1);
    const completed = await prisma.jobRun.findFirst({ where: { name: "nightly", status: "succeeded", startedAt: { gte: due } } });
    if (completed) {
      console.log("[worker] already succeeded today, nothing to do");
      return;
    }
    const run = await prisma.jobRun.create({ data: { name: "nightly", status: "running" } });
    try {
      await refreshExchangeRates();
      // Wait for each provider before any derived data is computed, but a
      // failure in one provider (or one user's item within it) must not
      // skip derived computation for every other user.
      const failures: unknown[] = [];
      for (const sync of [syncPlaidAccounts, syncIbkrFlexAccounts, syncFinverseAccounts]) {
        try { await sync(); } catch (error) { failures.push(error); }
      }
      await runCategorizationBatch();
      await recomputeRecurringSeries();
      await matchTransfers();
      await matchReversals();
      await computeBalanceSnapshots();
      await evaluateAlertRules();
      if (failures.length) throw new AggregateError(failures, "Provider refresh incomplete");
      await prisma.jobRun.update({ where: { id: run.id }, data: { status: "succeeded", finishedAt: new Date() } });
      console.log("[worker] nightly refresh succeeded");
    } catch (error) {
      await prisma.jobRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date() } });
      throw error;
    }
  });
}

async function main() {
  await prisma.$connect();
  try {
    await refreshIfDue();
  } finally {
    // A cron job must close every open connection before exiting, or
    // Railway will see the deployment as still Active and skip every
    // subsequent scheduled run.
    await closeLockPool();
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[worker] run failed", error);
    process.exit(1);
  });
