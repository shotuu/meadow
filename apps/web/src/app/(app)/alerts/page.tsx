import { AlertOctagon, AlertTriangle, Info, BellRing, BellOff, type LucideIcon } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewAlertDialog } from "./new-alert-dialog";
import { acknowledgeAlert, resolveAlert, deleteAlertRule, toggleAlertRule } from "./actions";
import { EmptyState } from "@/components/empty-state";

const RULE_TYPE_LABEL: Record<string, string> = {
  budget_over_target: "Budget over target",
  low_balance: "Low balance",
  emergency_fund_below_floor: "Emergency fund below floor",
  large_transaction: "Large transaction",
  recurring_missed: "Recurring charge missed",
  recurring_amount_changed: "Recurring amount changed",
  sinking_fund_underfunded: "Sinking fund underfunded",
  portfolio_drift: "Portfolio drift (not yet evaluated — needs Phase 3)",
};

const SEVERITY_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  critical: "destructive",
  warning: "secondary",
  info: "outline",
};

const SEVERITY_ICON: Record<string, LucideIcon> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

export default async function AlertsPage() {
  const userId = await requireUserId();

  const [events, rules, accounts, categories] = await Promise.all([
    prisma.alertEvent.findMany({
      where: { userId, resolvedAt: null },
      orderBy: { triggeredAt: "desc" },
    }),
    prisma.alertRule.findMany({
      where: { userId },
      include: { account: { select: { name: true } } },
      orderBy: { ruleType: "asc" },
    }),
    prisma.financialAccount.findMany({ where: { userId, isArchived: false }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { userId, isArchived: false }, select: { id: true, name: true } }),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <NewAlertDialog accounts={accounts} categories={categories} />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Open alerts</h2>
        {events.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="No open alerts"
            description="Alerts are evaluated nightly by the worker."
          />
        ) : (
        <div className="divide-y rounded-lg border">
          {events.map((event) => {
            const SeverityIcon = SEVERITY_ICON[event.severity] ?? Info;
            return (
            <div key={event.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <SeverityIcon className="size-4 shrink-0 text-muted-foreground" />
                  <Badge variant={SEVERITY_VARIANT[event.severity] ?? "outline"}>{event.severity}</Badge>
                  <p className="font-medium">{event.title}</p>
                </div>
                <p className="text-sm text-muted-foreground">{event.message}</p>
                <p className="text-xs text-muted-foreground">{event.triggeredAt.toLocaleString()}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!event.acknowledgedAt && (
                  <form action={acknowledgeAlert.bind(null, event.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Acknowledge
                    </Button>
                  </form>
                )}
                <form action={resolveAlert.bind(null, event.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    Resolve
                  </Button>
                </form>
              </div>
            </div>
            );
          })}
        </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Configured alerts</h2>
        <div className="grid gap-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardHeader className="flex items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  {rule.isActive ? (
                    <BellRing className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <BellOff className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div>
                    <CardTitle className="text-base">{RULE_TYPE_LABEL[rule.ruleType] ?? rule.ruleType}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {rule.account?.name}
                      {rule.categoryId && categoryById.get(rule.categoryId)}
                      {!rule.account && !rule.categoryId && "All accounts/categories"}
                      {!rule.isActive && " · paused"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <form action={toggleAlertRule.bind(null, rule.id, !rule.isActive)}>
                    <Button type="submit" variant="ghost" size="sm">
                      {rule.isActive ? "Pause" : "Resume"}
                    </Button>
                  </form>
                  <form action={deleteAlertRule.bind(null, rule.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>
              </CardHeader>
            </Card>
          ))}
          {rules.length === 0 && (
            <EmptyState
              icon={BellRing}
              title="No alerts configured yet"
              description="Add one to get notified about budgets, low balances, missed subscriptions, and more."
            />
          )}
        </div>
      </div>
    </div>
  );
}
