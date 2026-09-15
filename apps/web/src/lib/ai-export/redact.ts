/**
 * A best-effort, not-a-guarantee redaction pass for privacy_safe export
 * mode. Only targets alphanumeric tokens of 8+ characters that contain at
 * least one digit -- confirmation/reference/ACH-trace numbers are
 * digit-heavy, while a pure-alphabetic merchant name (e.g. "STARBUCKS",
 * "MICROSOFT") never matches and survives untouched. This is intentionally
 * conservative rather than aggressive: destroying useful merchant context
 * is worse than leaving an occasional reference number in.
 */
const REFERENCE_NUMBER_PATTERN = /\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,}\b/g;

export function redactReferenceNumbers(text: string): string {
  return text.replace(REFERENCE_NUMBER_PATTERN, "[redacted]");
}
