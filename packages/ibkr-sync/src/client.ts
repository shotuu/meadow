import { XMLParser } from "fast-xml-parser";

const SEND_REQUEST_URL = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest";
const MAX_STATEMENT_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

// Loosely typed — the real shape is only known once parsed, and varies by
// which sections a given Flex Query includes. Callers narrow as needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FlexQueryResponse = any;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs IBKR's two-step Flex Web Service flow: SendRequest returns a
 * reference code plus a GetStatement URL (returned dynamically by IBKR —
 * observed as a different host than the SendRequest one in practice, so
 * it's used as given rather than hardcoded). GetStatement can respond
 * "still generating" while the report is being built, so it's retried
 * with a short delay rather than treated as a hard failure immediately.
 */
export async function fetchFlexStatement(token: string, queryId: string): Promise<FlexQueryResponse> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  const sendResponse = await fetch(
    `${SEND_REQUEST_URL}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`
  );
  const sendXml = await sendResponse.text();
  const sendDoc = parser.parse(sendXml);
  const sendResult = sendDoc.FlexStatementResponse;
  if (!sendResult || sendResult.Status !== "Success") {
    throw new Error(`IBKR SendRequest failed: ${sendResult?.ErrorMessage ?? sendXml.slice(0, 200)}`);
  }

  const referenceCode = String(sendResult.ReferenceCode);
  const getStatementUrl = String(sendResult.Url);

  for (let attempt = 0; attempt < MAX_STATEMENT_RETRIES; attempt++) {
    const statementResponse = await fetch(
      `${getStatementUrl}?q=${encodeURIComponent(referenceCode)}&t=${encodeURIComponent(token)}&v=3`
    );
    const statementXml = await statementResponse.text();
    const statementDoc = parser.parse(statementXml);

    if (statementDoc.FlexQueryResponse) {
      return statementDoc.FlexQueryResponse;
    }

    const errorMessage = statementDoc.FlexStatementResponse?.ErrorMessage ?? "unknown error";
    if (attempt === MAX_STATEMENT_RETRIES - 1) {
      throw new Error(`IBKR GetStatement failed after ${MAX_STATEMENT_RETRIES} attempts: ${errorMessage}`);
    }
    await sleep(RETRY_DELAY_MS);
  }

  throw new Error("IBKR GetStatement: unreachable");
}
