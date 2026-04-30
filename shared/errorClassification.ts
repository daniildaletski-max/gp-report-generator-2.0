/**
 * Classification helper for distinguishing technical (TV / system / equipment)
 * errors from genuine GP errors.
 *
 * GPs in the portal must NOT see TV-type errors counted against them — those
 * are out of their control (interface bugs, ball detection issues, voided
 * rounds due to system faults, etc.).
 *
 * Signals we look at, in order of confidence:
 *   1. `errorType === "technical_error"` from the smart-upload classifier
 *   2. `errorCode` starting with "TV" (Excel-imported errors)
 *   3. `errorCode` matching common technical prefixes (SYS_, EQ_, INT_)
 *   4. `errorDescription` containing technical-only keywords
 *
 * Used by both server and client to keep classification consistent.
 */

const TECHNICAL_CODE_PREFIXES = [
  "TV",
  "SYS_",
  "SYSTEM",
  "EQ_",
  "EQUIP",
  "INT_",
  "INTERFACE",
  "TECH_",
  "TECHNICAL",
];

const TECHNICAL_KEYWORDS = [
  "tv interface",
  "ball misread",
  "ball falls out",
  "card misread",
  "interface error",
  "system void",
  "system error",
  "equipment failure",
  "technical issue",
  "technical fault",
  "voided round",
  "voided due to",
];

interface ErrorClassificationInput {
  errorType?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  errorCategory?: string | null;
}

export function isTechnicalError(input: ErrorClassificationInput): boolean {
  // 1. Smart-upload classifier already labelled it
  if (input.errorType?.toLowerCase().trim() === "technical_error") return true;
  if (input.errorCategory?.toLowerCase().trim() === "technical") return true;

  // 2 & 3. Code-prefix match
  const code = input.errorCode?.trim().toUpperCase();
  if (code) {
    for (const prefix of TECHNICAL_CODE_PREFIXES) {
      if (code === prefix || code.startsWith(`${prefix}_`) || code.startsWith(prefix.toUpperCase())) {
        // Be careful: "TV" alone or "TV001" or "TV_" all match;
        // a code like "SD" or "GP" must not match.
        if (prefix === "TV" && (code === "TV" || /^TV\d|^TV_/.test(code))) return true;
        if (prefix !== "TV" && code.startsWith(prefix)) return true;
      }
    }
  }

  // 4. Keyword match in the description
  const desc = input.errorDescription?.toLowerCase().trim();
  if (desc) {
    for (const keyword of TECHNICAL_KEYWORDS) {
      if (desc.includes(keyword)) return true;
    }
  }

  return false;
}
