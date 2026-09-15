import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const state = vi.hoisted(() => ({ userId: "", report: {} as object, cookies: new Map<string, string>(), ai: vi.fn(), finverseTransactions: [] as object[] }));
vi.mock("@/lib/session", () => ({ requireUserId: async () => state.userId }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (key: string) => state.cookies.has(key) ? { value: state.cookies.get(key) } : undefined,
  set: (key: string, value: string) => { state.cookies.set(key, value); },
}) }));
vi.mock("../../../../../packages/ibkr-sync/src/client", () => ({ fetchFlexStatement: async () => state.report }));
vi.mock("../../../../../packages/crypto/src/index", () => ({ decryptSecret: (value: string) => value }));
vi.mock("../../../../../packages/categorization-ai/node_modules/@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent: state.ai }; }, Type: { ARRAY: "ARRAY", OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER" },
}));

vi.mock("../../../../../packages/finverse-sync/src/client", () => ({
  callFinverse: async (operation: () => Promise<unknown>) => operation(),
  getFinverseLoginIdentityApi: () => ({
    refreshLoginIdentity: async () => ({}),
    getLoginIdentity: async () => ({ data: { login_identity: { status: "DATA_RETRIEVAL_COMPLETE" } } }),
    listAccounts: async () => ({ data: { accounts: [{ account_id: "provider-account", account_name: "Bank", account_currency: "USD" }] } }),
    listTransactionsByLoginIdentityId: async () => ({ data: { transactions: state.finverseTransactions, total_transactions: state.finverseTransactions.length } }),
  }),
}));

