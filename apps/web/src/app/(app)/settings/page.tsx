import { User, Trash2, Palette } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { DangerZone } from "./danger-zone";

export default async function SettingsPage() {
  const userId = await requireUserId();

  const [authUser, appUser, accountCount, transactionCount, plaidItemCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.appUser.findUniqueOrThrow({ where: { id: userId } }),
    prisma.financialAccount.count({ where: { userId } }),
    prisma.transaction.count({ where: { userId } }),
    prisma.plaidItem.count({ where: { userId } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4 text-muted-foreground" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Signed in as</span> {authUser.email}
          </p>
          <p>
            <span className="text-muted-foreground">Default currency</span>{" "}
            {appUser.defaultCurrency}
          </p>
          <p className="text-muted-foreground pt-2">
            {accountCount} account{accountCount === 1 ? "" : "s"}, {transactionCount} transaction
            {transactionCount === 1 ? "" : "s"}, {plaidItemCount} connected bank
            {plaidItemCount === 1 ? "" : "s"}.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="size-4 text-muted-foreground" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Theme</p>
          <ThemeToggle />
        </CardContent>
      </Card>

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
