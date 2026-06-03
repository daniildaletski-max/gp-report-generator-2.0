import { describe, expect, it } from "vitest";
import {
  computeEvaluationScores,
  validateCriterionScores,
  DEFAULT_RUBRIC_V1,
  rubricMaxTotal,
  groupMaxTotal,
  criteriaByGroup,
  getCriterion,
  type CriterionScores,
} from "@shared/scoring";
import { SCORE_CONFIG, MAX_TOTAL_SCORE, MAX_APPEARANCE_SCORE, MAX_GAME_PERFORMANCE_SCORE } from "@shared/const";

/**
 * The legacy formula these tests pin the engine against, copied from the
 * pre-refactor `createEvaluation`:
 *   appearance = (hair||0)+(makeup||0)+(outfit||0)+(posture||0)
 *   game       = (dealingStyle||0)+(gamePerformance||0)
 *   total      = appearance + game
 */
function legacy(scores: CriterionScores) {
  const appearance =
    (scores.hair || 0) + (scores.makeup || 0) + (scores.outfit || 0) + (scores.posture || 0);
  const game = (scores.dealingStyle || 0) + (scores.gamePerformance || 0);
  return { appearance, game, total: appearance + game };
}

describe("DEFAULT_RUBRIC_V1 shape", () => {
  it("has the six known criteria in display order", () => {
    expect(DEFAULT_RUBRIC_V1.criteria.map((c) => c.key)).toEqual([
      "hair",
      "makeup",
      "outfit",
      "posture",
      "dealingStyle",
      "gamePerformance",
    ]);
  });

  it("max total matches MAX_TOTAL_SCORE (22)", () => {
    expect(rubricMaxTotal(DEFAULT_RUBRIC_V1)).toBe(MAX_TOTAL_SCORE);
    expect(rubricMaxTotal(DEFAULT_RUBRIC_V1)).toBe(22);
  });

  it("group maxes match appearance (12) and game (10)", () => {
    expect(groupMaxTotal(DEFAULT_RUBRIC_V1, "appearance")).toBe(MAX_APPEARANCE_SCORE);
    expect(groupMaxTotal(DEFAULT_RUBRIC_V1, "game")).toBe(MAX_GAME_PERFORMANCE_SCORE);
    expect(groupMaxTotal(DEFAULT_RUBRIC_V1, "appearance")).toBe(12);
    expect(groupMaxTotal(DEFAULT_RUBRIC_V1, "game")).toBe(10);
  });

  it("derives maxes from SCORE_CONFIG (no drift)", () => {
    for (const c of DEFAULT_RUBRIC_V1.criteria) {
      expect(c.maxScore).toBe(SCORE_CONFIG[c.key as keyof typeof SCORE_CONFIG].max);
      expect(c.label).toBe(SCORE_CONFIG[c.key as keyof typeof SCORE_CONFIG].label);
    }
  });

  it("groups criteria correctly", () => {
    expect(criteriaByGroup(DEFAULT_RUBRIC_V1, "appearance").map((c) => c.key)).toEqual([
      "hair",
      "makeup",
      "outfit",
      "posture",
    ]);
    expect(criteriaByGroup(DEFAULT_RUBRIC_V1, "game").map((c) => c.key)).toEqual([
      "dealingStyle",
      "gamePerformance",
    ]);
  });

  it("getCriterion looks up by key", () => {
    expect(getCriterion(DEFAULT_RUBRIC_V1, "hair")?.maxScore).toBe(3);
    expect(getCriterion(DEFAULT_RUBRIC_V1, "dealingStyle")?.maxScore).toBe(5);
    expect(getCriterion(DEFAULT_RUBRIC_V1, "nope")).toBeUndefined();
  });

  it("every criterion has a non-empty description", () => {
    for (const c of DEFAULT_RUBRIC_V1.criteria) {
      expect(c.description.length).toBeGreaterThan(0);
    }
  });
});

