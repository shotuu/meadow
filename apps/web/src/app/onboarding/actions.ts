"use server";

import { redirect } from "next/navigation";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";

export async function completeOnboarding(formData: FormData) {
  const userId = await requireUserId();

  const defaultCurrency = String(formData.get("currency") || "USD");
  const templateId = String(formData.get("templateId") || "");

  const template = await prisma.categoryTemplate.findUnique({
    where: { id: templateId },
    include: { items: true },
  });
  if (!template) {
    throw new Error("Selected category template no longer exists");
  }

  await prisma.$transaction([
    prisma.appUser.update({
      where: { id: userId },
      data: { defaultCurrency },
    }),
    prisma.category.createMany({
      data: template.items.map((item) => ({
        userId,
        name: item.name,
        kind: item.kind,
        budgetType: item.budgetType,
        icon: item.icon,
        color: item.color,
        sortOrder: item.sortOrder,
      })),
    }),
  ]);

  redirect("/accounts?onboarded=1");
}
