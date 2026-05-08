/**
 * Single source of truth for date formatting across the app.
 *
 * Pages used to mix "dd MMM yyyy", "MMM d", "yyyy-MM-dd", and a
 * couple of `.toLocaleDateString(...)` flavours, which made
 * date-heavy surfaces (Reports list, Workspace coaching board,
 * Evaluations history) read inconsistently. This helper accepts a
 * named preset and produces stable, locale-agnostic output.
 *
 * `null` / `undefined` / unparseable input returns "—" so callers
 * don't have to guard before rendering.
 */
export type DatePreset =
  /** "8 May 2026" — full date for headers / detail rows */
  | "full"
  /** "8 May" — short date for compact lists */
  | "short"
  /** "May 2026" — month + year for period labels */
  | "monthYear"
  /** "8 May, 14:32" — date + 24h time for activity timestamps */
  | "dateTime"
  /** "14:32" — time only */
  | "time";

const TWO = (n: number) => String(n).padStart(2, "0");
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDate(
  input: Date | string | number | null | undefined,
  preset: DatePreset = "full",
): string {
  if (input == null) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";

  const day = d.getDate();
  const monthIdx = d.getMonth();
  const year = d.getFullYear();
  const hours = d.getHours();
  const mins = d.getMinutes();

  switch (preset) {
    case "full":
      return `${day} ${MONTHS_LONG[monthIdx]} ${year}`;
    case "short":
      return `${day} ${MONTHS_SHORT[monthIdx]}`;
    case "monthYear":
      return `${MONTHS_LONG[monthIdx]} ${year}`;
    case "dateTime":
      return `${day} ${MONTHS_SHORT[monthIdx]}, ${TWO(hours)}:${TWO(mins)}`;
    case "time":
      return `${TWO(hours)}:${TWO(mins)}`;
  }
}

/**
 * "5 minutes ago" / "2 hours ago" / "3 days ago" / fall back to a
 * formatted date. Used by activity feeds + recent-eval lists.
 */
export function formatRelative(input: Date | string | number | null | undefined): string {
  if (input == null) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  const ms = Date.now() - d.getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  // Past a week, show the date so the user has an absolute anchor.
  return formatDate(d, "short");
}
