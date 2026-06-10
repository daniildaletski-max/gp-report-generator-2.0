/**
 * Leaderboard & company analytics.
 *
 * Now that there is one shared database, this ranks EVERY game presenter
 * company-wide for a month and rolls up company-level analytics (score
 * distribution, month-over-month movers). Pure aggregation over the
 * global read functions — no team/user scoping.
 */
import * as db from "../db";
import { MAX_TOTAL_SCORE } from "../../shared/const";

export interface LeaderboardRow {
  rank: number;
  gpId: number;
  gpName: string;
  evalCount: number;
  avgTotal: number;
  avgAppearance: number;
  avgPerformance: number;
  highScore: number;
  lowScore: number;
  attitude: number | null;
  mistakes: number;
  /** Average total in the previous month, when the GP had evals then. */
  prevAvgTotal: number | null;
  /** avgTotal − prevAvgTotal (month-over-month movement). */
  delta: number | null;
}

export interface LeaderboardResult {
  month: number;
  year: number;
  rows: LeaderboardRow[];
  analytics: {
    totalGPs: number;
    rankedGPs: number;
    totalEvaluations: number;
    avgTotal: number;
    medianTotal: number;
    /** Score-band distribution of GP averages (out of MAX_TOTAL_SCORE). */
    distribution: { band: string; min: number; count: number }[];
    topImprovers: Array<{ gpId: number; gpName: string; delta: number; avgTotal: number }>;
    topDecliners: Array<{ gpId: number; gpName: string; delta: number; avgTotal: number }>;
  };
}

interface EvalAgg { count: number; total: number; appearance: number; performance: number; high: number; low: number }

function aggregateEvals(evals: Array<{ gamePresenterId: number; totalScore: number | null; appearanceScore: number | null; gamePerformanceTotalScore: number | null }>): Map<number, EvalAgg> {
  const m = new Map<number, EvalAgg>();
  for (const e of evals) {
    const t = e.totalScore ?? 0;
    const a = e.appearanceScore ?? 0;
    const p = e.gamePerformanceTotalScore ?? 0;
    const cur = m.get(e.gamePresenterId) ?? { count: 0, total: 0, appearance: 0, performance: 0, high: -Infinity, low: Infinity };
    cur.count += 1;
    cur.total += t;
    cur.appearance += a;
    cur.performance += p;
    cur.high = Math.max(cur.high, t);
    cur.low = Math.min(cur.low, t);
    m.set(e.gamePresenterId, cur);
  }
  return m;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function getLeaderboard(month: number, year: number): Promise<LeaderboardResult> {
  const prevDate = new Date(year, month - 2, 1); // month is 1-based
  const prevMonth = prevDate.getMonth() + 1;
  const prevYear = prevDate.getFullYear();

  const [gps, monthEvals, prevEvals, statsRows] = await Promise.all([
    db.getAllGamePresenters(),
    db.getEvaluationsByMonth(year, month),
    db.getEvaluationsByMonth(prevYear, prevMonth),
    db.getAllMonthlyGpStats(month, year),
  ]);

  const agg = aggregateEvals(monthEvals as any);
  const prevAgg = aggregateEvals(prevEvals as any);
  const statsByGp = new Map<number, { attitude: number | null; mistakes: number }>();
  for (const r of statsRows as Array<{ stats: { gamePresenterId: number; attitude: number | null; mistakes: number | null }; gp: unknown }>) {
    statsByGp.set(r.stats.gamePresenterId, { attitude: r.stats.attitude ?? null, mistakes: r.stats.mistakes ?? 0 });
  }
  const rows: LeaderboardRow[] = [];
  for (const gp of gps) {
    const a = agg.get(gp.id);
    if (!a || a.count === 0) continue; // only GPs evaluated this month make the board
    const avgTotal = round1(a.total / a.count);
    const prev = prevAgg.get(gp.id);
    const prevAvgTotal = prev && prev.count > 0 ? round1(prev.total / prev.count) : null;
    const st = statsByGp.get(gp.id);
    rows.push({
      rank: 0,
      gpId: gp.id,
      gpName: gp.name,
      evalCount: a.count,
      avgTotal,
      avgAppearance: round1(a.appearance / a.count),
      avgPerformance: round1(a.performance / a.count),
      highScore: a.high === -Infinity ? 0 : a.high,
      lowScore: a.low === Infinity ? 0 : a.low,
      attitude: st?.attitude ?? null,
      mistakes: st?.mistakes ?? 0,
      prevAvgTotal,
      delta: prevAvgTotal != null ? round1(avgTotal - prevAvgTotal) : null,
    });
  }

  // Rank by avg total, then eval count, then name.
  rows.sort((x, y) => y.avgTotal - x.avgTotal || y.evalCount - x.evalCount || x.gpName.localeCompare(y.gpName));
  rows.forEach((r, i) => { r.rank = i + 1; });

  // Analytics
  const totals = rows.map(r => r.avgTotal).sort((a, b) => a - b);
  const median = totals.length === 0 ? 0
    : totals.length % 2 === 1 ? totals[(totals.length - 1) / 2]
    : round1((totals[totals.length / 2 - 1] + totals[totals.length / 2]) / 2);
  const avgTotalCompany = totals.length ? round1(totals.reduce((s, n) => s + n, 0) / totals.length) : 0;

  // Distribution bands relative to the max score (22 by default).
  const bands = [
    { band: "Excellent", min: Math.round(MAX_TOTAL_SCORE * 0.9) },
    { band: "Strong", min: Math.round(MAX_TOTAL_SCORE * 0.8) },
    { band: "Solid", min: Math.round(MAX_TOTAL_SCORE * 0.7) },
    { band: "Needs work", min: 0 },
  ];
  const distribution = bands.map((b, i) => {
    const upper = i === 0 ? Infinity : bands[i - 1].min;
    return { band: b.band, min: b.min, count: rows.filter(r => r.avgTotal >= b.min && r.avgTotal < upper).length };
  });

  const movers = rows.filter(r => r.delta != null) as Array<LeaderboardRow & { delta: number }>;
  const topImprovers = [...movers].filter(r => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5)
    .map(r => ({ gpId: r.gpId, gpName: r.gpName, delta: r.delta, avgTotal: r.avgTotal }));
  const topDecliners = [...movers].filter(r => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5)
    .map(r => ({ gpId: r.gpId, gpName: r.gpName, delta: r.delta, avgTotal: r.avgTotal }));

  return {
    month, year, rows,
    analytics: {
      totalGPs: gps.length,
      rankedGPs: rows.length,
      totalEvaluations: monthEvals.length,
      avgTotal: avgTotalCompany,
      medianTotal: median,
      distribution,
      topImprovers,
      topDecliners,
    },
  };
}
