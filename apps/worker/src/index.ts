import cron from "node-cron";
import { prisma } from "@finance-app/db";
import {
  evaluateAlertRules,
  recomputeRecurringSeries,
  refreshExchangeRates,
  runCategorizationBatch,
  syncIbkrFlexAccounts,
  syncPlaidAccounts,
} from "./jobs/index.js";

async function main() {
  await prisma.$connect();
  console.log("[worker] connected to database, scheduling jobs");

  // Nightly, staggered so they don't all hit the DB at once.
  cron.schedule("0 2 * * *", () => refreshExchangeRates());
  cron.schedule("15 2 * * *", () => syncPlaidAccounts());
  cron.schedule("30 2 * * *", () => syncIbkrFlexAccounts());
  cron.schedule("0 3 * * *", () => recomputeRecurringSeries());
  cron.schedule("15 3 * * *", () => runCategorizationBatch());
  cron.schedule("30 3 * * *", () => evaluateAlertRules());

  console.log("[worker] scheduled jobs registered, idling");
}

main().catch((err) => {
  console.error("[worker] fatal error during startup", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
