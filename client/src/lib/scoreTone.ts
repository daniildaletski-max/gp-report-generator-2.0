/**
 * Single source of truth for "how good is this score" colour bands.
 *
 * Different score scales (total /22, appearance /12, game performance
 * /10, attitude /1, etc.) used to be coloured by ad-hoc inline
 * checks scattered across pages — leading to the same number being
 * "green" in one view and "amber" in another, and the FM losing
 * trust in the colour signal.
 *
 * This helper normalises every score onto its [0, 1] ratio against
 * its max and applies one set of band thresholds to all of them.
 *
 * Bands
 *   ratio >= 0.82  → success  (green) — total score 18/22 ≈ 0.818
 *   ratio >= 0.72  → warning  (amber) — total score 16/22 ≈ 0.727
 *   ratio <  0.72  → danger   (red)
 *
 * The 18/22 and 16/22 anchor points match the existing
 * "needs-improvement < 18, ok 16-18, good >= 18" thresholds used
 * across the app (Reports, Dashboard, scheduledReports, charts).
 *
 * `neutral` is returned for missing scores (NaN / undefined / 0
 * count of evaluations) so callers can render a "no data" colour
 * without a separate null check.
 */
export type ScoreTone = "success" | "warning" | "danger" | "neutral";

// Anchored to the app's existing total-score cutoffs (Reports / Dashboard /
// scheduledReports prompts all treat 18/22 as "good", 16/22 as the
// concerning floor). 18/22 = 0.8181…, 16/22 = 0.7272… — using exact
// fractions so a score of exactly 18 lands on the success threshold,
// not just below it.
export const SCORE_BAND_THRESHOLDS = {
  success: 18 / 22,
  warning: 16 / 22,
} as const;

/**
 * Resolve the tone for a (score, max) pair.
 *
 * `score` may be string ("18.5"), number, or null/undefined.
 * Anything that doesn't parse to a finite number returns "neutral".
 */
export function getScoreTone(
  score: number | string | null | undefined,
  max: number,
): ScoreTone {
  if (score == null) return "neutral";
  const n = typeof score === "string" ? Number(score) : score;
  if (!Number.isFinite(n) || max <= 0) return "neutral";
  const ratio = n / max;
  if (ratio >= SCORE_BAND_THRESHOLDS.success) return "success";
  if (ratio >= SCORE_BAND_THRESHOLDS.warning) return "warning";
  return "danger";
}

/**
 * Pre-canned Tailwind class strings per tone for callers that need
 * to colour something other than a Badge (e.g. a div backing colour
 * or text colour). Pairs nicely with `getScoreTone`.
 */
export const SCORE_TONE_CLASSES: Record<ScoreTone, {
  /** Foreground / text colour */
  text: string;
  /** Subtle background tint */
  bg: string;
  /** Border colour matching the tone */
  border: string;
}> = {
  success: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  warning: { text: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200" },
  danger:  { text: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200" },
  neutral: { text: "text-slate-600",   bg: "bg-slate-50",   border: "border-slate-200" },
};
