import { prisma, type AccountType as OurAccountType, type AccountClassification } from "@finance-app/db";
import type { Account } from "@finverse/sdk-typescript";

const LIABILITY_TYPES: OurAccountType[] = ["credit_card", "loan"];

function classificationForType(type: OurAccountType): AccountClassification {
  return LIABILITY_TYPES.includes(type) ? "liability" : "asset";
}

/**
 * Maps Finverse's AccountCategory ("DEPOSIT"/"CARD"/"INVESTMENT"/"LOAN"/
 * "OTHER") + subtype onto this schema's AccountType. Both fields are
 * optional on Finverse's Account shape, so this degrades to "other"
 * rather than throwing on an account Finverse itself couldn't classify.
 */
export function mapFinverseAccountType(account: Account): OurAccountType {
  const category = account.account_type?.type;
  const subtype = account.account_type?.subtype;

  switch (category) {
    case "DEPOSIT":
      return subtype === "SAVINGS" || subtype === "TIME_DEPOSIT" ? "savings" : "checking";
    case "CARD":
      return "credit_card";
    case "INVESTMENT":
      return "brokerage";
    case "LOAN":
      return "loan";
    default:
      return "other";
  }
}

/**
 * Creates a FinancialAccount for each Finverse account not already linked
 * (matched on externalAccountId). Safe to call on every sync, mirroring
 * plaid-sync's upsertPlaidAccounts -- new accounts can appear under the
 * same login identity later (e.g. the user opens a new account at the
 * same bank).
 */
export async function upsertFinverseAccounts(
  userId: string,
  finverseAccounts: Account[],
  institutionName: string | null
): Promise<Map<string, string>> {
  const existing = await prisma.financialAccount.findMany({
    where: {
      userId,
      syncSource: "finverse",
      externalAccountId: { in: finverseAccounts.map((a) => a.account_id) },
    },
  });
  const existingByExternalId = new Map(existing.map((a) => [a.externalAccountId!, a.id]));
  const accountIdByFinverseId = new Map<string, string>(existingByExternalId);

  for (const account of finverseAccounts) {
    const type = mapFinverseAccountType(account);
    const currentBalance = account.balance?.value ?? null;

    if (existingByExternalId.has(account.account_id)) {
      if (currentBalance !== null) {
        await prisma.financialAccount.update({
          where: { id: existingByExternalId.get(account.account_id) },
          data: { currentBalance, balanceAsOf: new Date() },
        });
      }
      continue;
    }

    const created = await prisma.financialAccount.create({
      data: {
        userId,
        name: account.account_nickname || account.account_name,
        type,
        classification: classificationForType(type),
        currency: account.account_currency || account.balance?.currency || "SGD",
        institutionName,
        syncSource: "finverse",
        externalAccountId: account.account_id,
        ...(currentBalance !== null && { currentBalance, balanceAsOf: new Date() }),
      },
    });
    accountIdByFinverseId.set(account.account_id, created.id);
  }

  return accountIdByFinverseId;
}
