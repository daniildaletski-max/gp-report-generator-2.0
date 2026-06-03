/**
 * The single source of truth for turning per-criterion scores into the
 * derived totals an evaluation carries (appearance, game performance,
 * and grand total).
 *
 * Before this module the same arithmetic was hand-rolled in at least
 * three places — `createEvaluation`, `updateEvaluation` (with three
 * separate SELECT round-trips), and the Excel/Sheets exporters — and
 * they didn't all agree (e.g. `createEvaluation` never set `totalScore`
 * on insert, so the router patched it with a follow-up UPDATE).
 *
 * `computeEvaluationScores` is pure and rubric-driven: give it the raw
 * criterion scores and the rubric they were scored under, and it
 * returns every derived figure. It is intentionally faithful to the
 * legacy formula by default (null → 0, raw sum, no clamping) so it can
 * replace the old inline math without changing a single stored number.
 */
import {
  RubricVersionDef,
  CriterionGroup,
  rubricMaxTotal,
} from "./rubric";

/** Raw, user/AI-supplied scores keyed by criterion. Missing or null
 *  values are treated as 0, matching the legacy `score || 0` behaviour. */
export type CriterionScores = Record<string, number | null | undefined>;

export interface ComputedScores {
  /** Coerced (and optionally clamped) score per criterion key. */
  perCriterion: Record<string, number>;
  /** Per-group subtotals (e.g. appearance, game). */
  groupTotals: Record<CriterionGroup, number>;
  /** Legacy alias for `groupTotals.appearance` — the column name the
   *  rest of the app still reads. */
  appearanceScore: number;
  /** Legacy alias for `groupTotals.game`. */
  gamePerformanceTotalScore: number;
  /** Sum of every criterion score. */
  totalScore: number;
  /** Sum of every criterion max for this rubric (e.g. 22 for v1). */
  maxTotalScore: number;
}

export interface ComputeOptions {
  /**
   * Clamp each criterion into `[0, maxScore]` before summing. Defaults
   * to `false` so the result is byte-for-byte identical to the legacy
   * raw-sum behaviour. Pass `true` when you want defensively-bounded
   * totals (e.g. recomputing after a manual edit you don't fully trust).
   */
  clamp?: boolean;
}

/** Coerce an unknown raw value to a finite number, defaulting to 0. */
function toNumber(v: number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Score one evaluation against a rubric. Pure — no IO, no mutation.
 */
export function computeEvaluationScores(
  rawScores: CriterionScores,
  rubric: RubricVersionDef,
  opts: ComputeOptions = {},
): ComputedScores {
  const perCriterion: Record<string, number> = {};
  const groupTotals: Record<CriterionGroup, number> = {
    appearance: 0,
    game: 0,
  };

  for (const criterion of rubric.criteria) {
    let value = toNumber(rawScores[criterion.key]);
    if (opts.clamp) {
      value = Math.max(0, Math.min(value, criterion.maxScore));
    }
    perCriterion[criterion.key] = value;
    groupTotals[criterion.group] += value;
  }

  const totalScore = Object.values(perCriterion).reduce((s, v) => s + v, 0);

  return {
    perCriterion,
    groupTotals,
    appearanceScore: groupTotals.appearance,
    gamePerformanceTotalScore: groupTotals.game,
    totalScore,
    maxTotalScore: rubricMaxTotal(rubric),
  };
}

export interface ScoreValidationIssue {
  key: string;
  /** "out_of_range" — score < 0 or > maxScore. "unknown_criterion" — a
   *  key in `rawScores` the rubric doesn't define. */
  kind: "out_of_range" | "unknown_criterion";
  message: string;
}

/**
 * Validate raw scores against a rubric without mutating anything.
 * Returns an empty array when everything is in range. Feeds the
 * "needs review" flagging and surfaces bad AI extractions early.
 */
export function validateCriterionScores(
  rawScores: CriterionScores,
  rubric: RubricVersionDef,
): ScoreValidationIssue[] {
  const issues: ScoreValidationIssue[] = [];
  const known = new Set(rubric.criteria.map((c) => c.key));

  for (const criterion of rubric.criteria) {
    const raw = rawScores[criterion.key];
    if (raw == null) continue; // missing is allowed (treated as 0)
    const value = toNumber(raw);
    if (value < 0 || value > criterion.maxScore) {
      issues.push({
        key: criterion.key,
        kind: "out_of_range",
        message: `${criterion.label} score ${value} is outside 0–${criterion.maxScore}.`,
      });
    }
  }

  for (const key of Object.keys(rawScores)) {
    if (!known.has(key)) {
      issues.push({
        key,
        kind: "unknown_criterion",
        message: `"${key}" is not a criterion in rubric "${rubric.label}".`,
      });
    }
  }

  return issues;
}
