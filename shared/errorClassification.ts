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
 *   2. `errorCategory === "technical"`
 *   3. `errorCode` starts with "TV" (TV-RO, TV-BJ, TV_BAC, TVRO, etc.)
 *      or matches other technical prefixes (SYS_, EQ_, INT_, TECH_)
 *   4. `errorDescription` is exactly "Technical error" or contains
 *      technical-only keywords ("interface error", "ball misread",
 *      "system void", "tv error", etc.)
 *
 * Used by both server and client to keep classification consistent.
 */

const TECHNICAL_KEYWORDS = [
  "technical error",
  "tv error",
  "tv interface",
  "tv issue",
  "ball misread",
  "ball falls out",
  "ball stuck",
  "card misread",
  "card stuck",
  "interface error",
  "system void",
  "system error",
  "system issue",
  "equipment failure",
  "equipment fault",
  "technical issue",
  "technical fault",
  "voided round",
  "voided due to",
  "round voided",
  "no game",
  "system fault",
];

interface ErrorClassificationInput {
  errorType?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  errorCategory?: string | null;
}

/**
 * Test whether an error code looks like a TV/technical category code.
 *
 * Catches:
 *   - "TV", "TV001", "TV-RO", "TV_BJ", "TVRO"
 *   - "SYS_X", "EQ_FAULT", "INT_ERR", "TECH_VOID"
 *   - "TECHNICAL"
 *
 * Misses safely:
 *   - Game codes that contain "TV" as a substring elsewhere
 *   - Plain GP error codes like "GP_X", "DEAL_ERR"
 */
function codeIsTechnical(rawCode: string): boolean {
  const code = rawCode.trim().toUpperCase();
  if (code.length === 0) return false;
  // TV with optional separator (digit, hyphen, underscore, period)
  if (/^TV([-_.]|\d|$)/.test(code)) return true;
  // Other explicit technical prefixes
  if (/^(SYS|SYSTEM|EQ|EQUIP|INT|INTERFACE|TECH|TECHNICAL)([-_.]|\d|$)/.test(code)) return true;
  return false;
}

export function isTechnicalError(input: ErrorClassificationInput): boolean {
  // 1. Smart-upload classifier already labelled it
  const type = input.errorType?.toLowerCase().trim();
  if (type === "technical_error" || type === "technical") return true;
  if (input.errorCategory?.toLowerCase().trim() === "technical") return true;

  // 2. Code-prefix match
  if (input.errorCode && codeIsTechnical(input.errorCode)) return true;

  // 3. Keyword/exact match in the description
  const desc = input.errorDescription?.toLowerCase().trim();
  if (desc) {
    if (desc === "technical error" || desc === "technical") return true;
    for (const keyword of TECHNICAL_KEYWORDS) {
      if (desc.includes(keyword)) return true;
    }
  }

  return false;
}
