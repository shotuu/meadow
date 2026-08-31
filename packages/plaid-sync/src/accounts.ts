import { prisma, type AccountType as OurAccountType, type AccountClassification } from "@finance-app/db";
import { AccountType as PlaidAccountType, AccountSubtype, type AccountBase } from "plaid";

const LIABILITY_TYPES: OurAccountType[] = ["credit_card", "loan"];

function classificationForType(type: OurAccountType): AccountClassification {
  return LIABILITY_TYPES.includes(type) ? "liability" : "asset";
}

function mapAccountType(plaidType: PlaidAccountType, subtype: AccountSubtype | null): OurAccountType {
  switch (plaidType) {
    case PlaidAccountType.Depository:
      return subtype === AccountSubtype.Savings ? "savings" : "checking";
    case PlaidAccountType.Credit:
      return "credit_card";
    case PlaidAccountType.Loan:
      return "loan";
    case PlaidAccountType.Investment:
    case PlaidAccountType.Brokerage:
      return "brokerage";
    default:
      return "other";
  }
}

/**
 * Creates a FinancialAccount for each Plaid account not already linked
 * (matched on externalAccountId). Safe to call on every sync, not just at
 * initial link time, in case new accounts appear at the institution later.
 */
export async function upsertPlaidAccounts(
  userId: string,
  plaidAccounts: AccountBase[],
  institutionName: string | null
): Promise<Map<string, string>> {
  const existing = await prisma.financialAccount.findMany({
    where: { userId, syncSource: "plaid", externalAccountId: { in: plaidAccounts.map((a) => a.account_id) } },
  });
  const existingByExternalId = new Map(existing.map((a) => [a.externalAccountId!, a.id]));

  const accountIdByPlaidId = new Map<string, string>(existingByExternalId);

  for (const account of plaidAccounts) {
    if (existingByExternalId.has(account.account_id)) continue;

    const type = mapAccountType(account.type, account.subtype);
    const created = await prisma.financialAccount.create({
      data: {
        userId,
        name: account.name,
        type,
        classification: classificationForType(type),
        currency: account.balances.iso_currency_code || "USD",
        institutionName,
        syncSource: "plaid",
        externalAccountId: account.account_id,
        ...(account.balances.current != null && {
          currentBalance: account.balances.current,
          balanceAsOf: new Date(),
        }),
      },
    });
    accountIdByPlaidId.set(account.account_id, created.id);
  }

  return accountIdByPlaidId;
}

/**
 * Refreshes the stored balance for already-linked Plaid accounts. Deliberately
 * separate from upsertPlaidAccounts (which only ever creates missing accounts)
 * and fed by /accounts/balance/get specifically rather than whatever accounts
 * array transactionsSync/accountsGet happened to return -- Plaid's own docs
 * note that balance data from those other endpoints "may be cached", while
 * /accounts/balance/get is the one call documented to force a real-time,
 * non-cached refresh from the institution.
 */
export async function refreshPlaidAccountBalances(userId: string, plaidAccounts: AccountBase[]): Promise<void> {
  const now = new Date();
  for (const account of plaidAccounts) {
    if (account.balances.current == null) continue;
    await prisma.financialAccount.updateMany({
      where: { userId, syncSource: "plaid", externalAccountId: account.account_id },
      data: { currentBalance: account.balances.current, balanceAsOf: now },
    });
  }
}
