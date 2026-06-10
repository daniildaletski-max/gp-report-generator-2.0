import { describe, it, expect } from "vitest";
import {
  monthElapsedFraction,
  computeGoalProgress,
  overallGoalStatus,
  DEFAULT_GOAL_TARGETS,
  type GoalActuals,
  type GoalTargets,
} from "./goals";

function actuals(p: Partial<GoalActuals> = {}): GoalActuals {
  return {
    avgScore: 0, totalEvaluations: 0, completeGps: 0,
    totalGps: 0, coveragePct: 0, maxMistakes: 0,
    ...p,
  };
}

function targets(p: Partial<GoalTargets> = {}): GoalTargets {
  return { ...DEFAULT_GOAL_TARGETS, ...p };
}

describe("monthElapsedFraction", () => {
  it("is 0 before the month starts and 1 after it ends", () => {
    expect(monthElapsedFraction(6, 2026, new Date(2026, 4, 20))).toBe(0);
    expect(monthElapsedFraction(6, 2026, new Date(2026, 6, 2))).toBe(1);
  });
  it("is ~0.5 mid-month", () => {
    const f = monthElapsedFraction(6, 2026, new Date(2026, 5, 16)); // June 16 of a 30-day month
    expect(f).toBeGreaterThan(0.45);
    expect(f).toBeLessThan(0.55);
  });
});

describe("computeGoalProgress — avg score (not prorated)", () => {
  const t = targets({ targetAvgScore: 18, targetCoveragePct: null, targetMaxMistakes: null });

  it("achieved when the average meets the target", () => {
    const [item] = computeGoalProgress(t, actuals({ avgScore: 18.4, totalEvaluations: 40 }), 0.5);
    expect(item.key).toBe("avg_score");
    expect(item.status).toBe("achieved");
    expect(item.pct).toBe(100);
  });
  it("on_track within 5% of target", () => {
    const [item] = computeGoalProgress(t, actuals({ avgScore: 17.2, totalEvaluations: 40 }), 0.5);
    expect(item.status).toBe("on_track");
  });
  it("at_risk within 15% of target", () => {
    const [item] = computeGoalProgress(t, actuals({ avgScore: 15.5, totalEvaluations: 40 }), 0.5);
    expect(item.status).toBe("at_risk");
  });
  it("behind when far off", () => {
    const [item] = computeGoalProgress(t, actuals({ avgScore: 12, totalEvaluations: 40 }), 0.5);
    expect(item.status).toBe("behind");
  });
  it("with zero evaluations: on_track early in the month, at_risk later", () => {
    const early = computeGoalProgress(t, actuals(), 0.2)[0];
    const late = computeGoalProgress(t, actuals(), 0.6)[0];
    expect(early.status).toBe("on_track");
    expect(late.status).toBe("at_risk");
    expect(early.pct).toBe(0);
  });
});

describe("computeGoalProgress — coverage (prorated)", () => {
  const t = targets({ targetAvgScore: null, targetCoveragePct: 80, targetMaxMistakes: null });

  it("achieved when coverage meets the target outright", () => {
    const [item] = computeGoalProgress(t, actuals({ coveragePct: 85, completeGps: 17, totalGps: 20 }), 0.4);
    expect(item.key).toBe("coverage");
    expect(item.status).toBe("achieved");
  });
  it("on_track when at or above the prorated expectation", () => {
    // halfway through the month, expected = 40%; actual 45% is pacing fine
    const [item] = computeGoalProgress(t, actuals({ coveragePct: 45 }), 0.5);
    expect(item.status).toBe("on_track");
  });
  it("at_risk when between 60% and 100% of the prorated expectation", () => {
    // expected 40%, actual 30% → 75% of pace
    const [item] = computeGoalProgress(t, actuals({ coveragePct: 30 }), 0.5);
    expect(item.status).toBe("at_risk");
  });
  it("behind when under 60% of the prorated expectation", () => {
    // expected 40%, actual 10% → 25% of pace
    const [item] = computeGoalProgress(t, actuals({ coveragePct: 10 }), 0.5);
    expect(item.status).toBe("behind");
  });
});

describe("computeGoalProgress — mistakes ceiling (never prorated)", () => {
  const t = targets({ targetAvgScore: null, targetCoveragePct: null, targetMaxMistakes: 3 });

  it("achieved when nobody has a single mistake", () => {
    const [item] = computeGoalProgress(t, actuals({ maxMistakes: 0 }), 0.9);
    expect(item.key).toBe("mistakes");
    expect(item.status).toBe("achieved");
  });
  it("on_track while the worst GP is within the ceiling", () => {
    const [item] = computeGoalProgress(t, actuals({ maxMistakes: 3 }), 0.5);
    expect(item.status).toBe("on_track");
  });
  it("at_risk when over by at most 2", () => {
    const [item] = computeGoalProgress(t, actuals({ maxMistakes: 5 }), 0.5);
    expect(item.status).toBe("at_risk");
  });
  it("behind when far over the ceiling", () => {
    const [item] = computeGoalProgress(t, actuals({ maxMistakes: 8 }), 0.5);
    expect(item.status).toBe("behind");
  });
});

describe("computeGoalProgress — composition", () => {
  it("skips metrics whose target is null", () => {
    const items = computeGoalProgress(
      targets({ targetAvgScore: null, targetCoveragePct: null, targetMaxMistakes: null }),
      actuals({ avgScore: 19, totalEvaluations: 10 }),
      0.5,
    );
    expect(items).toEqual([]);
  });
  it("emits all tracked metrics in a stable order", () => {
    const items = computeGoalProgress(
      targets({ targetMaxMistakes: 3 }),
      actuals({ avgScore: 18.5, totalEvaluations: 10, coveragePct: 90, maxMistakes: 1 }),
      0.5,
    );
    expect(items.map(i => i.key)).toEqual(["avg_score", "coverage", "mistakes"]);
  });
});

describe("overallGoalStatus", () => {
  it("is null with no tracked metrics", () => {
    expect(overallGoalStatus([])).toBeNull();
  });
  it("takes the worst status across metrics", () => {
    const items = computeGoalProgress(
      targets({ targetMaxMistakes: 3 }),
      actuals({ avgScore: 18.5, totalEvaluations: 10, coveragePct: 10, maxMistakes: 0 }),
      0.5,
    );
    // avg achieved, coverage behind, mistakes achieved → behind overall
    expect(overallGoalStatus(items)).toBe("behind");
  });
});
