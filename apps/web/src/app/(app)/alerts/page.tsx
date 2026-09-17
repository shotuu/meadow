import { AlertOctagon, AlertTriangle, Info, BellRing, BellOff, type LucideIcon } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewAlertDialog } from "./new-alert-dialog";
import { acknowledgeAlert, resolveAlert, deleteAlertRule, toggleAlertRule } from "./actions";
import { EmptyState } from "@/components/empty-state";
import { AppHeader } from "@/components/app-header";
import { SectionLabel, Meta } from "@/components/typography";

const RULE_TYPE_LABEL: Record<string, string> = {
  budget_over_target: "Budget over target",
  low_balance: "Low balance",
  emergency_fund_below_floor: "Emergency fund below floor",
  large_transaction: "Large transaction",
  recurring_missed: "Recurring charge missed",
  recurring_amount_changed: "Recurring amount changed",
  sinking_fund_underfunded: "Sinking fund underfunded",
  portfolio_drift: "Portfolio drift",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
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
      <AppHeader
        title="Alerts"
        primaryAction={<NewAlertDialog accounts={accounts} categories={categories} />}
      />

      {/* Configured alerts (rule setup) comes first -- this screen is rule
          configuration, not the user's alert inbox. Home's "Needs
          attention" already surfaces live, actionable open alerts; the
          triggered-alerts section below exists so the underlying
          acknowledge/resolve actions have somewhere to live, not as this
          page's primary purpose. */}
      <div className="space-y-3">
        <SectionLabel>Configured alerts</SectionLabel>
        {rules.length === 0 ? (
          <EmptyState
            icon={BellRing}
            title="No alerts configured yet"
            description="Add one to get notified about budgets, low balances, missed subscriptions, and more."
          />
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {rule.isActive ? (
                      <BellRing className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <BellOff className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {RULE_TYPE_LABEL[rule.ruleType] ?? rule.ruleType}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {rule.account?.name ??
                          (rule.categoryId && categoryById.get(rule.categoryId)) ??
                          "All accounts/categories"}
                        {!rule.isActive && " · Paused"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-0.5">
          <SectionLabel>Triggered</SectionLabel>
          <Meta>These also appear on Home under Needs attention.</Meta>
        </div>
        {events.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="Nothing triggered right now"
            description="Alerts are evaluated nightly by the worker."
          />
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {events.map((event) => {
                const SeverityIcon = SEVERITY_ICON[event.severity] ?? Info;
                return (
                  <div key={event.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <SeverityIcon className="size-4 shrink-0 text-muted-foreground" />
                        <Badge variant={SEVERITY_VARIANT[event.severity] ?? "outline"}>
                          {SEVERITY_LABEL[event.severity] ?? event.severity}
                        </Badge>
                        <p className="font-medium">{event.title}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{event.message}</p>
                      <Meta>{event.triggeredAt.toLocaleString()}</Meta>
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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
