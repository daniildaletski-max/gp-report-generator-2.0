/**
 * Analytics — company-wide intelligence the Dashboard doesn't surface:
 * per-criterion strengths/weaknesses (with month-over-month deltas),
 * per-game and per-evaluator breakdowns, and the score distribution
 * across the whole roster.
 *
 * Architecture: the only database touch is a thin read that pulls the
 * period's raw evaluation rows. ALL shaping is done by the PURE functions
 * below (criterionBreakdown / gameBreakdown / evaluatorBreakdown /
 * scoreDistribution / buildAnalyticsOverview), so the aggregation logic is
 * unit-testable with plain literals and never needs a live connection.
 */
import { and, gte, sql } from "drizzle-orm";
import { evaluations } from "../../drizzle/schema";
import { getDb } from "./connection";

export const CRITERION_KEYS = [
  "hair", "makeup", "outfit", "posture", "dealingStyle", "gamePerformance",
] as const;
export type CriterionKey = (typeof CRITERION_KEYS)[number];

/** The six per-criterion score columns — shared by the single-period rows
 *  and the trend rows so one set of aggregators serves both. */
export type ScoreCols = {
  hairScore: number | null;
  makeupScore: number | null;
  outfitScore: number | null;
  postureScore: number | null;
  dealingStyleScore: number | null;
  gamePerformanceScore: number | null;
};

/** A single evaluation row, reduced to the columns analytics needs. A plain
 *  shape so the pure aggregators are trivial to test with object literals. */
export type AnalyticsRow = ScoreCols & {
  gamePresenterId: number | null;
  game: string | null;
  totalScore: number | null;
};

const SCORE_COLUMN: Record<CriterionKey, keyof ScoreCols> = {
  hair: "hairScore",
  makeup: "makeupScore",
  outfit: "outfitScore",
  posture: "postureScore",
  dealingStyle: "dealingStyleScore",
  gamePerformance: "gamePerformanceScore",
};

function mean(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// ---- PURE aggregators (unit-tested) ----------------------------------------

export type CriterionStat = {
  key: CriterionKey;
  /** Average score for the criterion this period, 1dp. */
  avg: number;
  /** Number of rows that carried a value for this criterion. */
  sampleSize: number;
  /** Average last period, or null when there was no prior data. */
  prevAvg: number | null;
  /** avg − prevAvg (1dp), or null when there's nothing to compare to. */
  delta: number | null;
};

export function criterionBreakdown(
  rows: AnalyticsRow[],
  prevRows: AnalyticsRow[] = [],
): CriterionStat[] {
  const avgFor = (data: AnalyticsRow[], key: CriterionKey) => {
    const col = SCORE_COLUMN[key];
    const vals = data.map(r => r[col]).filter(isNum);
    return { avg: vals.length ? mean(vals) : 0, n: vals.length };
  };
  return CRITERION_KEYS.map(key => {
    const cur = avgFor(rows, key);
    const prev = avgFor(prevRows, key);
    const prevAvg = prev.n > 0 ? round1(prev.avg) : null;
    const avg = round1(cur.avg);
    return {
      key,
      avg,
      sampleSize: cur.n,
      prevAvg,
      delta: prevAvg !== null && cur.n > 0 ? round1(avg - prevAvg) : null,
    };
  });
}

export type GroupStat = { name: string; count: number; avgTotal: number };

export function gameBreakdown(rows: AnalyticsRow[]): GroupStat[] {
  return groupAvgTotal(rows, r => (r.game && r.game.trim()) || "Unspecified");
}

/** Group rows by a key and return count + avg total score per group,
 *  sorted by volume (then avg, then name) so the busiest bucket leads. */
function groupAvgTotal(rows: AnalyticsRow[], keyOf: (r: AnalyticsRow) => string): GroupStat[] {
  const map = new Map<string, { count: number; totals: number[] }>();
  for (const r of rows) {
    const k = keyOf(r);
    const entry = map.get(k) ?? { count: 0, totals: [] };
    entry.count += 1;
    if (isNum(r.totalScore)) entry.totals.push(r.totalScore);
    map.set(k, entry);
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, count: v.count, avgTotal: v.totals.length ? round1(mean(v.totals)) : 0 }))
    .sort((a, b) => b.count - a.count || b.avgTotal - a.avgTotal || a.name.localeCompare(b.name));
}

export type DistributionBucket = { bucket: string; label: string; min: number; max: number; count: number };

/** Company-wide spread of evaluation total scores into fixed bands. */
export function scoreDistribution(rows: AnalyticsRow[]): DistributionBucket[] {
  const bands: Array<Omit<DistributionBucket, "count">> = [
    { bucket: "excellent", label: "Excellent", min: 20, max: 22 },
    { bucket: "strong", label: "Strong", min: 17, max: 19 },
    { bucket: "fair", label: "Fair", min: 13, max: 16 },
    { bucket: "weak", label: "Needs work", min: 0, max: 12 },
  ];
  return bands.map(b => ({
    ...b,
    count: rows.filter(r => isNum(r.totalScore) && r.totalScore >= b.min && r.totalScore <= b.max).length,
  }));
}

export type AnalyticsOverview = {
  period: { month: number; year: number };
  totalEvaluations: number;
  uniqueGps: number;
  avgTotal: number;
  criteria: CriterionStat[];
  games: GroupStat[];
  distribution: DistributionBucket[];
};

