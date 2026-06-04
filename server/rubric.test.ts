import { describe, expect, it } from "vitest";
import { assembleRubricVersion } from "./db/rubric";
import {
  computeEvaluationScores,
  validateRubricDraft,
  DEFAULT_RUBRIC_V1,
  type RubricCriterionDraft,
} from "@shared/scoring";

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

describe("validateRubricDraft", () => {
  const good: RubricCriterionDraft[] = [
    { key: "hair", label: "Hair", maxScore: 3, group: "appearance" },
    { key: "dealingStyle", label: "Dealing Style", maxScore: 5, group: "game" },
  ];

  it("accepts a well-formed draft", () => {
    expect(validateRubricDraft(good)).toEqual([]);
  });

  it("rejects an empty draft", () => {
    const issues = validateRubricDraft([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].index).toBeNull();
  });

  it("flags duplicate keys", () => {
    const issues = validateRubricDraft([
      { key: "hair", label: "Hair", maxScore: 3, group: "appearance" },
      { key: "hair", label: "Hair 2", maxScore: 2, group: "appearance" },
    ]);
    expect(issues.some((i) => /Duplicate/.test(i.message))).toBe(true);
  });

  it("flags missing key / label", () => {
    const issues = validateRubricDraft([
      { key: "", label: "", maxScore: 3, group: "appearance" },
    ]);
    expect(issues.some((i) => /key is required/.test(i.message))).toBe(true);
    expect(issues.some((i) => /label is required/.test(i.message))).toBe(true);
  });

  it("flags non-integer / sub-1 maxScore", () => {
    const issues = validateRubricDraft([
      { key: "hair", label: "Hair", maxScore: 0, group: "appearance" },
      { key: "makeup", label: "Makeup", maxScore: 2.5, group: "appearance" },
    ]);
    expect(issues.filter((i) => /maxScore/.test(i.message))).toHaveLength(2);
  });

  it("flags an invalid group", () => {
    const issues = validateRubricDraft([
      { key: "hair", label: "Hair", maxScore: 3, group: "bogus" as unknown as "appearance" },
    ]);
    expect(issues.some((i) => /invalid group/.test(i.message))).toBe(true);
  });
});
