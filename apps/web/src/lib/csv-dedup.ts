import { createHash } from "node:crypto";

export function externalIdFor(accountId: string, date: string, description: string, amount: number): string {
  return createHash("sha1").update(`${accountId}|${date}|${description}|${amount}`).digest("hex");
}
