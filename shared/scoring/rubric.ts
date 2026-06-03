/**
 * Rubric model — the data shape that describes *how* an evaluation is
 * scored: which criteria exist, what each is worth, and which group
 * (Appearance vs Game Performance) it rolls up into.
 *
 * Historically this lived as hardcoded columns on the `evaluations`
 * table plus `SCORE_CONFIG` in `shared/const.ts`, duplicated across the
 * Excel/Sheets exporters, the GP Portal and validation. That made
 * changing a criterion or a max score a multi-file release.
 *
 * This module makes the rubric a *value* — a `RubricVersionDef` — so a
 * single `computeEvaluationScores()` can score any evaluation against
 * any rubric version. `DEFAULT_RUBRIC_V1` encodes today's rubric
 * (Hair/Makeup/Outfit/Posture = 12, Dealing/Game Performance = 10,
 * total 22) and is derived from `SCORE_CONFIG` so the two can't drift.
 *
 * Phase 2 will load `RubricVersionDef`s from the database (rubric_*
 * tables) and tag each evaluation with the version it was scored under,
 * keeping historical scores comparable. The compute function does not
 * change — only where the rubric comes from.
 */
import { SCORE_CONFIG } from "../const";

/** The two roll-up buckets a criterion can belong to. These map 1:1 to
 *  the legacy `appearanceScore` / `gamePerformanceTotalScore` columns,
 *  so they stay fixed for v1-era rubrics. */
export type CriterionGroup = "appearance" | "game";

export interface RubricCriterion {
  /** Stable identifier, e.g. "hair". Matches the JSON key stored in
   *  `evaluations.scores` and the legacy `<key>Score` column stem. */
  key: string;
  /** Human label shown in UI / exports, e.g. "Hair". */
  label: string;
  /** Short, factual description of what the criterion measures. Surfaced
   *  as inline help when an FM enters a score. */
  description: string;
  /** Maximum points for this criterion. */
  maxScore: number;
  /** Which total this criterion rolls into. */
  group: CriterionGroup;
  /** Display order within the rubric (ascending). */
  sortOrder: number;
}

export interface RubricVersionDef {
  /** DB id of the rubric *version* this evaluation was scored under.
   *  `1` is the seeded original rubric. */
  rubricVersionId: number;
  /** Monotonic version number within a rubric (1, 2, 3, …). */
  version: number;
  /** Operator-facing label, e.g. "v1 — Original /22". */
  label: string;
  /** Ordered criteria. Treat as immutable once a version is locked. */
  criteria: RubricCriterion[];
}

// ---------------------------------------------------------------------------
// v1 — the original, currently-live rubric, expressed as data.
// Maxes & labels come straight from SCORE_CONFIG so there is exactly one
// source of truth for "Hair is worth 3". Group + order + description are
// the rubric-level metadata SCORE_CONFIG never carried.
// ---------------------------------------------------------------------------

const V1_GROUPS: Record<string, CriterionGroup> = {
  hair: "appearance",
  makeup: "appearance",
  outfit: "appearance",
  posture: "appearance",
  dealingStyle: "game",
  gamePerformance: "game",
};

/** Canonical display order for the v1 criteria. */
const V1_ORDER: Array<keyof typeof SCORE_CONFIG> = [
  "hair",
  "makeup",
  "outfit",
  "posture",
  "dealingStyle",
  "gamePerformance",
];

const V1_DESCRIPTIONS: Record<string, string> = {
  hair: "Neatness, styling and camera-readiness of hair.",
  makeup: "Camera-appropriate makeup application and upkeep.",
  outfit: "Uniform condition, fit and overall presentation.",
  posture: "Stance, body language and on-camera presence.",
  dealingStyle: "Accuracy, clarity and style of card / game handling.",
  gamePerformance: "Energy, engagement and overall game presentation.",
};

export const DEFAULT_RUBRIC_V1: RubricVersionDef = {
  rubricVersionId: 1,
  version: 1,
  label: "v1 — Original /22",
  criteria: V1_ORDER.map((key, i) => ({
    key,
    label: SCORE_CONFIG[key].label,
    description: V1_DESCRIPTIONS[key] ?? "",
    maxScore: SCORE_CONFIG[key].max,
    group: V1_GROUPS[key],
    sortOrder: i,
  })),
};

// ---------------------------------------------------------------------------
// Helpers — small pure utilities over a RubricVersionDef.
// ---------------------------------------------------------------------------

/** Look up a single criterion by key, or `undefined` if not in the rubric. */
export function getCriterion(
  rubric: RubricVersionDef,
  key: string,
): RubricCriterion | undefined {
  return rubric.criteria.find((c) => c.key === key);
}

/** Criteria belonging to a group, in display order. */
export function criteriaByGroup(
  rubric: RubricVersionDef,
  group: CriterionGroup,
): RubricCriterion[] {
  return rubric.criteria
    .filter((c) => c.group === group)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Sum of all criteria maxes — the rubric's maximum total score. */
export function rubricMaxTotal(rubric: RubricVersionDef): number {
  return rubric.criteria.reduce((sum, c) => sum + c.maxScore, 0);
}

/** Sum of maxes for one group (e.g. appearance max = 12 in v1). */
export function groupMaxTotal(
  rubric: RubricVersionDef,
  group: CriterionGroup,
): number {
  return rubric.criteria
    .filter((c) => c.group === group)
    .reduce((sum, c) => sum + c.maxScore, 0);
}
