"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { prisma } from "@finance-app/db";
import { requireUserId } from "@/lib/session";
import { applyCategorizationRules, recordCategoryCorrection } from "@/lib/categorization";
import { externalIdFor } from "@/lib/csv-dedup";
import { toTemplateFields, type CsvColumnMapping } from "@/lib/csv-template";

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

  if (Number.isNaN(date.getTime())) throw new Error("Date is required");
  if (categoryIdInput) await prisma.category.findFirstOrThrow({ where: { id: categoryIdInput, userId } });
  if (isTransfer && (!transferAccountId || transferAccountId === accountId)) {
    throw new Error("Choose a different destination account");
  }
  let categoryId: string | null = categoryIdInput || null;
  if (!categoryId && !isTransfer) {
    categoryId = await applyCategorizationRules(userId, merchantName, description);
  }

  if (isTransfer && transferAccountId) {
    const otherAccount = await prisma.financialAccount.findFirstOrThrow({
      where: { id: transferAccountId, userId },
    });

    if (account.currency !== otherAccount.currency) {
      throw new Error("Cross-currency transfers require separate native-currency entries");
    }
    await prisma.$transaction(async (db) => {
      const common = { userId, description, merchantName, date, isTransfer: true };
      const txA = await db.transaction.create({ data: {
        ...common, accountId: account.id, amount: amountInput, currency: account.currency,
      } });
      const txB = await db.transaction.create({ data: {
        ...common, accountId: otherAccount.id, amount: -amountInput, currency: otherAccount.currency,
        transferPairId: txA.id,
      } });
      await db.transaction.update({ where: { id: txA.id }, data: { transferPairId: txB.id } });
    });
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
        categorySource: categoryIdInput ? "manual" : categoryId ? "rule" : "uncategorized",
      },
    });
  }

  revalidatePath("/transactions");
  revalidatePath("/accounts");
}

export async function setTransactionCategory(transactionId: string, categoryId: string) {
  const userId = await requireUserId();
  await prisma.category.findFirstOrThrow({ where: { id: categoryId, userId } });

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
  await prisma.category.findFirstOrThrow({ where: { id: transaction.categoryId, userId } });

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { categorySource: "manual", categoryConfidence: null },
  });

  await recordCategoryCorrection(userId, transaction.merchantName, transaction.categoryId);

  revalidatePath("/transactions");
}

export async function saveCsvImportTemplate(institutionName: string, mapping: CsvColumnMapping) {
  const userId = await requireUserId();
  if (!institutionName.trim()) throw new Error("Institution name is required");

  const fields = toTemplateFields(mapping);
  await prisma.csvImportTemplate.upsert({
    where: { userId_institutionName: { userId, institutionName } },
    create: { userId, institutionName, ...fields },
    update: fields,
  });

  revalidatePath("/transactions");
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
  const institutionName = String(formData.get("institutionName") || "").trim();
  const saveAsTemplate = formData.get("saveAsTemplate") === "on";
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

  let templateSaved = false;
  if (saveAsTemplate && institutionName) {
    try {
      await saveCsvImportTemplate(institutionName, {
        dateColumn,
        descriptionColumn,
        amountColumn,
        merchantColumn,
        flipSign,
      });
      templateSaved = true;
    } catch (err) {
      // A template-save failure shouldn't undo a successful import -- the
      // dialog surfaces this separately from the import result.
      console.error("[csv-import] failed to save template", err);
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/accounts");

  return { imported, duplicates, errors, templateSaved };
}
