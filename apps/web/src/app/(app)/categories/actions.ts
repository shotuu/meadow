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
