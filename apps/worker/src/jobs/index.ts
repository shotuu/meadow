import { prisma } from "@finance-app/db";
import { syncPlaidItem } from "@finance-app/plaid-sync";
import { syncIbkrFlexConfig } from "@finance-app/ibkr-sync";
import { syncFinverseConnection } from "@finance-app/finverse-sync";
import { runCategorizationBatchForAllUsers } from "@finance-app/categorization-ai";
import { snapshotAccountBalancesForAllUsers } from "@finance-app/balance-snapshots";
import { recomputeRecurringSeriesForAllUsers } from "./recurring.js";
import { refreshExchangeRates as refreshExchangeRatesImpl } from "./exchange-rates.js";
import { evaluateAlertRulesForAllUsers } from "./alerts.js";
import { matchTransfersForAllUsers } from "./transfer-matching.js";

export async function syncPlaidAccounts(): Promise<void> {
  const items = await prisma.plaidItem.findMany({ where: { status: "active" } });
  const failures: unknown[] = [];
  for (const item of items) {
    try {
      const result = await syncPlaidItem(item.id);
      console.log(
        `[worker] syncPlaidAccounts: item ${item.id} — +${result.added} ~${result.modified} -${result.removed}`
      );
    } catch (err) {
      failures.push(err);
      console.error(`[worker] syncPlaidAccounts: item ${item.id} failed`, err);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Provider sync incomplete");
}

export async function syncIbkrFlexAccounts(): Promise<void> {
  const configs = await prisma.ibkrFlexConfig.findMany({ where: { status: "active" } });
  const failures: unknown[] = [];
  for (const config of configs) {
    try {
      const result = await syncIbkrFlexConfig(config.id);
      console.log(
        `[worker] syncIbkrFlexAccounts: config ${config.id} — ${result.holdings} holdings, ${result.transactions} transactions`
      );
    } catch (err) {
      failures.push(err);
      console.error(`[worker] syncIbkrFlexAccounts: config ${config.id} failed`, err);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Provider sync incomplete");
}

export async function syncFinverseAccounts(): Promise<void> {
  const connections = await prisma.finverseConnection.findMany({ where: { status: "active" } });
  const failures: unknown[] = [];
  for (const connection of connections) {
    try {
      const result = await syncFinverseConnection(connection.id);
      console.log(
        `[worker] syncFinverseAccounts: connection ${connection.id} — ${result.accounts} accounts, +${result.added} transactions`
      );
    } catch (err) {
      failures.push(err);
      console.error(`[worker] syncFinverseAccounts: connection ${connection.id} failed`, err);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Provider sync incomplete");
}

export async function runCategorizationBatch(): Promise<void> {
  await runCategorizationBatchForAllUsers();
  console.log("[worker] runCategorizationBatch: done");
}

export async function recomputeRecurringSeries(): Promise<void> {
  await recomputeRecurringSeriesForAllUsers();
  console.log("[worker] recomputeRecurringSeries: done");
}

export async function evaluateAlertRules(): Promise<void> {
  await evaluateAlertRulesForAllUsers();
  console.log("[worker] evaluateAlertRules: done");
}

export async function refreshExchangeRates(): Promise<void> {
  await refreshExchangeRatesImpl();
}

export async function computeBalanceSnapshots(): Promise<void> {
  await snapshotAccountBalancesForAllUsers();
  console.log("[worker] computeBalanceSnapshots: done");
}

export async function matchTransfers(): Promise<void> {
  await matchTransfersForAllUsers();
  console.log("[worker] matchTransfers: done");
}
