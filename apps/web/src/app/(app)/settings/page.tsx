import { Trash2 } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { DangerZone } from "./danger-zone";
import { ExportContextDialog } from "./export-context-dialog";
import { AppHeader } from "@/components/app-header";
import { SectionLabel, Meta } from "@/components/typography";

export default async function SettingsPage() {
  const userId = await requireUserId();

  const [authUser, appUser, accountCount, transactionCount, plaidItemCount, finverseConnectionCount] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
      prisma.financialAccount.count({ where: { userId } }),
      prisma.transaction.count({ where: { userId } }),
      prisma.plaidItem.count({ where: { userId } }),
      prisma.finverseConnection.count({ where: { userId } }),
    ]);
  const connectedBankCount = plaidItemCount + finverseConnectionCount;

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-8">
      <AppHeader title="Settings" />

      <div className="space-y-2">
        <SectionLabel>Account</SectionLabel>
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Signed in as</span> {authUser.email}
          </p>
          <p>
            <span className="text-muted-foreground">Default currency</span> {appUser.defaultCurrency}
          </p>
          <Meta>
            {accountCount} account{accountCount === 1 ? "" : "s"}, {transactionCount} transaction
            {transactionCount === 1 ? "" : "s"}, {connectedBankCount} connected bank
            {connectedBankCount === 1 ? "" : "s"}.
          </Meta>
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel>Appearance</SectionLabel>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Theme</p>
          <ThemeToggle />
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel>AI Financial Context export</SectionLabel>
        <p className="text-sm text-muted-foreground">
          Download a JSON snapshot of your financial picture to share with an AI assistant of your
          choosing for advice — recent transactions plus longer-term summaries, budgets, recurring
          charges, holdings, and planning data. See{" "}
          <a href="/privacy" className="underline underline-offset-2">
            the privacy policy
          </a>{" "}
          for what this does and doesn&apos;t include.
        </p>
        <ExportContextDialog />
      </div>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="size-4 text-destructive" />
            Danger zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Permanently delete your Meadow account and everything in it — accounts, transactions,
            budgets, categories, and any connected banks. This cannot be undone.
          </p>
          <DangerZone />
        </CardContent>
      </Card>
    </div>
  );
}
