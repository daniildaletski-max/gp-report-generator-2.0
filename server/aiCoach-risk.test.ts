/**
 * Tests for the deterministic risk scorer in aiCoachService.
 *
 * The scorer is the only piece of FM Copilot that doesn't depend on
 * either the DB or an LLM call, so it's the part we lock down with
 * tests. The rest of the service is integration-heavy and is exercised
 * end-to-end via the router tests.
 */
import { describe, it, expect } from "vitest";
import { computeRiskScore, type RiskInputs } from "./services/aiCoachService";

const baseline: RiskInputs = {
  thisMonth: { sick: 0, missed: 0, late: 0, mistakes: 0, avgScore: 18, evalCount: 4 },
  lastMonth: { sick: 0, missed: 0, late: 0, mistakes: 0, avgScore: 18 },
  daysSinceLastEval: 7,
};

describe("computeRiskScore", () => {
  it("returns near-zero risk for a steady GP", () => {
    const { score, signals } = computeRiskScore(baseline);
    expect(score).toBeLessThan(10);
    expect(signals).toHaveLength(0);
  });

  it("flags attendance momentum (sick spike)", () => {
    const { score, signals } = computeRiskScore({
      ...baseline,
      thisMonth: { ...baseline.thisMonth, sick: 4 },
    });
    expect(score).toBeGreaterThan(15);
    expect(signals.some(s => /sick/.test(s))).toBe(true);
  });

  it("flags score regression of >=1.5 as 35-point hit", () => {
    const { score, signals } = computeRiskScore({
      ...baseline,
      thisMonth: { ...baseline.thisMonth, avgScore: 16 }, // -2 vs lastMonth 18
    });
    expect(score).toBeGreaterThanOrEqual(35);
    expect(signals.some(s => /score down/i.test(s))).toBe(true);
  });

  it("flags soft score easing in the 0.5-1.5 band", () => {
    const { score, signals } = computeRiskScore({
      ...baseline,
      thisMonth: { ...baseline.thisMonth, avgScore: 17.2 }, // -0.8
    });
    expect(score).toBeGreaterThanOrEqual(15);
    expect(score).toBeLessThan(35);
    expect(signals.some(s => /score easing/i.test(s))).toBe(true);
  });

  it("flags eval staleness when no eval in 21+ days", () => {
    const { score, signals } = computeRiskScore({
      ...baseline,
      daysSinceLastEval: 30,
    });
    expect(score).toBeGreaterThanOrEqual(15);
    expect(signals.some(s => /No evaluation/.test(s))).toBe(true);
  });

  it("caps the total score at 100", () => {
    const { score } = computeRiskScore({
      thisMonth: { sick: 10, missed: 8, late: 10, mistakes: 20, avgScore: 5, evalCount: 2 },
      lastMonth: { sick: 0, missed: 0, late: 0, mistakes: 0, avgScore: 20 },
      daysSinceLastEval: 60,
    });
    expect(score).toBe(100);
  });

  it("does not penalise score regression when there are no evals this month", () => {
    const { signals } = computeRiskScore({
      ...baseline,
      thisMonth: { ...baseline.thisMonth, avgScore: 0, evalCount: 0 },
      lastMonth: { ...baseline.lastMonth, avgScore: 18 },
    });
    // No score-related signal — scorer correctly distinguishes
    // "missing data" from "real regression".
    expect(signals.every(s => !/score/i.test(s))).toBe(true);
  });

  it("does not flag eval staleness for never-evaluated GPs as harshly", () => {
    const { score, signals } = computeRiskScore({
      ...baseline,
      daysSinceLastEval: 999,
    });
    // Never-evaluated penalty is smaller than the 21-day warning.
    expect(score).toBeLessThan(15);
    expect(signals.some(s => /Never/.test(s))).toBe(true);
  });
});