describe("computeEvaluationScores — faithfulness to legacy formula", () => {
  it("perfect scores → 12 / 10 / 22", () => {
    const scores = { hair: 3, makeup: 3, outfit: 3, posture: 3, dealingStyle: 5, gamePerformance: 5 };
    const r = computeEvaluationScores(scores, DEFAULT_RUBRIC_V1);
    expect(r.appearanceScore).toBe(12);
    expect(r.gamePerformanceTotalScore).toBe(10);
    expect(r.totalScore).toBe(22);
    expect(r.maxTotalScore).toBe(22);
  });

  it("matches the legacy formula across a sample of inputs", () => {
    const samples: CriterionScores[] = [
      { hair: 2, makeup: 3, outfit: 3, posture: 3, dealingStyle: 5, gamePerformance: 5 }, // 21
      { hair: 1, makeup: 1, outfit: 1, posture: 1, dealingStyle: 1, gamePerformance: 1 }, // 6
      { hair: 0, makeup: 0, outfit: 0, posture: 0, dealingStyle: 0, gamePerformance: 0 }, // 0
      { hair: 3, makeup: 2, outfit: 1, posture: 0, dealingStyle: 4, gamePerformance: 2 }, // 12
    ];
    for (const s of samples) {
      const want = legacy(s);
      const got = computeEvaluationScores(s, DEFAULT_RUBRIC_V1);
      expect(got.appearanceScore).toBe(want.appearance);
      expect(got.gamePerformanceTotalScore).toBe(want.game);
      expect(got.totalScore).toBe(want.total);
    }
  });

  it("treats null / undefined / missing keys as 0", () => {
    const r = computeEvaluationScores(
      { hair: 3, makeup: null, outfit: undefined, dealingStyle: 5 } as CriterionScores,
      DEFAULT_RUBRIC_V1,
    );
    // hair 3 + makeup 0 + outfit 0 + posture 0 = 3
    expect(r.appearanceScore).toBe(3);
    // dealingStyle 5 + gamePerformance 0 = 5
    expect(r.gamePerformanceTotalScore).toBe(5);
    expect(r.totalScore).toBe(8);
  });

  it("exposes per-criterion and group totals", () => {
    const r = computeEvaluationScores(
      { hair: 3, makeup: 2, outfit: 3, posture: 1, dealingStyle: 4, gamePerformance: 5 },
      DEFAULT_RUBRIC_V1,
    );
    expect(r.perCriterion).toEqual({
      hair: 3,
      makeup: 2,
      outfit: 3,
      posture: 1,
      dealingStyle: 4,
      gamePerformance: 5,
    });
    expect(r.groupTotals).toEqual({ appearance: 9, game: 9 });
  });
});

describe("computeEvaluationScores — clamp option", () => {
  it("does NOT clamp by default (preserves legacy raw sum)", () => {
    const r = computeEvaluationScores(
      { hair: 99, makeup: -5, outfit: 3, posture: 3, dealingStyle: 5, gamePerformance: 5 },
      DEFAULT_RUBRIC_V1,
    );
    // 99 + (-5) + 3 + 3 = 100 appearance, raw
    expect(r.appearanceScore).toBe(100);
  });

  it("clamps into [0, max] when asked", () => {
    const r = computeEvaluationScores(
      { hair: 99, makeup: -5, outfit: 3, posture: 3, dealingStyle: 99, gamePerformance: 5 },
      DEFAULT_RUBRIC_V1,
      { clamp: true },
    );
    // hair 3 + makeup 0 + outfit 3 + posture 3 = 9
    expect(r.appearanceScore).toBe(9);
    // dealingStyle 5 + gamePerformance 5 = 10
    expect(r.gamePerformanceTotalScore).toBe(10);
  });
});

describe("validateCriterionScores", () => {
  it("returns no issues for in-range scores", () => {
    expect(
      validateCriterionScores(
        { hair: 3, makeup: 2, outfit: 1, posture: 0, dealingStyle: 5, gamePerformance: 4 },
        DEFAULT_RUBRIC_V1,
      ),
    ).toEqual([]);
  });

  it("flags out-of-range scores", () => {
    const issues = validateCriterionScores(
      { hair: 5, makeup: -1, dealingStyle: 5 },
      DEFAULT_RUBRIC_V1,
    );
    const keys = issues.filter((i) => i.kind === "out_of_range").map((i) => i.key);
    expect(keys).toContain("hair"); // max 3
    expect(keys).toContain("makeup"); // < 0
    expect(keys).not.toContain("dealingStyle"); // 5 is valid (max 5)
  });

  it("flags unknown criteria", () => {
    const issues = validateCriterionScores(
      { hair: 3, voiceClarity: 2 } as CriterionScores,
      DEFAULT_RUBRIC_V1,
    );
    expect(issues.some((i) => i.kind === "unknown_criterion" && i.key === "voiceClarity")).toBe(true);
  });

  it("allows missing criteria (treated as 0, not an error)", () => {
    expect(validateCriterionScores({ hair: 3 }, DEFAULT_RUBRIC_V1)).toEqual([]);
  });
});
