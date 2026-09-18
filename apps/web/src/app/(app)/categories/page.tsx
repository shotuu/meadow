import { TrendingUp, TrendingDown, ArrowLeftRight, type LucideIcon } from "lucide-react";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { categoryColorVar } from "@/lib/category-color";
import { NewCategoryDialog } from "./new-category-dialog";
import { CategoryRow } from "./category-row";
import { unarchiveCategory } from "./actions";
import { AppHeader } from "@/components/app-header";
import { SectionLabel } from "@/components/typography";

const KIND_ICON: Record<string, LucideIcon> = {
  income: TrendingUp,
  expense: TrendingDown,
  transfer: ArrowLeftRight,
};

export default async function CategoriesPage() {
  const userId = await requireUserId();

  const [categories, archivedCategories] = await Promise.all([
    prisma.category.findMany({
      where: { userId, isArchived: false },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({
      where: { userId, isArchived: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const groups: Record<string, typeof categories> = { income: [], expense: [], transfer: [] };
  for (const c of categories) groups[c.kind]?.push(c);

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <AppHeader title="Categories" primaryAction={<NewCategoryDialog />} />

      {(["income", "expense", "transfer"] as const).map((kind) => {
        if (groups[kind].length === 0) return null;
        const KindIcon = KIND_ICON[kind];
        return (
          <div key={kind} className="space-y-3">
            <SectionLabel className="flex items-center gap-1.5 capitalize">
              <KindIcon className="size-4" />
              {kind}
            </SectionLabel>
            <Card>
              <CardContent className="divide-y p-0">
                {groups[kind].map((category) => (
                  <CategoryRow key={category.id} category={category} />
                ))}
              </CardContent>
            </Card>
          </div>
        );
      })}

      {archivedCategories.length > 0 && (
        <div className="space-y-3">
          <SectionLabel>Archived</SectionLabel>
          <Card>
            <CardContent className="divide-y p-0">
              {archivedCategories.map((category) => (
                <div key={category.id} className="flex items-center justify-between gap-3 px-4 py-3 text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full opacity-50"
                      style={{ background: categoryColorVar(category.id) }}
                    />
                    <span className="truncate">{category.name}</span>
                  </span>
                  <form action={unarchiveCategory.bind(null, category.id)} className="shrink-0">
                    <Button type="submit" variant="ghost" size="sm">
                      Unarchive
                    </Button>
                  </form>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
