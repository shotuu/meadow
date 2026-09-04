/**
 * Job stubs matching the phased build order in the architecture plan.
 * Each becomes a real implementation in its listed phase — kept as explicit
 * no-ops until then rather than building ahead of the schema it depends on.
 */

import { prisma } from "@finance-app/db";
import { syncPlaidItem } from "@finance-app/plaid-sync";
import { syncIbkrFlexConfig } from "@finance-app/ibkr-sync";
import { syncFinverseConnection } from "@finance-app/finverse-sync";
import { runCategorizationBatchForAllUsers } from "@finance-app/categorization-ai";
import { recomputeRecurringSeriesForAllUsers } from "./recurring.js";
import { refreshExchangeRates as refreshExchangeRatesImpl } from "./exchange-rates.js";
import { evaluateAlertRulesForAllUsers } from "./alerts.js";

export async function syncPlaidAccounts(): Promise<void> {
  const items = await prisma.plaidItem.findMany({ where: { status: "active" } });
  for (const item of items) {
    try {
      const result = await syncPlaidItem(item.id);
      console.log(
        `[worker] syncPlaidAccounts: item ${item.id} — +${result.added} ~${result.modified} -${result.removed}`
      );
    } catch (err) {
      console.error(`[worker] syncPlaidAccounts: item ${item.id} failed`, err);
    }
  }
}

export async function syncIbkrFlexAccounts(): Promise<void> {
  const configs = await prisma.ibkrFlexConfig.findMany({ where: { status: "active" } });
  for (const config of configs) {
    try {
      const result = await syncIbkrFlexConfig(config.id);
      console.log(
        `[worker] syncIbkrFlexAccounts: config ${config.id} — ${result.holdings} holdings, ${result.transactions} transactions`
      );
    } catch (err) {
      console.error(`[worker] syncIbkrFlexAccounts: config ${config.id} failed`, err);
    }
  }
}

export async function syncFinverseAccounts(): Promise<void> {
  const connections = await prisma.finverseConnection.findMany({ where: { status: "active" } });
  for (const connection of connections) {
    try {
      const result = await syncFinverseConnection(connection.id);
      console.log(
        `[worker] syncFinverseAccounts: connection ${connection.id} — ${result.accounts} accounts, +${result.added} transactions`
      );
    } catch (err) {
      console.error(`[worker] syncFinverseAccounts: connection ${connection.id} failed`, err);
    }
  }
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
