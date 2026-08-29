import { Repeat } from "lucide-react";
import { prisma, type RecurringStatus } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";

const STATUS_VARIANT: Record<RecurringStatus, "default" | "destructive" | "secondary" | "outline"> = {
  active: "default",
  amount_changed: "secondary",
  missed: "destructive",
  cancelled: "outline",
  merged: "outline",
};

const STATUS_LABEL: Record<RecurringStatus, string> = {
  active: "Active",
  amount_changed: "Amount changed",
  missed: "Missed",
  cancelled: "Cancelled",
  merged: "Merged",
};

export default async function RecurringPage() {
  const userId = await requireUserId();

  const [appUser, series] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.recurringSeries.findMany({
      where: { userId },
      include: {
        category: true,
        transactions: { take: 1, include: { transaction: { select: { merchantName: true } } } },
      },
      orderBy: [{ nextExpectedDate: "asc" }],
    }),
  ]);

  const active = series.filter((s) => s.status === "active" || s.status === "amount_changed");
  const missed = series.filter((s) => s.status === "missed");
  const inactive = series.filter((s) => s.status === "cancelled" || s.status === "merged");

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Recurring</h1>

      {series.length === 0 && (
        <EmptyState
          icon={Repeat}
          title="No recurring charges detected yet"
          description="This fills in automatically once you have a few months of transaction history for a merchant (at least 3 charges)."
        />
      )}

      <SeriesGroup title="Needs attention" items={missed} defaultCurrency={appUser.defaultCurrency} />
      <SeriesGroup title="Active" items={active} defaultCurrency={appUser.defaultCurrency} />
      <SeriesGroup title="No longer recurring" items={inactive} defaultCurrency={appUser.defaultCurrency} muted />
    </div>
  );
}

type SeriesWithRelations = Awaited<ReturnType<typeof prisma.recurringSeries.findMany<{
  include: {
    category: true;
    transactions: { take: 1; include: { transaction: { select: { merchantName: true } } } };
  };
}>>>[number];

function SeriesGroup({
  title,
  items,
  defaultCurrency,
  muted,
}: {
  title: string;
  items: SeriesWithRelations[];
  defaultCurrency: string;
  muted?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</h2>
      <div className={`grid gap-3 ${muted ? "opacity-60" : ""}`}>
        {items.map((s) => (
          <Card key={s.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">
                  {s.transactions[0]?.transaction.merchantName ?? s.merchantKey}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {s.cadence} {s.category ? `· ${s.category.name}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-amount text-lg font-semibold">
                  {formatMoney(Number(s.expectedAmount), s.currency || defaultCurrency)}
                </p>
                <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Last seen {s.lastSeenDate.toLocaleDateString()}
                {s.nextExpectedDate && <> · next expected {s.nextExpectedDate.toLocaleDateString()}</>}
              </p>
              <div className="flex items-center gap-2">
                <Progress value={Number(s.confidenceScore) * 100} className="h-1.5 max-w-40" />
                <span className="text-xs text-muted-foreground">
                  {Math.round(Number(s.confidenceScore) * 100)}% confidence
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
