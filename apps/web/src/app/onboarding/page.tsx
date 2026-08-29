import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { completeOnboarding } from "./actions";

const COMMON_CURRENCIES = ["USD", "SGD", "EUR", "GBP", "JPY", "AUD", "CAD", "INR", "CNY"];

export default async function OnboardingPage() {
  const userId = await requireUserId();

  const existingCategoryCount = await prisma.category.count({ where: { userId } });
  if (existingCategoryCount > 0) {
    redirect("/dashboard");
  }

  const templates = await prisma.categoryTemplate.findMany({
    include: { items: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Set up your finances</h1>
        <p className="text-muted-foreground">
          Pick a starting point — every category can be renamed, added to, or removed afterward.
        </p>
      </div>

      <form action={completeOnboarding} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Default currency</CardTitle>
            <CardDescription>Used for totals and dashboards; individual accounts can use other currencies.</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="currency" className="sr-only">
              Default currency
            </Label>
            <Select name="currency" defaultValue="USD">
              <SelectTrigger id="currency" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="font-medium">Starting category set</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {templates.map((template, index) => (
              <label key={template.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="templateId"
                  value={template.id}
                  defaultChecked={index === 0}
                  className="peer sr-only"
                  required
                />
                <Card className="peer-checked:border-primary peer-checked:ring-1 peer-checked:ring-primary h-full">
                  <CardHeader>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <CardDescription>{template.items.length} starter categories</CardDescription>
                  </CardHeader>
                </Card>
              </label>
            ))}
          </div>
        </div>

        <Button type="submit" size="lg">
          Continue
        </Button>
      </form>
    </div>
  );
}
