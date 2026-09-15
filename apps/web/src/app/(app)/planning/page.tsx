import { CalendarClock, Wallet2, PiggyBank } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { classifyFundingStatus } from "@finance-app/finance-logic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { NewObligationDialog } from "./new-obligation-dialog";
import { MarkObligationPaidForm } from "./mark-obligation-paid-form";
import { NewIncomeStreamDialog } from "./new-income-stream-dialog";
import { DeactivateIncomeStreamButton } from "./deactivate-income-stream-button";
import { SetCashReserveDialog } from "./set-cash-reserve-dialog";
import { DeleteCashReserveButton } from "./delete-cash-reserve-button";

const FUNDING_STATUS_LABEL: Record<string, string> = {
  unfunded: "Unfunded",
  partially_funded: "Partially funded",
  fully_funded: "Fully funded",
};

const PRIORITY_LABEL: Record<string, string> = {
  mandatory: "Mandatory",
  planned: "Planned",
  discretionary: "Discretionary",
};

export default async function PlanningPage() {
  const userId = await requireUserId();

  const [appUser, accounts, obligations, incomeStreams, cashReserves] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.financialAccount.findMany({
      where: { userId, isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.obligation.findMany({
      where: { userId, isActive: true },
      orderBy: { nextDueDate: "asc" },
    }),
    prisma.incomeStream.findMany({
      where: { userId, isActive: true },
      orderBy: { nextExpectedDate: "asc" },
    }),
    prisma.cashReserve.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Planning</h1>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Upcoming obligations
          </h2>
          <NewObligationDialog accounts={accounts} defaultCurrency={appUser.defaultCurrency} />
        </div>
        <div className="grid gap-3">
          {obligations.map((o) => {
            const amount = Number(o.amount);
            const fundedAmount = Number(o.fundedAmount);
            const remaining = Math.max(0, amount - fundedAmount);
            const status = classifyFundingStatus(amount, fundedAmount);
            return (
              <Card key={o.id}>
                <CardHeader className="flex items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{o.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Due {o.nextDueDate.toLocaleDateString()} · {o.frequency.replace("_", "-")} ·{" "}
                      {PRIORITY_LABEL[o.priority]}
                    </p>
                  </div>
                  <Badge variant={status === "fully_funded" ? "secondary" : "outline"}>
                    {FUNDING_STATUS_LABEL[status]}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress
                    value={amount > 0 ? Math.min(100, (fundedAmount / amount) * 100) : 0}
                    indicatorClassName="bg-positive"
                  />
                  <div className="flex items-center justify-between">
                    <p className="font-amount text-sm text-muted-foreground">
                      {formatMoney(fundedAmount, o.currency)} / {formatMoney(amount, o.currency)}
                    </p>
                    <MarkObligationPaidForm obligationId={o.id} remaining={remaining} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {obligations.length === 0 && (
            <EmptyState
              icon={CalendarClock}
              title="No obligations tracked yet"
              description="Add a future bill or commitment to track whether it's funded and when it's due."
            />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Expected income</h2>
          <NewIncomeStreamDialog accounts={accounts} defaultCurrency={appUser.defaultCurrency} />
        </div>
        <div className="grid gap-3">
          {incomeStreams.map((s) => (
            <Card key={s.id}>
              <CardHeader className="flex items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Next {s.nextExpectedDate.toLocaleDateString()} · {s.frequency.replace("_", "-")}
                    {s.endDate && ` · ends ${s.endDate.toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.confidence === "confirmed" ? "secondary" : "outline"}>
                    {s.confidence === "confirmed" ? "Confirmed" : "Estimated"}
                  </Badge>
                  <DeactivateIncomeStreamButton incomeStreamId={s.id} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="font-amount text-lg font-semibold text-positive">
                  {formatMoney(s.grossAmount, s.currency)}
                  {s.netAmount != null && ` gross · ${formatMoney(s.netAmount, s.currency)} net`}
                </p>
              </CardContent>
            </Card>
          ))}
          {incomeStreams.length === 0 && (
            <EmptyState
              icon={Wallet2}
              title="No income streams tracked yet"
              description="Add an expected paycheck, allowance, or other recurring income to give projections a real schedule to work from."
            />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Cash reserves</h2>
          <SetCashReserveDialog accounts={accounts} defaultCurrency={appUser.defaultCurrency} />
        </div>
        <div className="grid gap-3">
          {cashReserves.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{r.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {formatMoney(r.targetAmount, r.currency)} target
                    {r.minimumAmount != null && ` · ${formatMoney(r.minimumAmount, r.currency)} minimum`}
                  </p>
                </div>
                <DeleteCashReserveButton cashReserveId={r.id} />
              </CardHeader>
            </Card>
          ))}
          {cashReserves.length === 0 && (
            <EmptyState
              icon={PiggyBank}
              title="No cash reserves set"
              description="Set aside an amount that's not actually free to spend or invest, so the rest of the app knows the difference."
            />
          )}
        </div>
      </div>
    </div>
  );
}
