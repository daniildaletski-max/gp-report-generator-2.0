/**
 * Shared date-range helper used by query layers that need to filter
 * rows by "all rows whose evaluationDate / errorDate falls in month X
 * of year Y".
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
