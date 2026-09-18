"use server";

import { revalidatePath } from "next/cache";
import { prisma, InstrumentType } from "@finance-app/db";
import { readCurrentHoldings } from "@finance-app/finance-data";
import { activeStrategyBucketNames, classifyInstrumentType, partitionStrategyTargets, resolveStrategyBucketName } from "@finance-app/finance-logic";
import { requireUserId } from "@/lib/session";

function revalidateInvest(symbol?: string) {
  revalidatePath("/invest");
  revalidatePath("/home");
  revalidatePath("/dashboard");
  if (symbol) revalidatePath(`/invest/holdings/${encodeURIComponent(symbol)}`);
}

export async function setHoldingBucket(formData: FormData) {
  const userId = await requireUserId();

  const symbol = String(formData.get("symbol") || "").trim();
  const bucketName = String(formData.get("bucketName") || "").trim();

  if (!symbol) throw new Error("Symbol is required");
  if (!bucketName) throw new Error("Bucket name is required");

  await prisma.holdingBucketAssignment.upsert({
    where: { userId_symbol: { userId, symbol } },
    create: { userId, symbol, bucketName, assignedBy: "user" },
    update: { bucketName, assignedBy: "user" },
  });

  revalidateInvest(symbol);
}

export async function removeHoldingBucket(symbol: string) {
  const userId = await requireUserId();

  await prisma.holdingBucketAssignment.deleteMany({ where: { userId, symbol } });

  revalidateInvest(symbol);
}

const INSTRUMENT_TYPES: InstrumentType[] = ["stock", "etf", "fund", "bond", "cash", "crypto", "option", "other", "unknown"];

/**
 * Manual correction of a symbol's normalized instrument type -- independent
 * of setHoldingBucket above (that's strategy, this is "what the security
 * IS"). Persists across IBKR re-syncs since it's keyed by symbol, not by any
 * per-snapshot InvestmentHolding row -- see classifyInstrumentType, which
 * always prefers this override over IBKR's own metadata.
 */
export async function setInstrumentTypeOverride(formData: FormData) {
  const userId = await requireUserId();

  const symbol = String(formData.get("symbol") || "").trim();
  const instrumentType = String(formData.get("instrumentType") || "") as InstrumentType;

  if (!symbol) throw new Error("Symbol is required");
  if (!INSTRUMENT_TYPES.includes(instrumentType)) throw new Error("Invalid instrument type");

  await prisma.instrumentTypeOverride.upsert({
    where: { userId_symbol: { userId, symbol } },
    create: { userId, symbol, instrumentType },
    update: { instrumentType },
  });

  revalidateInvest(symbol);
}

export async function removeInstrumentTypeOverride(symbol: string) {
  const userId = await requireUserId();

  await prisma.instrumentTypeOverride.deleteMany({ where: { userId, symbol } });

  revalidateInvest(symbol);
}

interface TargetRowInput {
  bucketName: string;
  targetWeightPct: number;
  driftThresholdPct: number;
}

/**
 * Replaces the signed-in user's entire TargetAllocation set in one atomic
 * transaction -- used both for first-time target setup and for the guided
 * legacy-target migration (Phase 5). Idempotent -- re-submitting the same
 * rows just re-upserts them, and deleting an already-gone bucket name is a
 * harmless no-op, so a doubled network request or a retried failed submit
 * can't corrupt state. Historical data isn't affected: TargetAllocation has
 * never been versioned (unlike Budget), it's current-config-only, so
 * replacing a stale row here doesn't destroy anything worth keeping -- the
 * export/alerts/UI only ever read the live row.
 *
 * Which existing rows count as "stale instrument-type-label leftovers" to
 * retire is computed HERE, server-side, from the user's real current
 * holdings/bucket-assignments (via the shared partitionStrategyTargets) --
 * not trusted from a client-submitted list of bucket names. This used to
 * accept a `deleteBucketNames` field the dialog computed client-side and
 * passed straight into a `deleteMany`; that meant the one place actually
 * retiring legacy targets had no way to independently verify what it was
 * deleting, and any client/server data drift (e.g. a save happening against
 * data staler than what's now in the database) could leave a target like
 * "Stocks" undeleted indefinitely -- a real instance of which prompted this
 * fix. Recomputing from truth at commit time closes that gap without a
 * second migration mechanism: this is still the one save action, just no
 * longer trusting the client for a fact only the server can verify.
 */
