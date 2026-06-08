import { describe, it, expect } from "vitest";
import {
  criterionBreakdown,
  gameBreakdown,
  scoreDistribution,
  buildAnalyticsOverview,
  previousPeriod,
  monthWindow,
  aggregateCriteriaTrend,
  topMovers,
  CRITERION_KEYS,
  type AnalyticsRow,
  type TrendRow,
} from "./analytics";

function trendRow(p: Partial<TrendRow>): TrendRow {
  return {
    month: 1, year: 2026, totalScore: null,
    hairScore: null, makeupScore: null, outfitScore: null,
    postureScore: null, dealingStyleScore: null, gamePerformanceScore: null,
    ...p,
  };
}

function row(p: Partial<AnalyticsRow>): AnalyticsRow {
  return {
    gamePresenterId: null,
    game: null,
    totalScore: null,
    hairScore: null,
    makeupScore: null,
    outfitScore: null,
    postureScore: null,
    dealingStyleScore: null,
    gamePerformanceScore: null,
    ...p,
  };
}

describe("criterionBreakdown", () => {
  it("returns all six criteria in canonical order", () => {
    expect(criterionBreakdown([]).map(c => c.key)).toEqual([...CRITERION_KEYS]);
  });

  it("averages a criterion and counts the sample size", () => {
    const cb = criterionBreakdown([row({ hairScore: 2 }), row({ hairScore: 4 })]);
    const hair = cb.find(c => c.key === "hair")!;
    expect(hair.avg).toBe(3); // (2 + 4) / 2
    expect(hair.sampleSize).toBe(2);
    expect(hair.prevAvg).toBeNull();
    expect(hair.delta).toBeNull();
  });

  it("excludes null values from the average and the sample size", () => {
    const cb = criterionBreakdown([row({ hairScore: 2 }), row({ hairScore: null }), row({ hairScore: 4 })]);
    const hair = cb.find(c => c.key === "hair")!;
    expect(hair.avg).toBe(3);
    expect(hair.sampleSize).toBe(2);
  });

  it("reports zero with an empty sample when a criterion never appears", () => {
    const outfit = criterionBreakdown([row({ hairScore: 3 })]).find(c => c.key === "outfit")!;
    expect(outfit.avg).toBe(0);
    expect(outfit.sampleSize).toBe(0);
  });

  it("computes the month-over-month delta when prior data exists", () => {
    const hair = criterionBreakdown([row({ hairScore: 3 })], [row({ hairScore: 2 })]).find(c => c.key === "hair")!;
    expect(hair.avg).toBe(3);
    expect(hair.prevAvg).toBe(2);
    expect(hair.delta).toBe(1);
  });

  it("leaves prevAvg/delta null when the prior period had no data for the criterion", () => {
    const hair = criterionBreakdown([row({ hairScore: 3 })], [row({ makeupScore: 2 })]).find(c => c.key === "hair")!;
    expect(hair.prevAvg).toBeNull();
    expect(hair.delta).toBeNull();
  });
});

describe("gameBreakdown", () => {
  it("groups by game with count + avg total, busiest first", () => {
    const gb = gameBreakdown([
      row({ game: "Baccarat", totalScore: 20 }),
      row({ game: "Baccarat", totalScore: 18 }),
      row({ game: "Roulette", totalScore: 15 }),
    ]);
    expect(gb[0]).toEqual({ name: "Baccarat", count: 2, avgTotal: 19 });
    expect(gb.find(g => g.name === "Roulette")).toEqual({ name: "Roulette", count: 1, avgTotal: 15 });
  });

  it("buckets missing/blank game names under 'Unspecified'", () => {
    const gb = gameBreakdown([row({ game: null, totalScore: 10 }), row({ game: "  ", totalScore: 12 })]);
    const unspecified = gb.find(g => g.name === "Unspecified")!;
    expect(unspecified.count).toBe(2);
    expect(unspecified.avgTotal).toBe(11);
  });
});

describe("scoreDistribution", () => {
  it("counts total scores into the four bands and ignores nulls", () => {
    const d = scoreDistribution([
      row({ totalScore: 22 }), row({ totalScore: 20 }), // excellent
      row({ totalScore: 18 }), // strong
      row({ totalScore: 13 }), row({ totalScore: 16 }), // fair
      row({ totalScore: 0 }), row({ totalScore: 12 }), // weak
      row({ totalScore: null }), // excluded
    ]);
    const by = Object.fromEntries(d.map(b => [b.bucket, b.count]));
    expect(by).toEqual({ excellent: 2, strong: 1, fair: 2, weak: 2 });
  });
});

