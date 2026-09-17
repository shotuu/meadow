import cron from "node-cron";
import { prisma, withAdvisoryLock, closeLockPool } from "@finance-app/db";
import { computeBalanceSnapshots, evaluateAlertRules, matchReversals, matchTransfers, recomputeRecurringSeries, refreshExchangeRates, runCategorizationBatch, syncFinverseAccounts, syncIbkrFlexAccounts, syncPlaidAccounts } from "./jobs/index.js";

let running: Promise<void> | undefined;
let stopping = false;

async function refreshIfDue(): Promise<void> {
  if (stopping || running) return;
  running = withAdvisoryLock("worker:nightly", async () => {
    const due = new Date();
    due.setUTCHours(2, 0, 0, 0);
    if (due > new Date()) due.setUTCDate(due.getUTCDate() - 1);
    const completed = await prisma.jobRun.findFirst({ where: { name: "nightly", status: "succeeded", startedAt: { gte: due } } });
    if (completed) return;
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
    } catch (error) {
      await prisma.jobRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date() } });
      throw error;
    }
  }).catch((error) => console.error("[worker] nightly refresh failed", error)).finally(() => { running = undefined; });
  await running;
}

async function main() {
  await prisma.$connect();
  // Hourly retries also catch up after downtime; success is once per UTC day after 02:00.
  cron.schedule("0 * * * *", refreshIfDue, { timezone: "UTC", noOverlap: true });
  console.log("[worker] ordered nightly refresh registered (02:00 UTC, hourly retry)");
  await refreshIfDue();
}

main().catch((error) => { console.error("[worker] startup failed", error); process.exitCode = 1; });
async function stop() {
  stopping = true;
  await running;
  await closeLockPool();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
