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

export async function archiveCategory(categoryId: string) {
  const userId = await requireUserId();

  await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: { isArchived: true },
  });

  revalidatePath("/categories");
}
