/**
 * Best-effort, not-a-guarantee redaction passes for privacy_safe export
 * mode. Every function here follows the same principle: preserve economic
 * meaning (amount, currency, date, direction, merchant/service identity),
 * remove personal identity (a person's name, an account-number suffix, a
 * reference/confirmation number). None of these are a general-purpose
 * PII/NER system -- they target the specific, concrete shapes real bank/
 * P2P descriptions actually use, and a merchant name that doesn't match one
 * of those shapes is deliberately left alone rather than guessed at.
 */

/**
 * Confirmation/reference/ACH-trace numbers are digit-heavy alphanumeric
 * tokens of 8+ characters -- a pure-alphabetic merchant name (e.g.
 * "STARBUCKS", "MICROSOFT") never matches and survives untouched. This is
 * intentionally conservative rather than aggressive: destroying useful
 * merchant context is worse than leaving an occasional reference number in.
 */
const REFERENCE_NUMBER_PATTERN = /\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,}\b/g;

export function redactReferenceNumbers(text: string): string {
  return text.replace(REFERENCE_NUMBER_PATTERN, "[redacted]");
}

const P2P_SERVICES = ["Zelle", "Venmo", "Cash App", "Cashapp", "PayPal"];
/**
 * A name run must actually look like a proper name (title case) --
 * deliberately case-sensitive, never combined with an /i regex flag, or a
 * stray lowercase word ("and", "the") in the surrounding text could get
 * swept in. Each word also rejects one immediately followed by "#" or ":"
 * with no space (e.g. "Conf#", "Ref:") -- that's a field label, not a
 * continuation of the name, so "JANE SMITH Conf# 123" correctly stops at
 * "SMITH" instead of absorbing "Conf" as a third name word.
 */
const NAME_WORD = "[A-Z][A-Za-z'.-]*\\b(?![#:])";
const NAME_RUN = `${NAME_WORD}(?:\\s+${NAME_WORD}){0,3}`;
const SERVICE_ALTERNATION = P2P_SERVICES.map((s) => s.replace(/\s+/g, "\\s?")).join("|");
const HAS_P2P_SERVICE = new RegExp(`\\b(${SERVICE_ALTERNATION})\\b`, "i");

/** Locates "<service> ... from/to" case-insensitively -- structural words only, no name capture here (see redactP2pCounterparty for why the name itself is matched separately, case-sensitively). */
const P2P_DIRECTIONAL_LOCATOR = new RegExp(`\\b(?:${SERVICE_ALTERNATION})\\b[^A-Za-z0-9]*(?:payment|transfer|money|pymt)?[^A-Za-z0-9]*\\b(?:from|to)\\b`, "gi");
const NAME_AFTER_LOCATOR = new RegExp(`^\\s+(${NAME_RUN})`);

/** "ZELLE TRANSFER CONF# 99CWNC4CJ; LINA PHAM" -- the shape real Zelle transfer-confirmation descriptions use: a name trailing a semicolon, no from/to keyword at all. Only applied once a P2P service name is already known to be present in the text (see redactP2pCounterparty's guard), so an unrelated "Merchant; Location" description is never touched. */
const SEMICOLON_NAME_PATTERN = new RegExp(`;(\\s*)(${NAME_RUN})`, "g");

/**
 * Redacts a P2P-transfer counterparty's name while preserving the service,
 * direction, and everything else structurally useful about the
 * description. Only fires when a known P2P service name is present
 * somewhere in the text -- outside that context, a capitalized run of
 * words is indistinguishable from a legitimate merchant name (see
 * "Apple", "UCLA", "Peerspace"), so this never touches ordinary purchases.
 *
 * The "from/to" locator is matched case-insensitively (real descriptions
 * are often ALL CAPS), but the name itself is always matched
 * case-sensitively against the original text right after that point --
 * mixing an /i flag into the name pattern too would make its "starts with
 * a capital letter" check meaningless and risk sweeping in an ordinary
 * lowercase word.
 */
export function redactP2pCounterparty(text: string): string {
  if (!HAS_P2P_SERVICE.test(text)) return text;

  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  P2P_DIRECTIONAL_LOCATOR.lastIndex = 0;
  while ((match = P2P_DIRECTIONAL_LOCATOR.exec(text))) {
    const matchEnd = match.index + match[0].length;
    result += text.slice(cursor, matchEnd);
    const nameMatch = NAME_AFTER_LOCATOR.exec(text.slice(matchEnd));
    if (nameMatch) {
      result += " [person]";
      cursor = matchEnd + nameMatch[0].length;
    } else {
      cursor = matchEnd;
    }
  }
  result += text.slice(cursor);

  return result.replace(SEMICOLON_NAME_PATTERN, (_match, spacing: string) => `;${spacing}[person]`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Redacts the signed-in user's own name when it appears verbatim inside a
 * transaction description (payroll/wire/ACH descriptions routinely embed
 * the account holder's legal name, e.g. "UCLA PAYROLL DEP JANE STUDENT").
 * Matches only the exact registered display name as a whole phrase --
 * deliberately not decomposed into first/last name separately, since
 * matching just a first name risks redacting an unrelated merchant/word
 * that happens to share it. Best-effort: a nickname, reversed name order,
 * or misspelling in the raw bank text won't be caught.
 */
export function redactAccountHolderName(text: string, accountHolderName: string | null): string {
  const trimmed = accountHolderName?.trim();
  if (!trimmed) return text;
  const pattern = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "gi");
  return text.replace(pattern, "[account holder]");
}

/** Strips a trailing account-number-like suffix from an account's own display name, e.g. "Adv SafeBalance Checking 3106" -> "Adv SafeBalance Checking". Never strips down to an empty string. */
const ACCOUNT_NUMBER_SUFFIX_PATTERN = /[\s([{*#x-]*\d{3,6}[)\]]?\s*$/i;

export function stripAccountNumberSuffix(name: string): string {
  const stripped = name.replace(ACCOUNT_NUMBER_SUFFIX_PATTERN, "").trim();
  return stripped.length > 0 ? stripped : name;
}

/**
 * Applies every privacy_safe text redaction pass, in an order chosen so
 * each pass only ever sees text the earlier ones left alone (P2P/name
 * redaction operate on real words, so they run before reference numbers
 * turn digit-heavy tokens into "[redacted]").
 */
export function redactPrivacySafeText(text: string, accountHolderName: string | null): string {
  const withoutP2pName = redactP2pCounterparty(text);
  const withoutAccountHolderName = redactAccountHolderName(withoutP2pName, accountHolderName);
  return redactReferenceNumbers(withoutAccountHolderName);
}
