import { prisma, type AlertRule, type BudgetPeriod } from "@finance-app/db";
import { getPeriodRange, countPeriodsUntil } from "@finance-app/finance-logic";

/**
 * Sweeps every active AlertRule and evaluates the ones with a real signal to
 * check against. `portfolio_drift` is deliberately left unevaluated — it
 * needs InvestmentHolding/TargetAllocation data that Phase 3 (IBKR) hasn't
 * built yet, so there's nothing real to compare against; evaluating it
 * would mean fabricating a result, not implementing a feature.
 */
export async function evaluateAlertRulesForAllUsers(): Promise<void> {
  const rules = await prisma.alertRule.findMany({ where: { isActive: true } });
  for (const rule of rules) {
    try {
      await evaluateRule(rule);
    } catch (err) {
      console.error(`[worker] evaluateAlertRules: rule ${rule.id} (${rule.ruleType}) failed`, err);
    }
  }
}

async function evaluateRule(rule: AlertRule): Promise<void> {
  switch (rule.ruleType) {
    case "budget_over_target":
      return evaluateBudgetOverTarget(rule);
    case "low_balance":
    case "emergency_fund_below_floor":
      return evaluateLowBalance(rule);
    case "large_transaction":
      return evaluateLargeTransaction(rule);
    case "recurring_missed":
      return evaluateRecurringStatus(rule, "missed");
    case "recurring_amount_changed":
      return evaluateRecurringStatus(rule, "amount_changed");
    case "sinking_fund_underfunded":
      return evaluateSinkingFundUnderfunded(rule);
    case "portfolio_drift":
      return; // no investment-holdings data to evaluate against yet (Phase 3)
  }
}

async function createAlertIfNotOpen(params: {
  userId: string;
  alertRuleId: string;
  severity: string;
  title: string;
  message: string;
  relatedEntityType: string;
  relatedEntityId: string;
}): Promise<void> {
  const existing = await prisma.alertEvent.findFirst({
    where: {
      alertRuleId: params.alertRuleId,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      resolvedAt: null,
    },
  });
  if (existing) return;
  await prisma.alertEvent.create({ data: params });
}