describe("topMovers", () => {
  const cur = [
    row({ gamePresenterId: 1, totalScore: 20 }), // up from 14
    row({ gamePresenterId: 2, totalScore: 12 }), // down from 18
    row({ gamePresenterId: 3, totalScore: 15 }), // flat
    row({ gamePresenterId: 4, totalScore: 19 }), // no prior month
  ];
  const prev = [
    row({ gamePresenterId: 1, totalScore: 14 }),
    row({ gamePresenterId: 2, totalScore: 18 }),
    row({ gamePresenterId: 3, totalScore: 15 }),
  ];

  it("ranks improvers by largest gain and decliners by largest drop", () => {
    const { improvers, decliners } = topMovers(cur, prev);
    expect(improvers.map(m => m.gpId)).toEqual([1]);
    expect(improvers[0]).toMatchObject({ gpId: 1, avg: 20, prevAvg: 14, delta: 6 });
    expect(decliners.map(m => m.gpId)).toEqual([2]);
    expect(decliners[0].delta).toBe(-6);
  });

  it("excludes flat GPs and GPs absent from the prior month", () => {
    const ids = topMovers(cur, prev);
    const all = [...ids.improvers, ...ids.decliners].map(m => m.gpId);
    expect(all).not.toContain(3); // flat
    expect(all).not.toContain(4); // no prior month
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 8 }, (_, i) => row({ gamePresenterId: i + 1, totalScore: 20 }));
    const base = Array.from({ length: 8 }, (_, i) => row({ gamePresenterId: i + 1, totalScore: 10 }));
    expect(topMovers(many, base, 3).improvers).toHaveLength(3);
  });
});

describe("buildAnalyticsOverview", () => {
  it("assembles headline rollups and all sections", () => {
    const o = buildAnalyticsOverview(3, 2026, [
      row({ gamePresenterId: 1, totalScore: 20, game: "Baccarat" }),
      row({ gamePresenterId: 1, totalScore: 10, game: "Baccarat" }),
      row({ gamePresenterId: 2, totalScore: 18, game: "Roulette" }),
    ], []);
    expect(o.period).toEqual({ month: 3, year: 2026 });
    expect(o.totalEvaluations).toBe(3);
    expect(o.uniqueGps).toBe(2);
    expect(o.avgTotal).toBe(16); // (20 + 10 + 18) / 3
    expect(o.criteria).toHaveLength(6);
    expect(o.games).toHaveLength(2);
    expect(o.distribution).toHaveLength(4);
  });

  it("is empty-safe", () => {
    const o = buildAnalyticsOverview(1, 2026, [], []);
    expect(o.totalEvaluations).toBe(0);
    expect(o.uniqueGps).toBe(0);
    expect(o.avgTotal).toBe(0);
    expect(o.criteria).toHaveLength(6);
    expect(o.games).toEqual([]);
  });
});

describe("previousPeriod", () => {
  it("wraps January back to the previous December", () => {
    expect(previousPeriod(1, 2026)).toEqual({ month: 12, year: 2025 });
  });
  it("steps back one month within a year", () => {
    expect(previousPeriod(5, 2026)).toEqual({ month: 4, year: 2026 });
  });
});

describe("monthWindow", () => {
  it("returns n months ending at the given period, oldest first", () => {
    expect(monthWindow(3, 2026, 6)).toEqual([
      { month: 10, year: 2025 },
      { month: 11, year: 2025 },
      { month: 12, year: 2025 },
      { month: 1, year: 2026 },
      { month: 2, year: 2026 },
      { month: 3, year: 2026 },
    ]);
  });
  it("crosses the year boundary correctly", () => {
    expect(monthWindow(1, 2026, 3)).toEqual([
      { month: 11, year: 2025 },
      { month: 12, year: 2025 },
      { month: 1, year: 2026 },
    ]);
  });
});

describe("aggregateCriteriaTrend", () => {
  it("buckets rows into each period and averages per criterion", () => {
    const periods = [{ month: 1, year: 2026 }, { month: 2, year: 2026 }];
    const out = aggregateCriteriaTrend([
      trendRow({ month: 1, year: 2026, hairScore: 2, totalScore: 18 }),
      trendRow({ month: 1, year: 2026, hairScore: 4, totalScore: 20 }),
      trendRow({ month: 2, year: 2026, hairScore: 3, totalScore: 16 }),
    ], periods);
    expect(out).toHaveLength(2);
    expect(out[0].count).toBe(2);
    expect(out[0].avgTotal).toBe(19);
    expect(out[0].criteria.hair).toBe(3); // (2 + 4) / 2
    expect(out[0].criteria.makeup).toBeNull(); // no data
    expect(out[1].count).toBe(1);
    expect(out[1].criteria.hair).toBe(3);
    expect(out[0].label).toMatch(/^Jan/);
  });

  it("yields zero-count empty points for periods with no rows", () => {
    const out = aggregateCriteriaTrend([], [{ month: 4, year: 2026 }]);
    expect(out[0].count).toBe(0);
    expect(out[0].avgTotal).toBe(0);
    expect(out[0].criteria.hair).toBeNull();
  });
});
