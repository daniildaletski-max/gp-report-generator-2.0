import { describe, it, expect } from "vitest";
import { formatAnalyticsForPrompt, executiveSummaryUserPrompt } from "./executiveSummary";
import type { AnalyticsOverview } from "../db/analytics";

function makeOverview(p: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  return {
    period: { month: 3, year: 2026 },
    totalEvaluations: 0,
    uniqueGps: 0,
    avgTotal: 0,
    criteria: [
      { key: "hair", avg: 2.4, sampleSize: 10, prevAvg: 2.1, delta: 0.3 },
      { key: "makeup", avg: 2.8, sampleSize: 10, prevAvg: 2.6, delta: 0.2 },
      { key: "outfit", avg: 2.6, sampleSize: 10, prevAvg: 2.6, delta: 0 },
      { key: "posture", avg: 2.7, sampleSize: 10, prevAvg: 2.7, delta: 0 },
      { key: "dealingStyle", avg: 4.5, sampleSize: 10, prevAvg: 4.4, delta: 0.1 },
      { key: "gamePerformance", avg: 2.0, sampleSize: 10, prevAvg: 3.0, delta: -1.0 },
    ],
    games: [
      { name: "Baccarat", count: 8, avgTotal: 18.4 },
      { name: "Roulette", count: 4, avgTotal: 17.1 },
    ],
    distribution: [
      { bucket: "excellent", label: "Excellent", min: 20, max: 22, count: 3 },
      { bucket: "strong", label: "Strong", min: 17, max: 19, count: 6 },
      { bucket: "fair", label: "Fair", min: 13, max: 16, count: 1 },
      { bucket: "weak", label: "Needs work", min: 0, max: 12, count: 0 },
    ],
    movers: {
      improvers: [{ gpId: 1, avg: 20, prevAvg: 14, delta: 6, evals: 4 }],
      decliners: [{ gpId: 2, avg: 12, prevAvg: 18, delta: -6, evals: 3 }],
    },
    ...p,
  };
}

describe("formatAnalyticsForPrompt", () => {
  const names = new Map<number, string>([[1, "Anna"], [2, "Marko"]]);

  it("opens with the company + period and the headline numbers", () => {
    const out = formatAnalyticsForPrompt(makeOverview({ totalEvaluations: 12, uniqueGps: 7, avgTotal: 18.3 }), names);
    expect(out).toMatch(/^Company: /);
    expect(out).toContain("Period: March 2026");
    expect(out).toContain("Total evaluations: 12");
    expect(out).toContain("GPs evaluated: 7");
    expect(out).toContain("Average total score: 18.3/22");
  });

  it("calls out strongest and weakest criteria by % of max", () => {
    // Fixture %s: Makeup 93, Dealing 90, Posture 90, Outfit 87, Hair 80, GamePerf 40
    const out = formatAnalyticsForPrompt(makeOverview(), names);
    expect(out).toContain("=== STRENGTHS (best-scoring criteria) ===");
    expect(out).toContain("=== FOCUS AREAS (weakest-scoring criteria) ===");
    const focus = out.slice(out.indexOf("FOCUS AREAS"), out.indexOf("=== ALL CRITERIA"));
    expect(focus).toContain("Game Performance");
    // Hair (80%) is second-weakest by %, so it should be in focus areas too.
    expect(focus).toContain("Hair");
    const strengths = out.slice(out.indexOf("STRENGTHS"), out.indexOf("FOCUS AREAS"));
    // Top two by % of max are Makeup (93%) and Dealing or Posture (both 90%).
    expect(strengths).toContain("Makeup");
  });

  it("renders MoM deltas with explicit signs and 'n/a' when missing", () => {
    const out = formatAnalyticsForPrompt(makeOverview({
      criteria: [
        { key: "hair", avg: 2.4, sampleSize: 5, prevAvg: 2.0, delta: 0.4 },
        { key: "makeup", avg: 2.0, sampleSize: 5, prevAvg: null, delta: null },
        { key: "outfit", avg: 2.5, sampleSize: 5, prevAvg: 2.5, delta: 0 },
        { key: "posture", avg: 2.0, sampleSize: 5, prevAvg: 2.0, delta: 0 },
        { key: "dealingStyle", avg: 4.0, sampleSize: 5, prevAvg: 4.0, delta: 0 },
        { key: "gamePerformance", avg: 3.0, sampleSize: 5, prevAvg: 3.0, delta: 0 },
      ],
    }), names);
    expect(out).toContain("MoM +0.4");
    expect(out).toContain("MoM n/a");
    expect(out).toContain("MoM 0.0");
  });

  it("shows score distribution and per-game lines", () => {
    const out = formatAnalyticsForPrompt(makeOverview(), names);
    expect(out).toContain("Excellent (20-22): 3");
    expect(out).toContain("Strong (17-19): 6");
    expect(out).toContain("Baccarat: avg 18.4/22 across 8 evals");
  });

  it("resolves GP ids to names for movers", () => {
    const out = formatAnalyticsForPrompt(makeOverview(), names);
    expect(out).toContain("Anna: 14.0 -> 20.0 (+6.0, 4 evals)");
    expect(out).toContain("Marko: 18.0 -> 12.0 (-6.0, 3 evals)");
  });

  it("falls back to 'GP #id' when a name isn't supplied", () => {
    const out = formatAnalyticsForPrompt(makeOverview(), new Map());
    expect(out).toContain("GP #1");
  });

  it("omits mover sections when none exist", () => {
    const out = formatAnalyticsForPrompt(
      makeOverview({ movers: { improvers: [], decliners: [] } }),
      names,
    );
    expect(out).not.toContain("MOST IMPROVED");
    expect(out).not.toContain("BIGGEST DROPS");
  });

  it("limits the per-game section to the 5 busiest games", () => {
    const games = Array.from({ length: 8 }, (_, i) => ({ name: `Game-${i}`, count: 10 - i, avgTotal: 18 }));
    const out = formatAnalyticsForPrompt(makeOverview({ games }), names);
    const gameLines = out.split("\n").filter(l => /^- Game-\d+:/.test(l));
    expect(gameLines).toHaveLength(5);
    expect(gameLines[0]).toContain("Game-0");
    expect(gameLines[4]).toContain("Game-4");
  });
});

describe("executiveSummaryUserPrompt", () => {
  it("wraps the formatted block with the report instruction", () => {
    const p = executiveSummaryUserPrompt("HELLO");
    expect(p).toMatch(/^Write the executive summary/);
    expect(p).toContain("HELLO");
  });
});