const url = process.env.MEADOW_TEST_DATABASE_URL;
if (url && (new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/meadow_sprint_test")) {
  throw new Error("Integration tests require the dedicated disposable localhost:55439/meadow_sprint_test database");
}
const integration = url ? describe : describe.skip;
const form = (values: Record<string, string>) => { const f = new FormData(); for (const [key, value] of Object.entries(values)) f.set(key, value); return f; };

integration("architecture regressions against PostgreSQL", () => {
  let db: (typeof import("@finance-app/db"))["prisma"];
  let actions: typeof import("../../app/(app)/transactions/actions");
  let planning: typeof import("../../app/(app)/planning/actions");
  let budgets: typeof import("../../app/(app)/budgets/actions");
  let alerts: typeof import("../../app/(app)/alerts/actions");
  let data: typeof import("@finance-app/finance-data");
  let foreignUser: string, accountId: string, categoryId: string, foreignCategory: string, foreignAccount: string;
  const users: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    db = (await import("@finance-app/db")).prisma;
    actions = await import("../../app/(app)/transactions/actions");
    planning = await import("../../app/(app)/planning/actions");
    budgets = await import("../../app/(app)/budgets/actions");
    alerts = await import("../../app/(app)/alerts/actions");
    data = await import("@finance-app/finance-data");
  });
  beforeEach(async () => {
    state.userId = `sprint-${randomUUID()}`; foreignUser = `sprint-${randomUUID()}`;
    for (const id of [state.userId, foreignUser]) {
      await db.user.create({ data: { id, profile: { create: {} } } }); users.push(id);
    }
    const account = await db.financialAccount.create({ data: { userId: state.userId, name: "Cash", currency: "USD", type: "checking", classification: "asset", syncSource: "manual" } });
    accountId = account.id;
    foreignAccount = (await db.financialAccount.create({ data: { userId: foreignUser, name: "Private", currency: "USD", type: "checking", classification: "asset", syncSource: "manual" } })).id;
    categoryId = (await db.category.create({ data: { userId: state.userId, name: "Food", kind: "expense", budgetType: "rollover_envelope" } })).id;
    foreignCategory = (await db.category.create({ data: { userId: foreignUser, name: "Private category", kind: "expense" } })).id;
    state.cookies.clear(); state.ai.mockReset();
  });
  afterAll(async () => {
    await db.oAuthLinkAttempt.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await (await import("@finance-app/db")).closeLockPool();
    await db.$disconnect();
  });

  it("rejects cross-user alert references and category assignments", async () => {
    await expect(alerts.createAlertRule(form({ ruleType: "low_balance", accountId: foreignAccount }))).rejects.toThrow();
    await expect(alerts.createAlertRule(form({ ruleType: "budget_over_target", categoryId: foreignCategory }))).rejects.toThrow();
    await expect(actions.createTransaction(form({ accountId, amount: "-10", description: "Food", date: "2026-09-01", categoryId: foreignCategory }))).rejects.toThrow();
    const tx = await db.transaction.create({ data: { userId: state.userId, accountId, amount: -10, currency: "USD", date: new Date(), description: "Food" } });
    await expect(actions.setTransactionCategory(tx.id, foreignCategory)).rejects.toThrow();
    expect(await db.alertRule.count({ where: { userId: state.userId } })).toBe(0);
  });

  it("keeps manual category provenance and creates reciprocal transfers atomically", async () => {
    const other = await db.financialAccount.create({ data: { userId: state.userId, name: "Savings", currency: "USD", type: "savings", classification: "asset", syncSource: "manual" } });
    await actions.createTransaction(form({ accountId, amount: "-20", description: "Move", date: "2026-09-01", isTransfer: "on", transferAccountId: other.id }));
    const rows = await db.transaction.findMany({ where: { userId: state.userId } });
    expect(rows).toHaveLength(2); expect(rows[0].transferPairId).toBe(rows[1].id); expect(rows[1].transferPairId).toBe(rows[0].id);
    await db.financialAccount.update({ where: { id: other.id }, data: { currency: "SGD" } });
    await expect(actions.createTransaction(form({ accountId, amount: "-20", description: "Move", date: "2026-09-01", isTransfer: "on", transferAccountId: other.id }))).rejects.toThrow("Cross-currency");
    expect(await db.transaction.count({ where: { userId: state.userId } })).toBe(2);
  });

  it("serializes concurrent payments and preserves excess funding", async () => {
    const o = await db.obligation.create({ data: { userId: state.userId, name: "Bill", amount: 100, currency: "USD", frequency: "monthly", nextDueDate: new Date("2026-09-15") } });
    await Promise.all([planning.markObligationPaid(form({ obligationId: o.id, amount: "60" })), planning.markObligationPaid(form({ obligationId: o.id, amount: "60" }))]);
    const paid = await db.obligation.findUniqueOrThrow({ where: { id: o.id } });
    expect(Number(paid.fundedAmount)).toBe(20); expect(paid.nextDueDate.toISOString().slice(0, 10)).toBe("2026-10-15");
  });

  it("uses historical allowances and transaction-day FX for rollover", async () => {
    const category = await db.category.findUniqueOrThrow({ where: { id: categoryId } });
    await db.budget.create({ data: { userId: state.userId, categoryId, amount: 100, currency: "USD", period: "monthly", effectiveFrom: new Date("2026-08-01"), effectiveTo: new Date("2026-08-31") } });
    const current = await db.budget.create({ data: { userId: state.userId, categoryId, amount: 120, currency: "USD", period: "monthly", effectiveFrom: new Date("2026-09-01") } });
    await db.exchangeRate.upsert({ where: { baseCurrency_quoteCurrency_asOfDate: { baseCurrency: "USD", quoteCurrency: "SGD", asOfDate: new Date("2026-08-01") } }, create: { baseCurrency: "USD", quoteCurrency: "SGD", rate: 2, asOfDate: new Date("2026-08-01"), source: "test" }, update: { rate: 2 } });
    await db.transaction.createMany({ data: [
      { userId: state.userId, accountId, categoryId, amount: -40, currency: "SGD", date: new Date("2026-08-15"), description: "August spend" },
      { userId: state.userId, accountId, categoryId, amount: -100, currency: "USD", date: new Date("2026-09-02"), description: "September spend" },
    ] });
    const progress = await data.computeRecurringBudgetProgress(state.userId, category, current, new Date("2026-09-15"));
    expect(progress.rolledOverAmount).toBe(80); expect(progress.remaining).toBe(100); expect(progress.spent).toBe(100);
  });

  it("does not create overlapping versions on repeated or concurrent budget edits", async () => {
    const input = { categoryId, amount: "120", currency: "USD", period: "monthly", rolloverEnabled: "on" };
    await Promise.all([budgets.setBudget(form(input)), budgets.setBudget(form(input))]);
    expect(await db.budget.count({ where: { categoryId, effectiveTo: null } })).toBe(1);
    expect(await db.budget.count({ where: { categoryId } })).toBe(1);
  });

  it("normalizes legacy and refreshed Plaid debt without losing lender credits", async () => {
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "plaid", type: "credit_card", classification: "liability", currentBalance: 1000, balanceAsOf: new Date() } });
    expect((await data.readAccountBalances(state.userId)).get(accountId)?.balance).toBe(-1000);
    await db.financialAccount.update({ where: { id: accountId }, data: { currentBalance: -1000, balanceIsCanonical: true } });
    expect((await data.readAccountBalances(state.userId)).get(accountId)?.balance).toBe(-1000);
    await db.financialAccount.update({ where: { id: accountId }, data: { currentBalance: 25, balanceIsCanonical: true } });
    expect((await data.readAccountBalances(state.userId)).get(accountId)?.balance).toBe(25);
  });

  it("low-balance alerts use the reported balance and reject foreign account reads", async () => {
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "plaid", currentBalance: 10000, balanceAsOf: new Date() } });
    await db.transaction.create({ data: { userId: state.userId, accountId, amount: -50, currency: "USD", date: new Date(), description: "Debit" } });
    await db.alertRule.createMany({ data: [
      { userId: state.userId, accountId, ruleType: "low_balance", config: { floor: 100 } },
      { userId: state.userId, accountId: foreignAccount, ruleType: "low_balance", config: { floor: 100 } },
    ] });
    await (await import("../../../../../apps/worker/src/jobs/alerts")).evaluateAlertRulesForAllUsers();
    expect(await db.alertEvent.count({ where: { userId: state.userId } })).toBe(0);
  });

  it("publishes sold and empty IBKR reports without reviving stale holdings", async () => {
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "ibkr_flex", type: "brokerage" } });
    const config = await db.ibkrFlexConfig.create({ data: { userId: state.userId, accountId, flexToken: "test", flexQueryId: "test" } });
    const { syncIbkrFlexConfig } = await import("../../../../../packages/ibkr-sync/src/sync");
    const position = (symbol: string, value: number) => ({ "@_symbol": symbol, "@_position": "1", "@_positionValue": String(value), "@_currency": "USD", "@_assetCategory": "STK" });
    state.report = { FlexStatements: { FlexStatement: { "@_toDate": "20260901", OpenPositions: { OpenPosition: position("SOLD", 100) } } } };
    await syncIbkrFlexConfig(config.id);
    state.report = { FlexStatements: { FlexStatement: { "@_toDate": "20260902", OpenPositions: { OpenPosition: position("CURRENT", 200) } } } };
    await syncIbkrFlexConfig(config.id);
    expect((await data.readAccountBalances(state.userId)).get(accountId)?.balance).toBe(200);
    state.report = { FlexStatements: { FlexStatement: { "@_toDate": "20260903", OpenPositions: "" } } };
    await syncIbkrFlexConfig(config.id);
    expect((await data.readAccountBalances(state.userId)).get(accountId)?.balance).toBe(0);
    expect(await db.investmentHolding.count({ where: { accountId, asOfDate: new Date("2026-09-01") } })).toBe(1);
  });

  it("does not emit resumed while a recurring series remains overdue", async () => {
    await db.transaction.createMany({ data: ["2026-01-01", "2026-02-01", "2026-03-01"].map((date) => ({ userId: state.userId, accountId, date: new Date(date), amount: -10, currency: "USD", description: "Subscription", merchantName: "Stream" })) });
    const { recomputeRecurringSeriesForUser } = await import("../../../../../apps/worker/src/jobs/recurring");
    await recomputeRecurringSeriesForUser(state.userId); await recomputeRecurringSeriesForUser(state.userId);
    expect(await db.recurringSeriesEvent.count({ where: { recurringSeries: { userId: state.userId }, eventType: "resumed" } })).toBe(0);
  });

  it("does not suggest reused investment deposits and removes stale pending matches", async () => {
    const invest = await db.investmentTransaction.create({ data: { accountId, tradeType: "deposit", amount: 100, currency: "USD", tradeDate: new Date() } });
    const linked = await db.transaction.create({ data: { userId: state.userId, accountId, amount: -100, currency: "USD", date: new Date(), description: "Linked", isTransfer: true, linkedInvestmentTransactionId: invest.id } });
    const candidate = await db.transferMatchCandidate.create({ data: { userId: state.userId, transactionId: linked.id, counterpartType: "investment_transaction", counterpartId: invest.id, confidenceScore: 1 } });
    await (await import("../../../../../apps/worker/src/jobs/transfer-matching")).matchTransfersForUser(state.userId);
    expect(await db.transferMatchCandidate.findUnique({ where: { id: candidate.id } })).toBeNull();
  });

  it("rejects absent, mismatched, expired, foreign-user and replayed OAuth states", async () => {
    const { createFinverseState, consumeFinverseState } = await import("../finverse-state");
    await expect(consumeFinverseState(state.userId, "")).rejects.toThrow();
    const nonce = await createFinverseState(state.userId);
    await expect(consumeFinverseState(state.userId, "wrong")).rejects.toThrow();
    await expect(consumeFinverseState(foreignUser, nonce)).rejects.toThrow();
    await consumeFinverseState(state.userId, nonce);
    await expect(consumeFinverseState(state.userId, nonce)).rejects.toThrow();
    const expired = await createFinverseState(state.userId);
    await db.oAuthLinkAttempt.updateMany({ where: { userId: state.userId }, data: { expiresAt: new Date(0) } });
    await expect(consumeFinverseState(state.userId, expired)).rejects.toThrow();
  });

  it("does not overwrite a manual edit made during AI inference", async () => {
    const tx = await db.transaction.create({ data: { userId: state.userId, accountId, amount: -10, currency: "USD", date: new Date(), description: "Coffee" } });
    state.ai.mockImplementation(async () => {
      await actions.setTransactionCategory(tx.id, categoryId);
      return { text: JSON.stringify([{ transactionId: tx.id, categoryId, confidence: 0.9 }]) };
    });
    await (await import("@finance-app/categorization-ai")).runCategorizationBatchForUser(state.userId);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: tx.id } })).categorySource).toBe("manual");
  });
  it("refreshes Finverse pending corrections while preserving manual categories", async () => {
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "finverse", externalAccountId: "provider-account" } });
    const connection = await db.finverseConnection.create({ data: { userId: state.userId, loginIdentityId: randomUUID(), accessToken: "test" } });
    const tx = await db.transaction.create({ data: { userId: state.userId, accountId, categoryId, categorySource: "manual", amount: -10, currency: "USD", date: new Date(), description: "Pending", pending: true, externalTransactionId: "provider-transaction" } });
    state.finverseTransactions = [{ transaction_id: "provider-transaction", account_id: "provider-account", amount: { value: -12, currency: "USD" }, posted_date: "2026-09-10", description: "Final", is_pending: false }];
    await (await import("@finance-app/finverse-sync")).syncFinverseConnection(connection.id);
    const updated = await db.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(Number(updated.amount)).toBe(-12); expect(updated.pending).toBe(false); expect(updated.categorySource).toBe("manual");
  });

  it("uses native holding currencies and marks missing historical FX as a gap", async () => {
    await db.exchangeRate.upsert({ where: { baseCurrency_quoteCurrency_asOfDate: { baseCurrency: "USD", quoteCurrency: "SGD", asOfDate: new Date("2026-08-01") } }, create: { baseCurrency: "USD", quoteCurrency: "SGD", rate: 2, asOfDate: new Date("2026-08-01"), source: "test" }, update: { rate: 2 } });
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "ibkr_flex", type: "brokerage" } });
    await db.investmentHolding.createMany({ data: [
      { accountId, symbol: "USD", currency: "USD", quantity: 1, marketValue: 100, securityType: "STK", asOfDate: new Date("2026-08-02") },
      { accountId, symbol: "SGD", currency: "SGD", quantity: 1, marketValue: 100, securityType: "STK", asOfDate: new Date("2026-08-02") },
      { accountId, symbol: "OLD", currency: "SGD", quantity: 1, marketValue: 100, securityType: "STK", asOfDate: new Date("2020-01-01") },
    ] });
    expect((await data.readAccountBalances(state.userId)).get(accountId)?.balance).toBe(150);
    const history = await data.readPortfolioHistory(state.userId, "USD");
    expect(history[0].value).toBeNull(); expect(history[1].value).toBe(150);
    await (await import("@finance-app/balance-snapshots")).snapshotAccountBalancesForUser(state.userId);
    const snapshot = await db.accountBalanceSnapshot.findFirstOrThrow({ where: { accountId } });
    expect(snapshot.isComplete).toBe(false); expect(snapshot.valuationVersion).toBe(2);
    expect(snapshot.sourceAsOf?.toISOString().slice(0, 10)).toBe("2026-08-02");
  });

  it("rotates AI none results so older uncategorized transactions are not starved", async () => {
    await db.transaction.createMany({ data: Array.from({ length: 51 }, (_, index) => ({ userId: state.userId, accountId, amount: -10, currency: "USD", date: new Date(), description: `Unknown ${index}` })) });
    const seen = new Set<string>();
    state.ai.mockImplementation(async (request: { contents: string }) => {
      const payload = JSON.parse(request.contents) as { transactions: { id: string }[] };
      payload.transactions.forEach((t) => seen.add(t.id));
      return { text: JSON.stringify(payload.transactions.map((t) => ({ transactionId: t.id, categoryId: "none", confidence: 0 }))) };
    });
    const { runCategorizationBatchForUser } = await import("@finance-app/categorization-ai");
    await runCategorizationBatchForUser(state.userId); await runCategorizationBatchForUser(state.userId);
    expect(seen.size).toBe(51);
  });

  it("relays form_post without exchanging a code before state validation", async () => {
    process.env.AUTH_URL = "http://localhost:3000";
    const callback = await import("../../app/(app)/finverse-oauth-callback/route");
    const response = await callback.POST(new Request("http://localhost:3000/finverse-oauth-callback", { method: "POST", body: form({ code: "test-code", state: "wrong-state" }) }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/finverse-oauth-callback");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    state.cookies.set("finverse-link-response", JSON.stringify({ code: "test-code", state: "wrong-state" }));
    const get = await callback.GET();
    expect(get.headers.get("location")).toContain("finverse=error");
    expect(await db.finverseConnection.count({ where: { userId: state.userId } })).toBe(0);
  });

  it("never leaks provider credentials or internal ids, and buckets recent vs. older transactions correctly", async () => {
    const fakeAccessToken = `plaid-secret-${randomUUID()}`;
    const plaidItem = await db.plaidItem.create({
      data: { userId: state.userId, plaidItemId: randomUUID(), accessToken: fakeAccessToken, institutionName: "Test Bank" },
    });
    await db.budget.create({ data: { userId: state.userId, categoryId, amount: 100, currency: "USD", period: "monthly", effectiveFrom: new Date("2026-09-01") } });
    await db.accountBalanceSnapshot.create({
      data: { userId: state.userId, accountId, asOfDate: new Date(), balance: 500, currency: "USD", method: "transaction_sum" },
    });
    const recentDate = new Date(); recentDate.setDate(recentDate.getDate() - 30);
    const olderDate = new Date(); olderDate.setDate(olderDate.getDate() - 400);
    const recentTx = await db.transaction.create({ data: { userId: state.userId, accountId, categoryId, amount: -12.34, currency: "USD", date: recentDate, description: "Recent purchase" } });
    const olderTx = await db.transaction.create({ data: { userId: state.userId, accountId, categoryId, amount: -56.78, currency: "USD", date: olderDate, description: "Old purchase" } });

    const { buildAiFinancialContextExport } = await import("../ai-export/build-export");
    const result = await buildAiFinancialContextExport();
    const serialized = JSON.stringify(result);

    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(serialized).not.toContain(fakeAccessToken);
    for (const leakedId of [state.userId, accountId, categoryId, recentTx.id, olderTx.id, plaidItem.id]) {
      expect(serialized).not.toContain(leakedId);
    }

    expect(result.transactions.recent.some((t) => t.description === "Recent purchase")).toBe(true);
    expect(result.transactions.recent.some((t) => t.description === "Old purchase")).toBe(false);
    const olderSummary = result.transactions.olderMonthlySummaries.find((s) => s.month === olderDate.toISOString().slice(0, 7) && s.categoryPath === "Food");
    expect(olderSummary?.totalsByCurrency.USD).toBe("-56.78");
  });

});
