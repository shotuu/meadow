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

  it("captures IBKR subCategory on sync, and a manual instrument-type override survives repeated re-syncs", async () => {
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "ibkr_flex", type: "brokerage" } });
    const config = await db.ibkrFlexConfig.create({ data: { userId: state.userId, accountId, flexToken: "test", flexQueryId: "test" } });
    const { syncIbkrFlexConfig } = await import("../../../../../packages/ibkr-sync/src/sync");
    const { classifyInstrumentType } = await import("../../../../../packages/finance-logic/src/instrument-classification");
    const position = (symbol: string, subCategory: string) => ({ "@_symbol": symbol, "@_position": "1", "@_positionValue": "1000", "@_currency": "USD", "@_assetCategory": "STK", "@_subCategory": subCategory });
    state.report = { FlexStatements: { FlexStatement: { "@_toDate": "20260901", OpenPositions: { OpenPosition: position("IMID", "ETF") } } } };
    await syncIbkrFlexConfig(config.id);

    const synced = await db.investmentHolding.findFirst({ where: { accountId, symbol: "IMID" } });
    expect(synced?.ibkrSubCategory).toBe("ETF");

    // The user manually corrects it (e.g. IBKR briefly reports it oddly) --
    // this table has no relation to InvestmentHolding at all, so a sync has
    // no code path that could touch it.
    await db.instrumentTypeOverride.create({ data: { userId: state.userId, symbol: "IMID", instrumentType: "fund" } });

    state.report = { FlexStatements: { FlexStatement: { "@_toDate": "20260902", OpenPositions: { OpenPosition: position("IMID", "ETF") } } } };
    await syncIbkrFlexConfig(config.id);
    state.report = { FlexStatements: { FlexStatement: { "@_toDate": "20260903", OpenPositions: { OpenPosition: position("IMID", "ETF") } } } };
    await syncIbkrFlexConfig(config.id);

    const override = await db.instrumentTypeOverride.findUnique({ where: { userId_symbol: { userId: state.userId, symbol: "IMID" } } });
    expect(override?.instrumentType).toBe("fund");

    const latest = await db.investmentHolding.findFirst({ where: { accountId, symbol: "IMID" }, orderBy: { asOfDate: "desc" } });
    const classification = classifyInstrumentType({ ibkrAssetCategory: latest!.securityType, ibkrSubCategory: latest!.ibkrSubCategory, manualOverride: override?.instrumentType ?? null });
    expect(classification).toEqual({ instrumentType: "fund", source: "manual_override", confidence: 1 });
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
    const result = await buildAiFinancialContextExport("standard");
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

    // No CashReserve/Obligation rows exist for this user -- must report
    // unknown, never a confident-looking number (the highest-priority fix
    // in the v2 export revision).
    expect(result.cashPolicy.calculationComplete).toBe(false);
    expect(result.cashPolicy.investableCashByCurrency.USD).toBeNull();
    expect(result.cashPolicy.uncommittedCashByCurrency.USD).toBeNull();
    expect(result.cashPolicy.notes.USD).toBeTruthy();
    expect(typeof result.cashPolicy.cashByCurrency.USD).toBe("number");
  });

  it("computes cash policy once configured, and flags a same-account refund pair with confidence", async () => {
    await db.cashReserve.create({ data: { userId: state.userId, name: "Emergency fund", currency: "USD", targetAmount: 200, minimumAmount: 100 } });

    const chargeDate = new Date(); chargeDate.setDate(chargeDate.getDate() - 10);
    const refundDate = new Date(); refundDate.setDate(refundDate.getDate() - 8);
    await db.transaction.create({ data: { userId: state.userId, accountId, amount: -40, currency: "USD", date: chargeDate, description: "Store purchase" } });
    await db.transaction.create({ data: { userId: state.userId, accountId, amount: 40, currency: "USD", date: refundDate, description: "Store refund" } });

    const { buildAiFinancialContextExport } = await import("../ai-export/build-export");
    const result = await buildAiFinancialContextExport("standard");

    expect(result.cashPolicy.calculationComplete).toBe(true);
    expect(result.cashPolicy.investableCashByCurrency.USD).not.toBeNull();

    const charge = result.transactions.recent.find((t) => t.description === "Store purchase");
    const refund = result.transactions.recent.find((t) => t.description === "Store refund");
    expect(charge?.isReversal).toBe(true);
    expect(refund?.isRefund).toBe(true);
    expect(charge?.relationshipConfidence).toBeGreaterThan(0);
    expect(refund?.linkedTransactionDate).toBe(chargeDate.toISOString().slice(0, 10));
  });

  it("redacts reference numbers and omits notes in privacy_safe mode, but keeps them in standard mode", async () => {
    const txDate = new Date();
    await db.transaction.create({
      data: { userId: state.userId, accountId, amount: -25, currency: "USD", date: txDate, description: "UCLA PAYROLL DEP 000482910334", notes: "personal note" },
    });

    const { buildAiFinancialContextExport } = await import("../ai-export/build-export");
    const safe = await buildAiFinancialContextExport("privacy_safe");
    const full = await buildAiFinancialContextExport("standard");

    const safeTx = safe.transactions.recent.find((t) => t.description.startsWith("UCLA PAYROLL"));
    const fullTx = full.transactions.recent.find((t) => t.description.startsWith("UCLA PAYROLL"));
    expect(safeTx?.description).toBe("UCLA PAYROLL DEP [redacted]");
    expect(safeTx?.notes).toBeNull();
    expect(fullTx?.description).toBe("UCLA PAYROLL DEP 000482910334");
    expect(fullTx?.notes).toBe("personal note");
  });

  it("retires a legacy Stocks target when saving Core/Satellite via saveTargetAllocations, leaving an active total of 100%", async () => {
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "ibkr_flex", type: "brokerage" } });
    await db.investmentHolding.createMany({
      data: [
        { accountId, symbol: "AAPL", securityType: "STK", ibkrSubCategory: "COMMON", quantity: 10, marketValue: 900, currency: "USD", asOfDate: new Date() },
        { accountId, symbol: "BND", securityType: "STK", ibkrSubCategory: "COMMON", quantity: 10, marketValue: 100, currency: "USD", asOfDate: new Date() },
      ],
    });
    await db.holdingBucketAssignment.createMany({
      data: [
        { userId: state.userId, symbol: "AAPL", bucketName: "Core" },
        { userId: state.userId, symbol: "BND", bucketName: "Satellite" },
      ],
    });
    // The exact legacy shape reported: a target literally named after an
    // instrument type, predating the Core/Satellite strategy-bucket system.
    await db.targetAllocation.create({ data: { userId: state.userId, bucketName: "Stocks", targetWeightPct: 100, driftThresholdPct: 5 } });

    const invest = await import("../../app/(app)/invest/actions");
    await invest.saveTargetAllocations(
      form({
        rows: JSON.stringify([
          { bucketName: "Core", targetWeightPct: 90, driftThresholdPct: 5 },
          { bucketName: "Satellite", targetWeightPct: 10, driftThresholdPct: 5 },
        ]),
      })
    );

    const targets = await db.targetAllocation.findMany({ where: { userId: state.userId } });
    expect(targets.map((t) => t.bucketName).sort()).toEqual(["Core", "Satellite"]);
    expect(targets.reduce((sum, t) => sum + Number(t.targetWeightPct), 0)).toBe(100);
  });

  it("preserves a custom strategy bucket literally named after an instrument-type label when it's genuinely in use", async () => {
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "ibkr_flex", type: "brokerage" } });
    await db.investmentHolding.create({
      data: { accountId, symbol: "TLT", securityType: "STK", ibkrSubCategory: "COMMON", quantity: 10, marketValue: 500, currency: "USD", asOfDate: new Date() },
    });
    // The user's own real strategy bucket is literally called "Bonds" --
    // collides with an instrument-type label by name only, must survive.
    await db.holdingBucketAssignment.create({ data: { userId: state.userId, symbol: "TLT", bucketName: "Bonds" } });
    await db.targetAllocation.create({ data: { userId: state.userId, bucketName: "Bonds", targetWeightPct: 50, driftThresholdPct: 5 } });

    const invest = await import("../../app/(app)/invest/actions");
    await invest.saveTargetAllocations(form({ rows: JSON.stringify([{ bucketName: "Bonds", targetWeightPct: 60, driftThresholdPct: 5 }]) }));

    const target = await db.targetAllocation.findUniqueOrThrow({ where: { userId_bucketName: { userId: state.userId, bucketName: "Bonds" } } });
    expect(Number(target.targetWeightPct)).toBe(60);
  });

  it("excludes a legacy Stocks target from AI export targets/drift without hiding it, and lets a stale worker alert resolve", async () => {
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "ibkr_flex", type: "brokerage" } });
    await db.investmentHolding.create({
      data: { accountId, symbol: "AAPL", securityType: "STK", ibkrSubCategory: "COMMON", quantity: 10, marketValue: 1000, currency: "USD", asOfDate: new Date() },
    });
    await db.holdingBucketAssignment.create({ data: { userId: state.userId, symbol: "AAPL", bucketName: "Core" } });
    await db.targetAllocation.createMany({
      data: [
        { userId: state.userId, bucketName: "Stocks", targetWeightPct: 100, driftThresholdPct: 5 },
        { userId: state.userId, bucketName: "Core", targetWeightPct: 90, driftThresholdPct: 5 },
      ],
    });

    // Simulate the exact reported symptom: a "Stocks has drifted" alert
    // already open from before this fix, which never used to resolve.
    const rule = await db.alertRule.create({ data: { userId: state.userId, ruleType: "portfolio_drift", config: {}, isActive: true } });
    await db.alertEvent.create({
      data: {
        alertRuleId: rule.id,
        userId: state.userId,
        severity: "warning",
        title: "Stocks has drifted from target",
        message: "stale",
        relatedEntityType: "target_allocation",
        relatedEntityId: `${state.userId}:Stocks`,
      },
    });

    const { buildAiFinancialContextExport } = await import("../ai-export/build-export");
    const result = await buildAiFinancialContextExport("standard");

    expect(result.investments.strategyAllocation.targets.map((t) => t.bucketName)).toEqual(["Core"]);
    expect(result.investments.strategyAllocation.targets.reduce((sum, t) => sum + t.targetWeightPct, 0)).toBe(90);
    expect(result.investments.strategyAllocation.drift.some((d) => d.bucketName === "Stocks")).toBe(false);
    expect(result.investments.strategyAllocation.legacyTargets.map((t) => t.bucketName)).toEqual(["Stocks"]);
    expect(result.calculationWarnings.some((w) => w.includes("Stocks"))).toBe(true);
    expect(result.financialPlan.portfolioTargets.map((t) => t.bucketName)).toEqual(["Core"]);
    expect(result.dataCoverage.hasTargetAllocation).toBe(true);

    await (await import("../../../../../apps/worker/src/jobs/alerts")).evaluateAlertRulesForAllUsers();
    const stillOpenForStocks = await db.alertEvent.findFirst({
      where: { userId: state.userId, relatedEntityType: "target_allocation", relatedEntityId: `${state.userId}:Stocks`, resolvedAt: null },
    });
    expect(stillOpenForStocks).toBeNull();
  });

  it("hardens privacy-safe redaction: P2P counterparties, the account holder's own name, and account-number suffixes, without erasing merchants", async () => {
    await db.user.update({ where: { id: state.userId }, data: { name: "Jane Student" } });
    const bofaOne = await db.financialAccount.create({
      data: { userId: state.userId, name: "Adv SafeBalance Checking 3106", institutionName: "Bank of America", currency: "USD", type: "checking", classification: "asset", syncSource: "manual" },
    });
    const bofaTwo = await db.financialAccount.create({
      data: { userId: state.userId, name: "Adv SafeBalance Checking 8842", institutionName: "Bank of America", currency: "USD", type: "checking", classification: "asset", syncSource: "manual" },
    });
    await db.transaction.createMany({
      data: [
        { userId: state.userId, accountId: bofaOne.id, amount: 500, currency: "USD", date: new Date(), description: "Zelle payment from JANE DOE Conf# 000482910334" },
        { userId: state.userId, accountId: bofaOne.id, amount: -50, currency: "USD", date: new Date(), description: "UCLA PAYROLL DEP JANE STUDENT 000482910335", merchantName: "UCLA" },
        { userId: state.userId, accountId: bofaTwo.id, amount: -9.99, currency: "USD", date: new Date(), description: "APPLE.COM/BILL", merchantName: "Apple" },
        { userId: state.userId, accountId: bofaTwo.id, amount: -12, currency: "USD", date: new Date(), description: "SPOTIFY USA", merchantName: "Spotify" },
      ],
    });
    await db.cashReserve.create({ data: { userId: state.userId, name: "Reserve", currency: "USD", targetAmount: 100, accountId: bofaOne.id } });

    const { buildAiFinancialContextExport } = await import("../ai-export/build-export");
    const safe = await buildAiFinancialContextExport("privacy_safe");
    const full = await buildAiFinancialContextExport("standard");
    const serializedSafe = JSON.stringify(safe);

    // Removed: real last-four digits, the P2P counterparty's name, and the
    // account holder's own name.
    expect(serializedSafe).not.toContain("3106");
    expect(serializedSafe).not.toContain("8842");
    expect(serializedSafe).not.toContain("JANE DOE");
    expect(serializedSafe).not.toContain("JANE STUDENT");
    expect(serializedSafe).toContain("[person]");
    expect(serializedSafe).toContain("[account holder]");

    // Preserved: ordinary merchant identity.
    expect(serializedSafe).toContain("Apple");
    expect(serializedSafe).toContain("Spotify");
    expect(serializedSafe).toContain("UCLA");

    // Two accounts that collide once their suffix is stripped get
    // deterministic, non-sensitive aliases -- never the real last-four.
    const safeBofaLabels = safe.accounts.filter((a) => a.institutionName === "Bank of America").map((a) => a.label).sort();
    expect(safeBofaLabels).toEqual(["Bank of America — Adv SafeBalance Checking 1", "Bank of America — Adv SafeBalance Checking 2"]);
    const safeReserve = safe.cashReserves.find((r) => r.name === "Reserve");
    expect(safeReserve?.scope).toMatch(/^account:Bank of America — Adv SafeBalance Checking [12]$/);

    // Standard (non-privacy) mode is never weakened by any of this.
    const fullBofaLabels = full.accounts.filter((a) => a.institutionName === "Bank of America").map((a) => a.label).sort();
    expect(fullBofaLabels).toEqual(["Bank of America — Adv SafeBalance Checking 3106", "Bank of America — Adv SafeBalance Checking 8842"]);
    expect(JSON.stringify(full)).toContain("JANE DOE");
  });

  it("keeps brokerage cash separate from strategy buckets and instrumentType separate from strategyBucket", async () => {
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "ibkr_flex", type: "brokerage" } });
    await db.investmentHolding.createMany({
      data: [
        { accountId, symbol: "AAPL", securityType: "STK", ibkrSubCategory: "COMMON", quantity: 10, marketValue: 800, currency: "USD", asOfDate: new Date() },
        { accountId, symbol: "USD", securityType: "CASH", quantity: 200, marketValue: 200, currency: "USD", asOfDate: new Date() },
      ],
    });
    await db.holdingBucketAssignment.create({ data: { userId: state.userId, symbol: "AAPL", bucketName: "Core" } });
    await db.targetAllocation.create({ data: { userId: state.userId, bucketName: "Core", targetWeightPct: 100, driftThresholdPct: 5 } });

    const { buildAiFinancialContextExport } = await import("../ai-export/build-export");
    const result = await buildAiFinancialContextExport("standard");

    // The cash holding never appears as a strategy-allocation bucket...
    expect(result.investments.strategyAllocation.current.map((c) => c.bucketName)).toEqual(["Core"]);
    expect(result.investments.strategyAllocation.current[0].currentWeightPct).toBe(100);
    // ...it's reported separately instead, at its real value.
    expect(result.investments.brokerageCashInDefaultCurrencyApprox).toBe(200);

    // instrumentType (a fact about the security) and strategyBucket (the
    // user's own policy choice) are independent fields on the same holding.
    const cashHolding = result.investments.holdings.find((h) => h.symbol === "USD")!;
    expect(cashHolding.instrumentType).toBe("cash");
    expect(cashHolding.strategyBucket).toBe("Unclassified");
    const aaplHolding = result.investments.holdings.find((h) => h.symbol === "AAPL")!;
    expect(aaplHolding.instrumentType).toBe("stock");
    expect(aaplHolding.strategyBucket).toBe("Core");
  });

  it("does not crash export generation when a holding's currency has no exchange rate, and reports the gap explicitly", async () => {
    await db.financialAccount.update({ where: { id: accountId }, data: { syncSource: "ibkr_flex", type: "brokerage" } });
    await db.investmentHolding.create({
      data: { accountId, symbol: "OBSCURE", securityType: "STK", ibkrSubCategory: "COMMON", quantity: 5, marketValue: 500, currency: "XAU", asOfDate: new Date() },
    });
    await db.targetAllocation.create({ data: { userId: state.userId, bucketName: "Core", targetWeightPct: 100, driftThresholdPct: 5 } });

    const { buildAiFinancialContextExport } = await import("../ai-export/build-export");
    await expect(buildAiFinancialContextExport("standard")).resolves.not.toThrow();
    const result = await buildAiFinancialContextExport("standard");
    expect(result.calculationWarnings.some((w) => w.toLowerCase().includes("couldn't be converted"))).toBe(true);
  });

  it("never generates recommendation/advice prose -- only facts and limitations", async () => {
    await db.targetAllocation.create({ data: { userId: state.userId, bucketName: "Stocks", targetWeightPct: 100, driftThresholdPct: 5 } });
    await db.cashReserve.create({ data: { userId: state.userId, name: "Reserve", currency: "USD", targetAmount: 100 } });

    const { buildAiFinancialContextExport } = await import("../ai-export/build-export");
    const result = await buildAiFinancialContextExport("standard");

    const prose = [...result.calculationWarnings, result.financialPlan.note, result.meta.exportNote, ...result.meta.knownDataGaps].join(" \n ");
    const adviceLike = /\b(should|recommend|consider (?!it)|you ought|advise|suggest investing|better to)\b/i;
    expect(prose).not.toMatch(adviceLike);
  });

});