export async function saveTargetAllocations(formData: FormData) {
  const userId = await requireUserId();

  let rows: TargetRowInput[];
  try {
    rows = JSON.parse(String(formData.get("rows") || "[]"));
  } catch {
    throw new Error("Malformed target allocation payload");
  }

  const seen = new Set<string>();
  let totalPct = 0;
  const cleanRows: TargetRowInput[] = [];
  for (const row of rows) {
    const bucketName = String(row.bucketName || "").trim();
    if (!bucketName) throw new Error("Every bucket needs a name");
    if (seen.has(bucketName)) throw new Error(`Duplicate bucket name: ${bucketName}`);
    seen.add(bucketName);
    const targetWeightPct = Number(row.targetWeightPct);
    const driftThresholdPct = Number(row.driftThresholdPct);
    if (!Number.isFinite(targetWeightPct) || targetWeightPct < 0 || targetWeightPct > 100) {
      throw new Error(`Target weight for "${bucketName}" must be between 0 and 100`);
    }
    if (!Number.isFinite(driftThresholdPct) || driftThresholdPct <= 0) {
      throw new Error(`Drift threshold for "${bucketName}" must be a positive number`);
    }
    totalPct += targetWeightPct;
    cleanRows.push({ bucketName, targetWeightPct, driftThresholdPct });
  }
  if (totalPct > 100.001) throw new Error("Target weights add up to more than 100%");

  await prisma.$transaction(async (tx) => {
    const [holdingRows, bucketAssignments, instrumentTypeOverrides, existingTargets] = await Promise.all([
      readCurrentHoldings(userId, undefined, tx),
      tx.holdingBucketAssignment.findMany({ where: { userId } }),
      tx.instrumentTypeOverride.findMany({ where: { userId } }),
      tx.targetAllocation.findMany({ where: { userId }, select: { bucketName: true } }),
    ]);
    const overridesBySymbol = new Map(bucketAssignments.map((a) => [a.symbol, a.bucketName]));
    const instrumentOverridesBySymbol = new Map(instrumentTypeOverrides.map((o) => [o.symbol, o.instrumentType as InstrumentType]));
    const activeHoldings = holdingRows
      .filter((h) => Number(h.quantity) !== 0)
      .map((h) => ({
        bucketName: resolveStrategyBucketName(h.symbol, overridesBySymbol),
        instrumentType: classifyInstrumentType({
          ibkrAssetCategory: h.securityType,
          ibkrSubCategory: h.ibkrSubCategory,
          manualOverride: instrumentOverridesBySymbol.get(h.symbol) ?? null,
        }).instrumentType,
      }));
    const currentBucketNames = activeStrategyBucketNames(activeHoldings);

    // Never retire a bucket name that's part of THIS save -- if the user is
    // actively (re)setting a target literally named e.g. "Bonds", that's an
    // explicit, current instruction, not something to second-guess.
    const savedBucketNames = new Set(cleanRows.map((r) => r.bucketName));
    const { legacy } = partitionStrategyTargets(
      existingTargets.filter((t) => !savedBucketNames.has(t.bucketName)),
      currentBucketNames
    );
    if (legacy.length > 0) {
      await tx.targetAllocation.deleteMany({ where: { userId, bucketName: { in: legacy.map((t) => t.bucketName) } } });
    }

    for (const row of cleanRows) {
      await tx.targetAllocation.upsert({
        where: { userId_bucketName: { userId, bucketName: row.bucketName } },
        create: { userId, ...row },
        update: { targetWeightPct: row.targetWeightPct, driftThresholdPct: row.driftThresholdPct },
      });
    }
  });

  revalidateInvest();
}