/** Assemble the full overview from already-fetched rows — PURE, unit-tested. */
export function buildAnalyticsOverview(
  month: number,
  year: number,
  rows: AnalyticsRow[],
  prevRows: AnalyticsRow[],
): AnalyticsOverview {
  const totals = rows.map(r => r.totalScore).filter(isNum);
  const uniqueGps = new Set(rows.map(r => r.gamePresenterId).filter(isNum)).size;
  return {
    period: { month, year },
    totalEvaluations: rows.length,
    uniqueGps,
    avgTotal: totals.length ? round1(mean(totals)) : 0,
    criteria: criterionBreakdown(rows, prevRows),
    games: gameBreakdown(rows),
    distribution: scoreDistribution(rows),
  };
}

// ---- DB read (thin) --------------------------------------------------------

const SELECT_COLS = {
  gamePresenterId: evaluations.gamePresenterId,
  game: evaluations.game,
  totalScore: evaluations.totalScore,
  hairScore: evaluations.hairScore,
  makeupScore: evaluations.makeupScore,
  outfitScore: evaluations.outfitScore,
  postureScore: evaluations.postureScore,
  dealingStyleScore: evaluations.dealingStyleScore,
  gamePerformanceScore: evaluations.gamePerformanceScore,
} as const;

async function fetchPeriodRows(db: any, month: number, year: number): Promise<AnalyticsRow[]> {
  return await db
    .select(SELECT_COLS)
    .from(evaluations)
    .where(and(
      sql`MONTH(${evaluations.evaluationDate}) = ${month}`,
      sql`YEAR(${evaluations.evaluationDate}) = ${year}`,
    ));
}

/** The calendar month immediately before the given one. */
export function previousPeriod(month: number, year: number): { month: number; year: number } {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

export async function getAnalyticsOverview(month: number, year: number): Promise<AnalyticsOverview> {
  const db = await getDb();
  if (!db) return buildAnalyticsOverview(month, year, [], []);
  const prev = previousPeriod(month, year);
  const [rows, prevRows] = await Promise.all([
    fetchPeriodRows(db, month, year),
    fetchPeriodRows(db, prev.month, prev.year),
  ]);
  return buildAnalyticsOverview(month, year, rows as AnalyticsRow[], prevRows as AnalyticsRow[]);
}

// ---- Criteria trend (multi-month) ------------------------------------------

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A trend row carries the period it belongs to alongside its scores. */
export type TrendRow = ScoreCols & {
  month: number;
  year: number;
  totalScore: number | null;
};

export type CriteriaTrendPoint = {
  month: number;
  year: number;
  label: string;
  count: number;
  avgTotal: number;
  /** Average per criterion for the period; null when it had no data. */
  criteria: Record<CriterionKey, number | null>;
};

/** The ordered list of the `n` calendar months ending at (month, year),
 *  oldest first. */
export function monthWindow(month: number, year: number, n: number): Array<{ month: number; year: number }> {
  const out: Array<{ month: number; year: number }> = [];
  let m = month;
  let y = year;
  for (let i = 0; i < n; i++) {
    out.unshift({ month: m, year: y });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** Bucket trend rows into the given ordered periods, averaging each
 *  criterion (and the total) per period — PURE, unit-tested. */
export function aggregateCriteriaTrend(
  rows: TrendRow[],
  periods: Array<{ month: number; year: number }>,
): CriteriaTrendPoint[] {
  return periods.map(p => {
    const inPeriod = rows.filter(r => r.month === p.month && r.year === p.year);
    const totals = inPeriod.map(r => r.totalScore).filter(isNum);
    const criteria = {} as Record<CriterionKey, number | null>;
    for (const key of CRITERION_KEYS) {
      const vals = inPeriod.map(r => r[SCORE_COLUMN[key]]).filter(isNum);
      criteria[key] = vals.length ? round1(mean(vals)) : null;
    }
    return {
      month: p.month,
      year: p.year,
      label: `${MONTH_SHORT[p.month - 1]} ${String(p.year).slice(2)}`,
      count: inPeriod.length,
      avgTotal: totals.length ? round1(mean(totals)) : 0,
      criteria,
    };
  });
}

const TREND_SELECT = {
  month: sql<number>`MONTH(${evaluations.evaluationDate})`,
  year: sql<number>`YEAR(${evaluations.evaluationDate})`,
  totalScore: evaluations.totalScore,
  hairScore: evaluations.hairScore,
  makeupScore: evaluations.makeupScore,
  outfitScore: evaluations.outfitScore,
  postureScore: evaluations.postureScore,
  dealingStyleScore: evaluations.dealingStyleScore,
  gamePerformanceScore: evaluations.gamePerformanceScore,
} as const;

export async function getCriteriaTrend(months: number): Promise<CriteriaTrendPoint[]> {
  const now = new Date();
  const periods = monthWindow(now.getMonth() + 1, now.getFullYear(), months);
  const db = await getDb();
  if (!db) return aggregateCriteriaTrend([], periods);
  // First day of the oldest month in the window — one range-filtered read.
  const start = periods[0];
  const startDate = new Date(start.year, start.month - 1, 1);
  const rows = await db
    .select(TREND_SELECT)
    .from(evaluations)
    .where(gte(evaluations.evaluationDate, startDate));
  return aggregateCriteriaTrend(rows as TrendRow[], periods);
}
