/**
 * Performance Bonus engine — pure, deterministic implementation of the
 * company's documented bonus rule (see docs/bonus-calculation.md).
 *
 * Good Games (GGs) measure uninterrupted, error-free performance:
 *
 *     GGs = total games played / number of mistakes
 *
 *   • The first mistake is "free": 0 or 1 mistake → ALL games count
 *     (divisor 1). 2+ mistakes → divide by the FULL mistake count.
 *     This matches the doc's worked example exactly:
 *     5000 games / 2 mistakes = 2500 GGs.
 *     (NB: an earlier draft on a side-branch divided by `mistakes − 1`;
 *      that contradicts the documented example, so we follow the doc.)
 *
 *   Level 1: GGs ≥ 2500  → €1.50 (gross) per worked hour
 *   Level 2: GGs ≥ 5000  → €2.50 (gross) per worked hour
 *
 *     BONUS = level rate × worked hours
 *
 * Disqualifiers (active disciplinary cases / warnings / PDPs, or lateness
 * and sick-leave procedure violations) force "ineligible" regardless of
 * GGs. The bonus is paid only for hours actually worked, so the amount is
 * 0 until worked hours are recorded — a GP can be performance-eligible
 * (a level by GGs) yet earn €0 until their hours land.
 *
 * Pure & framework-free so it can run on the server, in tests, and (if
 * ever needed) in the browser. No DB, no IO.
 */

export const BONUS_CONFIG = {
  level1: { minGGs: 2500, rate: 1.5 },
  level2: { minGGs: 5000, rate: 2.5 },
} as const;

export type BonusLevel = "level1" | "level2" | "ineligible";

export interface BonusInput {
  /** Total games played in the month. */
  totalGames: number;
  /** Mistakes in the month (single source of truth: monthly_gp_stats.mistakes). */
  mistakes: number;
  /** Worked hours in the month (excludes sick leave / vacation). */
  workedHours: number;
  /** Pre-resolved disqualifiers; a non-empty list forces ineligible. */
  disqualifyingFactors?: string[];
}

export interface BonusResult {
  /** Good Games for the month. */
  ggs: number;
  /** Performance level reached (before the hours multiplier). */
  level: BonusLevel;
  /** €/hour for the reached level (0 when ineligible). */
  rate: number;
  /** Final bonus in € (gross) = rate × workedHours, rounded to cents. */
  amount: number;
  /** True when a level was reached and no disqualifier applies. The
   *  amount can still be 0 if no worked hours are recorded yet. */
  isEligible: boolean;
  /** GGs needed for the reached level (or for level 1 when ineligible). */
  minimumGGsRequired: number;
  /** Active disqualifiers (empty when eligible). */
  disqualifyingFactors: string[];
  /** Coaching: how many more GGs to reach the next level (null at top
   *  level or when disqualified). */
  gapToNext: { target: "level1" | "level2"; gapGGs: number } | null;
}

/** GGs = games / mistakes, with the "first mistake free" rule. */
export function computeGGs(totalGames: number, mistakes: number): number {
  const games = Math.max(0, Math.floor(totalGames || 0));
  const errs = Math.max(0, Math.floor(mistakes || 0));
  const divisor = errs <= 1 ? 1 : errs; // 0 or 1 mistake → all games count
  return Math.floor(games / divisor);
}

export function computeBonus(input: BonusInput): BonusResult {
  const factors = (input.disqualifyingFactors ?? []).filter(Boolean);
  const disqualified = factors.length > 0;
  const ggs = computeGGs(input.totalGames, input.mistakes);
  const hours = Math.max(0, input.workedHours || 0);

  let level: BonusLevel = "ineligible";
  let rate = 0;
  if (!disqualified && ggs >= BONUS_CONFIG.level2.minGGs) {
    level = "level2";
    rate = BONUS_CONFIG.level2.rate;
  } else if (!disqualified && ggs >= BONUS_CONFIG.level1.minGGs) {
    level = "level1";
    rate = BONUS_CONFIG.level1.rate;
  }

  const amount = Math.round(rate * hours * 100) / 100;
  const isEligible = level !== "ineligible";

  let gapToNext: BonusResult["gapToNext"] = null;
  if (!disqualified) {
    if (level === "ineligible") {
      gapToNext = { target: "level1", gapGGs: Math.max(0, BONUS_CONFIG.level1.minGGs - ggs) };
    } else if (level === "level1") {
      gapToNext = { target: "level2", gapGGs: Math.max(0, BONUS_CONFIG.level2.minGGs - ggs) };
    }
  }

  return {
    ggs,
    level,
    rate,
    amount,
    isEligible,
    minimumGGsRequired: level === "level2" ? BONUS_CONFIG.level2.minGGs : BONUS_CONFIG.level1.minGGs,
    disqualifyingFactors: factors,
    gapToNext,
  };
}

/** Human-readable label for a level (UI). */
export function bonusLevelLabel(level: BonusLevel): string {
  return level === "level2" ? "Level 2" : level === "level1" ? "Level 1" : "Not eligible";
}
