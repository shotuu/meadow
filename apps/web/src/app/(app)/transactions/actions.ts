"use server";

import { createHash } from "node:crypto";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { applyCategorizationRules, recordCategoryCorrection } from "@/lib/categorization";

export async function createTransaction(formData: FormData) {
  const userId = await requireUserId();

  const accountId = String(formData.get("accountId") || "");
  const description = String(formData.get("description") || "").trim();
  const merchantName = String(formData.get("merchantName") || "").trim() || null;
  const amountInput = Number(formData.get("amount"));
  const date = new Date(String(formData.get("date")));
  const categoryIdInput = String(formData.get("categoryId") || "");
  const isTransfer = formData.get("isTransfer") === "on";
  const transferAccountId = String(formData.get("transferAccountId") || "");

  const account = await prisma.financialAccount.findFirstOrThrow({
    where: { id: accountId, userId },
  });

  if (!description) throw new Error("Description is required");
  if (!Number.isFinite(amountInput) || amountInput === 0) throw new Error("Amount must be non-zero");

  let categoryId: string | null = categoryIdInput || null;
  if (!categoryId && !isTransfer) {
    categoryId = await applyCategorizationRules(userId, merchantName, description);
  }

  if (isTransfer && transferAccountId) {
    const otherAccount = await prisma.financialAccount.findFirstOrThrow({
      where: { id: transferAccountId, userId },
    });

    const [txA, txB] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          accountId: account.id,
          amount: amountInput,
          currency: account.currency,
          description,
          merchantName,
          date,
          isTransfer: true,
        },
      }),
      prisma.transaction.create({
        data: {
          userId,
          accountId: otherAccount.id,
          amount: -amountInput,
          currency: otherAccount.currency,
          description,
          merchantName,
          date,
          isTransfer: true,
        },
      }),
    ]);

    await prisma.$transaction([
      prisma.transaction.update({ where: { id: txA.id }, data: { transferPairId: txB.id } }),
      prisma.transaction.update({ where: { id: txB.id }, data: { transferPairId: txA.id } }),
    ]);
  } else {
    await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        amount: amountInput,
        currency: account.currency,
        description,
        merchantName,
        date,
        categoryId,
        categorySource: categoryId ? "rule" : "uncategorized",
      },
    });
  }

  revalidatePath("/transactions");
  revalidatePath("/accounts");
}

export async function setTransactionCategory(transactionId: string, categoryId: string) {
  const userId = await requireUserId();

  const transaction = await prisma.transaction.findFirstOrThrow({
    where: { id: transactionId, userId },
  });

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { categoryId, categorySource: "manual", categoryConfidence: null },
  });

  await recordCategoryCorrection(userId, transaction.merchantName, categoryId);

  revalidatePath("/transactions");
}

// Radix's Select doesn't fire onValueChange when the already-selected value
// is re-picked, so there's otherwise no way to accept an AI suggestion as
// correct -- this is a manual set to the category it already has, which
// reuses the same learning path as an actual correction.
export async function confirmTransactionCategory(transactionId: string) {
  const userId = await requireUserId();

  const transaction = await prisma.transaction.findFirstOrThrow({
    where: { id: transactionId, userId },
  });
  if (!transaction.categoryId) throw new Error("Transaction has no category to confirm");

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { categorySource: "manual", categoryConfidence: null },
  });

  await recordCategoryCorrection(userId, transaction.merchantName, transaction.categoryId);

  revalidatePath("/transactions");
}

function externalIdFor(accountId: string, date: string, description: string, amount: number): string {
  return createHash("sha1").update(`${accountId}|${date}|${description}|${amount}`).digest("hex");
}

export async function importCsvTransactions(formData: FormData) {
  const userId = await requireUserId();

  const accountId = String(formData.get("accountId") || "");
  const dateColumn = String(formData.get("dateColumn") || "");
  const descriptionColumn = String(formData.get("descriptionColumn") || "");
  const amountColumn = String(formData.get("amountColumn") || "");
  const merchantColumnRaw = String(formData.get("merchantColumn") || "");
  const merchantColumn = merchantColumnRaw === "__none__" ? "" : merchantColumnRaw;
  const flipSign = formData.get("flipSign") === "on";
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) throw new Error("No file uploaded");
  if (!dateColumn || !descriptionColumn || !amountColumn) {
    throw new Error("Date, description, and amount columns must be mapped");
  }

  const account = await prisma.financialAccount.findFirstOrThrow({
    where: { id: accountId, userId },
  });

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });

  const batch = await prisma.importBatch.create({
    data: {
      userId,
      accountId: account.id,
      sourceFilename: file.name,
      rowCount: parsed.data.length,
      status: "processing",
      columnMapping: { dateColumn, descriptionColumn, amountColumn, merchantColumn, flipSign },
    },
  });

  let imported = 0;
  let duplicates = 0;
  let errors = 0;

  for (const row of parsed.data) {
    try {
      const rawAmount = Number(String(row[amountColumn]).replace(/[,$]/g, ""));
      const date = new Date(row[dateColumn]);
      const description = String(row[descriptionColumn] || "").trim();
      const merchantName = merchantColumn ? String(row[merchantColumn] || "").trim() || null : null;

      if (!description || !Number.isFinite(rawAmount) || Number.isNaN(date.getTime())) {
        errors++;
        continue;
      }

      const amount = flipSign ? -rawAmount : rawAmount;
      const externalTransactionId = externalIdFor(account.id, row[dateColumn], description, amount);

      const existing = await prisma.transaction.findUnique({
        where: { accountId_externalTransactionId: { accountId: account.id, externalTransactionId } },
      });
      if (existing) {
        duplicates++;
        continue;
      }

      const categoryId = await applyCategorizationRules(userId, merchantName, description);

      await prisma.transaction.create({
        data: {
          userId,
          accountId: account.id,
          amount,
          currency: account.currency,
          description,
          merchantName,
          date,
          categoryId,
          categorySource: categoryId ? "rule" : "uncategorized",
          externalTransactionId,
          importBatchId: batch.id,
        },
      });
      imported++;
    } catch {
      errors++;
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: "complete", importedCount: imported, duplicateCount: duplicates, errorCount: errors },
  });

  revalidatePath("/transactions");
  revalidatePath("/accounts");

  return { imported, duplicates, errors };
}
