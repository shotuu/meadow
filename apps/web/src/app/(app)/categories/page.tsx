import { TrendingUp, TrendingDown, ArrowLeftRight, type LucideIcon } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewCategoryDialog } from "./new-category-dialog";
import { archiveCategory } from "./actions";

const BUDGET_TYPE_LABEL: Record<string, string> = {
  none: "No budget",
  monthly_reset: "Monthly",
  rollover_envelope: "Rollover",
  sinking_fund: "Sinking fund",
};

const KIND_ICON: Record<string, LucideIcon> = {
  income: TrendingUp,
  expense: TrendingDown,
  transfer: ArrowLeftRight,
};

function categoryColorVar(categoryId: string): string {
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  return `var(--chart-${(hash % 5) + 1})`;
}

export default async function CategoriesPage() {
  const userId = await requireUserId();

  const categories = await prisma.category.findMany({
    where: { userId, isArchived: false },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const groups: Record<string, typeof categories> = { income: [], expense: [], transfer: [] };
  for (const c of categories) groups[c.kind]?.push(c);

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <NewCategoryDialog />
      </div>

      {(["income", "expense", "transfer"] as const).map((kind) => {
        if (groups[kind].length === 0) return null;
        const KindIcon = KIND_ICON[kind];
        return (
          <div key={kind} className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              <KindIcon className="size-4" />
              {kind}
            </h2>
            <Card>
              <CardContent className="divide-y p-0">
                {groups[kind].map((category) => (
                  <div key={category.id} className="flex items-center justify-between px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: categoryColorVar(category.id) }}
                      />
                      {category.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{BUDGET_TYPE_LABEL[category.budgetType]}</Badge>
                      <form action={archiveCategory.bind(null, category.id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          Archive
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