async function autoResolveOpen(
  alertRuleId: string,
  relatedEntityType: string,
  relatedEntityId: string
): Promise<void> {
  await prisma.alertEvent.updateMany({
    where: { alertRuleId, relatedEntityType, relatedEntityId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}

async function evaluateBudgetOverTarget(rule: AlertRule): Promise<void> {
  if (!rule.categoryId) return;
  const config = rule.config as { thresholdPct?: number };
  const thresholdPct = config.thresholdPct ?? 100;

  const [budget, category] = await Promise.all([
    prisma.budget.findFirst({ where: { userId: rule.userId, categoryId: rule.categoryId, effectiveTo: null } }),
    prisma.category.findUnique({ where: { id: rule.categoryId } }),
  ]);
  if (!budget || !category) return;

  const { start, end } = getPeriodRange(budget.period as BudgetPeriod, new Date());
  const spent = await prisma.transaction.aggregate({
    where: { userId: rule.userId, categoryId: rule.categoryId, isTransfer: false, date: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  const spentAmount = Math.abs(Number(spent._sum.amount ?? 0));
  const budgetAmount = Number(budget.amount);
  const pctUsed = budgetAmount === 0 ? 0 : (spentAmount / budgetAmount) * 100;

  if (pctUsed >= thresholdPct) {
    await createAlertIfNotOpen({
      userId: rule.userId,
      alertRuleId: rule.id,
      severity: pctUsed >= 100 ? "critical" : "warning",
      title: `${category.name} is ${Math.round(pctUsed)}% spent`,
      message: `${spentAmount.toFixed(2)} of ${budgetAmount.toFixed(2)} ${budget.currency} spent this ${budget.period} period.`,
      relatedEntityType: "category",
      relatedEntityId: rule.categoryId,
    });
  } else {
    await autoResolveOpen(rule.id, "category", rule.categoryId);
  }
}

async function evaluateLowBalance(rule: AlertRule): Promise<void> {
  if (!rule.accountId) return;
  const config = rule.config as { floor: number };
  const account = await prisma.financialAccount.findUnique({
    where: { id: rule.accountId },
    include: { transactions: { select: { amount: true } } },
  });
  if (!account) return;

  const balance = account.transactions.reduce((sum, t) => sum + Number(t.amount), 0);

  if (balance < config.floor) {
    await createAlertIfNotOpen({
      userId: rule.userId,
      alertRuleId: rule.id,
      severity: "warning",
      title: `${account.name} is below ${config.floor} ${account.currency}`,
      message: `Current balance: ${balance.toFixed(2)} ${account.currency}.`,
      relatedEntityType: "account",
      relatedEntityId: rule.accountId,
    });
  } else {
    await autoResolveOpen(rule.id, "account", rule.accountId);
  }
}

async function evaluateLargeTransaction(rule: AlertRule): Promise<void> {
  const config = rule.config as { threshold: number };
  const candidates = await prisma.transaction.findMany({
    where: {
      userId: rule.userId,
      isTransfer: false,
      ...(rule.accountId ? { accountId: rule.accountId } : {}),
      ...(rule.categoryId ? { categoryId: rule.categoryId } : {}),
      amount: { lte: -Math.abs(config.threshold) },
    },
    orderBy: { date: "desc" },
    take: 50,
  });

  for (const tx of candidates) {
    // One-time event alert — even if later resolved, never re-fire for the
    // same transaction, unlike the state-based rules above.
    const existing = await prisma.alertEvent.findFirst({
      where: { alertRuleId: rule.id, relatedEntityType: "transaction", relatedEntityId: tx.id },
    });
    if (existing) continue;

    await prisma.alertEvent.create({
      data: {
        userId: rule.userId,
        alertRuleId: rule.id,
        severity: "info",
        title: `Large transaction: ${tx.description}`,
        message: `${Math.abs(Number(tx.amount)).toFixed(2)} ${tx.currency} exceeded your ${config.threshold} threshold.`,
        relatedEntityType: "transaction",
        relatedEntityId: tx.id,
      },
    });
  }
}

async function evaluateRecurringStatus(rule: AlertRule, status: "missed" | "amount_changed"): Promise<void> {
  const series = await prisma.recurringSeries.findMany({
    where: { userId: rule.userId, status, ...(rule.categoryId ? { categoryId: rule.categoryId } : {}) },
  });

  for (const s of series) {
    await createAlertIfNotOpen({
      userId: rule.userId,
      alertRuleId: rule.id,
      severity: status === "missed" ? "warning" : "info",
      title: status === "missed" ? `Missed recurring charge: ${s.merchantKey}` : `Amount changed: ${s.merchantKey}`,
      message:
        status === "missed"
          ? `Expected around ${s.nextExpectedDate?.toDateString() ?? "?"}, last seen ${s.lastSeenDate.toDateString()}.`
          : `New expected amount: ${Number(s.expectedAmount).toFixed(2)} ${s.currency}.`,
      relatedEntityType: "recurring_series",
      relatedEntityId: s.id,
    });
  }

  // A series that's no longer in this status (resumed, or reverted to
  // active) should have its open alert auto-resolved.
  const stillTriggered = new Set(series.map((s) => s.id));
  const openAlerts = await prisma.alertEvent.findMany({
    where: { alertRuleId: rule.id, relatedEntityType: "recurring_series", resolvedAt: null },
  });
  for (const alert of openAlerts) {
    if (alert.relatedEntityId && !stillTriggered.has(alert.relatedEntityId)) {
      await prisma.alertEvent.update({ where: { id: alert.id }, data: { resolvedAt: new Date() } });
    }
  }
}

async function evaluateSinkingFundUnderfunded(rule: AlertRule): Promise<void> {
  const config = rule.config as { warningPeriods?: number };
  const warningPeriods = config.warningPeriods ?? 1;

  const funds = await prisma.sinkingFund.findMany({
    where: { userId: rule.userId, ...(rule.categoryId ? { categoryId: rule.categoryId } : {}) },
  });

  const now = new Date();
  for (const fund of funds) {
    const remaining = Number(fund.targetAmount) - Number(fund.currentBalance);
    const entityId = fund.id;

    if (remaining <= 0) {
      await autoResolveOpen(rule.id, "sinking_fund", entityId);
      continue;
    }

    // Fixed "monthly" assumption for the pacing check — matches the same
    // simplification the budgets page uses for computeRequiredContribution.
    const periodsRemaining = countPeriodsUntil("monthly", now, fund.deadlineDate);

    if (periodsRemaining <= warningPeriods) {
      await createAlertIfNotOpen({
        userId: rule.userId,
        alertRuleId: rule.id,
        severity: "warning",
        title: `${fund.name} is underfunded`,
        message: `${remaining.toFixed(2)} ${fund.currency} still needed with ${periodsRemaining} month(s) left until ${fund.deadlineDate.toDateString()}.`,
        relatedEntityType: "sinking_fund",
        relatedEntityId: entityId,
      });
    } else {
      await autoResolveOpen(rule.id, "sinking_fund", entityId);
    }
  }
}
