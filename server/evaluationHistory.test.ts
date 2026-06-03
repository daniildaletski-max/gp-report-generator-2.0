import { describe, expect, it } from "vitest";
import { diffEvaluation } from "./db/evaluationHistory";

describe("diffEvaluation", () => {
  it("returns only the changed fields", () => {
    const before = { hairScore: 3, makeupScore: 2, hairComment: "neat" };
    const after = { hairScore: 2, makeupScore: 2 }; // makeup unchanged, hair dropped
    expect(diffEvaluation(before, after)).toEqual({
      hairScore: { old: 3, new: 2 },
    });
  });

  it("only considers keys present in the update payload", () => {
    const before = { hairScore: 3, totalScore: 22, createdAt: new Date("2026-01-01") };
    const after = { hairScore: 3 }; // unchanged, and ignores totalScore/createdAt
    expect(diffEvaluation(before, after)).toEqual({});
  });

  it("treats null and undefined as equal (no spurious change)", () => {
    expect(diffEvaluation({ a: null }, { a: undefined })).toEqual({});
    expect(diffEvaluation({ a: undefined }, { a: null })).toEqual({});
  });

  it("normalises missing old/new to null in the recorded delta", () => {
    expect(diffEvaluation({}, { hairComment: "tidy" })).toEqual({
      hairComment: { old: null, new: "tidy" },
    });
  });

  it("compares dates by timestamp, not identity", () => {
    const before = { evaluationDate: new Date("2026-01-09T00:00:00Z") };
    const sameDate = { evaluationDate: new Date("2026-01-09T00:00:00Z") };
    const otherDate = { evaluationDate: new Date("2026-02-09T00:00:00Z") };
    expect(diffEvaluation(before, sameDate)).toEqual({});
    expect(Object.keys(diffEvaluation(before, otherDate))).toEqual(["evaluationDate"]);
  });

  it("compares the scores JSON object structurally", () => {
    const before = { scores: { hair: 3, makeup: 2 } };
    const same = { scores: { hair: 3, makeup: 2 } };
    const changed = { scores: { hair: 2, makeup: 2 } };
    expect(diffEvaluation(before, same)).toEqual({});
    expect(Object.keys(diffEvaluation(before, changed))).toEqual(["scores"]);
  });

  it("detects a comment edit", () => {
    const before = { postureComment: "leans" };
    const after = { postureComment: "stands tall" };
    expect(diffEvaluation(before, after)).toEqual({
      postureComment: { old: "leans", new: "stands tall" },
    });
  });
});
