import { prisma } from "@finance-app/db";
import { readAccountBalances } from "@finance-app/finance-data";

export async function snapshotAccountBalancesForUser(userId: string): Promise<void> {
  const accounts = await prisma.financialAccount.findMany({ where: { userId, isArchived: false } });
  const computed = await readAccountBalances(userId, accounts);
  const recordedAt = new Date();
  const asOfDate = new Date(recordedAt.toISOString().slice(0, 10));
  // Propagate any failed snapshot so a manual sync cannot report false success.
  await prisma.$transaction(accounts.map((a) => {
    const data = { ...computed.get(a.id)!, currency: a.currency, recordedAt, valuationVersion: 2 };
    return prisma.accountBalanceSnapshot.upsert({
      where: { accountId_asOfDate: { accountId: a.id, asOfDate } },
      create: { userId, accountId: a.id, asOfDate, ...data }, update: data,
    });
  }));
}

export async function snapshotAccountBalancesForAllUsers(): Promise<void> {
  const users = await prisma.appUser.findMany({ select: { id: true } });
  const failures: unknown[] = [];
  for (const { id } of users) {
    try { await snapshotAccountBalancesForUser(id); }
    catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "Balance snapshots incomplete");
}
