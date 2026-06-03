import { describe, expect, it } from "vitest";
import { assembleRubricVersion } from "./db/rubric";
import { computeEvaluationScores, DEFAULT_RUBRIC_V1 } from "@shared/scoring";

/**
 * Rows as they'd come back from `rubric_versions` / `rubric_criteria`.
 * Deliberately supplied out of order to prove the assembler sorts.
 */
const versionRow = { id: 1, version: 1, label: "v1 — Original /22" };
const criteriaRows = [
  { key: "gamePerformance", label: "Game Performance", description: "energy", maxScore: 5, group: "game" as const, sortOrder: 5 },
  { key: "hair", label: "Hair", description: "neat", maxScore: 3, group: "appearance" as const, sortOrder: 0 },
  { key: "dealingStyle", label: "Dealing Style", description: null, maxScore: 5, group: "game" as const, sortOrder: 4 },
  { key: "makeup", label: "Makeup", description: "matte", maxScore: 3, group: "appearance" as const, sortOrder: 1 },
  { key: "outfit", label: "Outfit", description: "fit", maxScore: 3, group: "appearance" as const, sortOrder: 2 },
  { key: "posture", label: "Posture", description: "stance", maxScore: 3, group: "appearance" as const, sortOrder: 3 },
];

describe("assembleRubricVersion", () => {
  it("orders criteria by sortOrder", () => {
    const def = assembleRubricVersion(versionRow, criteriaRows);
    expect(def.criteria.map((c) => c.key)).toEqual([
      "hair", "makeup", "outfit", "posture", "dealingStyle", "gamePerformance",
    ]);
  });

  it("carries version identity", () => {
    const def = assembleRubricVersion(versionRow, criteriaRows);
    expect(def.rubricVersionId).toBe(1);
    expect(def.version).toBe(1);
    expect(def.label).toBe("v1 — Original /22");
  });

  it("maps null description to empty string", () => {
    const def = assembleRubricVersion(versionRow, criteriaRows);
    expect(def.criteria.find((c) => c.key === "dealingStyle")?.description).toBe("");
  });

  it("produces a rubric the engine scores identically to DEFAULT_RUBRIC_V1", () => {
    const assembled = assembleRubricVersion(versionRow, criteriaRows);
    const scores = { hair: 3, makeup: 2, outfit: 3, posture: 1, dealingStyle: 4, gamePerformance: 5 };
    const fromDb = computeEvaluationScores(scores, assembled);
    const fromCode = computeEvaluationScores(scores, DEFAULT_RUBRIC_V1);
    expect(fromDb.appearanceScore).toBe(fromCode.appearanceScore);
    expect(fromDb.gamePerformanceTotalScore).toBe(fromCode.gamePerformanceTotalScore);
    expect(fromDb.totalScore).toBe(fromCode.totalScore);
    expect(fromDb.maxTotalScore).toBe(fromCode.maxTotalScore);
  });

  it("does not mutate the input criteria array", () => {
    const input = [...criteriaRows];
    const snapshot = input.map((c) => c.key);
    assembleRubricVersion(versionRow, input);
    expect(input.map((c) => c.key)).toEqual(snapshot);
  });
});
