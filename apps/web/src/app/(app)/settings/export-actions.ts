"use server";

import { buildAiFinancialContextExport } from "@/lib/ai-export/build-export";

/**
 * Returns the AI Financial Context export as a JSON string. requireUserId()
 * happens inside buildAiFinancialContextExport itself, so this stays a
 * thin wrapper -- the client turns the string into a downloadable file,
 * this repo has no route-handler-with-Content-Disposition pattern to
 * reuse yet.
 */
export async function generateAiFinancialContextExport(): Promise<string> {
  const data = await buildAiFinancialContextExport();
  return JSON.stringify(data, null, 2);
}
