/**
 * Shared date helpers used by query layers and OCR ingestion.
 *
 * History: row tables (attitudeScreenshots, errorScreenshots) historically
 * stored `month`/`year` ints from the upload moment — which doesn't
 * match the entry's own `evaluationDate` / `errorDate`. To fix that
 * without a migration we filter on the truthful timestamp instead.
 */

export function monthRange(month: number, year: number): { start: Date; endExclusive: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endExclusive = new Date(year, month, 1, 0, 0, 0, 0);
  return { start, endExclusive };
}

/**
 * Parse a calendar-day string (YYYY-MM-DD) as midnight in the server's
 * local timezone. Returns null on anything that doesn't match.
 *
 * `new Date("2026-03-01")` is interpreted as UTC midnight by the
 * spec — which silently shifts to the previous local day in negative
 * offsets and lands April-1 entries in March (or vice versa) when
 * the value drives `getMonth() / getFullYear()` for storage. Use this
 * helper instead anywhere an OCR'd date-only field becomes a Date that
 * later derives `month`/`year` ints.
 */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function parseIsoDateLocal(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(ISO_DATE_RE);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
