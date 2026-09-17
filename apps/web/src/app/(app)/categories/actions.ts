"use server";

import { revalidatePath } from "next/cache";
import { prisma, CategoryKind, BudgetType } from "@finance-app/db";
import { requireUserId } from "@/lib/session";

export async function createCategory(formData: FormData) {
  const userId = await requireUserId();

  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "expense") as CategoryKind;
  const budgetType = String(formData.get("budgetType") || "none") as BudgetType;

  if (!name) throw new Error("Category name is required");

  await prisma.category.create({
    data: { userId, name, kind, budgetType },
  });

  revalidatePath("/categories");
}

export async function updateCategoryBudgetType(categoryId: string, budgetType: BudgetType) {
  const userId = await requireUserId();

  // Switching away from prepaid_coverage/sinking_fund leaves that mode's
  // config row in place rather than deleting it -- matches existing
  // sinking_fund behavior (switching a category away from it never deletes
  // the SinkingFund row either), so this isn't a new inconsistency.
  await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: { budgetType },
  });

  revalidatePath("/categories");
  revalidatePath("/budgets");
  revalidatePath("/plan");
}

export async function archiveCategory(categoryId: string) {
  const userId = await requireUserId();

  await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: { isArchived: true },
  });

  revalidatePath("/categories");
}

export async function unarchiveCategory(categoryId: string) {
  const userId = await requireUserId();

  await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: { isArchived: false },
  });

  revalidatePath("/categories");
}

// Category.pinnedToDashboard has had no reader anywhere in the app since
// Home's Phase 3 rebuild replaced the old per-category "pinned" dashboard
// cards with the curated Home screen -- toggling it currently has zero
// observable effect. The Phase 7 UI/UX-polish pass removed the Pin/Unpin
// control from the Categories page for that reason (a control that
// silently does nothing is worse than no control), but left this action
// and the underlying schema field in place rather than a destructive
// migration -- flagged as legacy/dead, a candidate for real removal (or a
// real reuse, e.g. resurrecting a "pinned categories" concept somewhere)
// in a future phase, not decided here.
export async function toggleDashboardPin(categoryId: string) {
  const userId = await requireUserId();

  const category = await prisma.category.findFirstOrThrow({ where: { id: categoryId, userId } });

  await prisma.category.update({
    where: { id: categoryId },
    data: { pinnedToDashboard: !category.pinnedToDashboard },
  });

  revalidatePath("/categories");
  revalidatePath("/dashboard");
}
