/**
 * Company goals — the management layer: monthly targets + live progress.
 *
 * Architecture mirrors the other feature modules: an idempotent boot-time
 * table installer, PURE progress/status logic (unit-tested with literals,
 * no DB or clock dependency), and thin read/write + actuals queries.
 *
 * Status vocabulary (drives the chips everywhere):
 *   - achieved  — target met outright.
 *   - on_track  — pacing to meet the target by month end.
 *   - at_risk   — meaningfully behind pace; recoverable.
 *   - behind    — far off pace / ceiling blown.
 */
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { companyGoals, evaluations, gamePresenters, monthlyGpStats, type CompanyGoals } from "../../drizzle/schema";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";

const log = createLogger("DB:Goals");

// ============================================
// SCHEMA (idempotent boot installer)
// ============================================

export async function ensureGoalsSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS \`company_goals\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`month\` int NOT NULL,
      \`year\` int NOT NULL,
      \`targetAvgScore\` double NULL,
      \`targetCoveragePct\` int NULL,
      \`targetEvalsPerGp\` int NOT NULL DEFAULT 10,
      \`targetMaxMistakes\` int NULL,
      \`notes\` text NULL,
      \`updatedById\` int NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY \`uq_company_goals_period\` (\`year\`, \`month\`)
    )`),
  );
  log.info("Company goals table ensured");
}

// ============================================
// PURE: progress + status (unit-tested)
// ============================================

export type GoalStatus = "achieved" | "on_track" | "at_risk" | "behind";

export type GoalTargets = {
  targetAvgScore: number | null;
  targetCoveragePct: number | null;
  targetEvalsPerGp: number;
  targetMaxMistakes: number | null;
};

export type GoalActuals = {
  avgScore: number;
  totalEvaluations: number;
  completeGps: number;
  totalGps: number;
  coveragePct: number;
  /** Worst single-GP mistake count this month. */
  maxMistakes: number;
};

export type GoalProgressItem = {
  key: "avg_score" | "coverage" | "mistakes";
  label: string;
  target: number;
  actual: number;
  unit: "score" | "%" | "count";
  /** 0-100, clamped; for the ceiling metric this is "headroom used". */
  pct: number;
  status: GoalStatus;
  detail: string;
};

/** Sensible defaults shown until an admin sets real targets. */
export const DEFAULT_GOAL_TARGETS: GoalTargets = {
  targetAvgScore: 18,
  targetCoveragePct: 80,
  targetEvalsPerGp: 10,
  targetMaxMistakes: null,
};

/**
 * Fraction of the (month, year) period elapsed at `now`, clamped to 0..1.
 * Before the month → 0; after it → 1. Pure so tests can pin the clock.
 */
export function monthElapsedFraction(month: number, year: number, now: Date): number {
  const start = new Date(year, month - 1, 1).getTime();
  const end = new Date(year, month, 1).getTime(); // first instant of next month
  const t = now.getTime();
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Turn targets + actuals into per-metric progress items. PURE.
 *
 * Rules (explicit so the unit tests read as the spec):
 *  - avg_score (an average — NOT prorated):
 *      no evaluations yet → pct 0; on_track while <1/3 of the month has
 *      passed, at_risk after. Otherwise: achieved when actual >= target;
 *      on_track >= 95% of target; at_risk >= 85%; else behind.
 *  - coverage (cumulative — prorated): expected = target × elapsed.
 *      achieved when actual >= target; on_track when actual >= expected;
 *      at_risk when actual >= 60% of expected; else behind.
 *  - mistakes (a ceiling): on_track while the worst GP is within the
 *      ceiling (achieved when zero mistakes at all); at_risk when over by
 *      at most 2; else behind. Never prorated.
 *
 * Metrics whose target is null/<=0 are skipped (= not tracked).
 */
export function computeGoalProgress(
  targets: GoalTargets,
  actuals: GoalActuals,
  elapsed: number,
): GoalProgressItem[] {
  const items: GoalProgressItem[] = [];
  const e = Math.max(0, Math.min(1, elapsed));

  if (targets.targetAvgScore != null && targets.targetAvgScore > 0) {
    const target = targets.targetAvgScore;
    const actual = actuals.avgScore;
    let status: GoalStatus;
    if (actuals.totalEvaluations === 0) {
      status = e < 1 / 3 ? "on_track" : "at_risk";
    } else if (actual >= target) {
      status = "achieved";
    } else if (actual >= target * 0.95) {
      status = "on_track";
    } else if (actual >= target * 0.85) {
      status = "at_risk";
    } else {
      status = "behind";
    }
    items.push({
      key: "avg_score",
      label: "Average score",
      target,
      actual: Number(actual.toFixed(1)),
      unit: "score",
      pct: clampPct((actual / target) * 100),
      status,
      detail: actuals.totalEvaluations === 0
        ? "No evaluations yet this month"
        : `${actual.toFixed(1)}/22 across ${actuals.totalEvaluations} evals · target ${target.toFixed(1)}`,
    });
  }

  if (targets.targetCoveragePct != null && targets.targetCoveragePct > 0) {
    const target = targets.targetCoveragePct;
    const actual = actuals.coveragePct;
    const expected = target * e;
    let status: GoalStatus;
    if (actual >= target) status = "achieved";
    else if (actual >= expected) status = "on_track";
    else if (actual >= expected * 0.6) status = "at_risk";
    else status = "behind";
    items.push({
      key: "coverage",
      label: "Evaluation coverage",
      target,
      actual: clampPct(actual),
      unit: "%",
      pct: clampPct((actual / target) * 100),
      status,
      detail: `${actuals.completeGps}/${actuals.totalGps} GPs at ${targets.targetEvalsPerGp}+ evals · target ${target}%`,
    });
  }

  if (targets.targetMaxMistakes != null && targets.targetMaxMistakes >= 0) {
    const target = targets.targetMaxMistakes;
    const actual = actuals.maxMistakes;
    let status: GoalStatus;
    if (actual === 0) status = "achieved";
    else if (actual <= target) status = "on_track";
    else if (actual <= target + 2) status = "at_risk";
    else status = "behind";
    items.push({
      key: "mistakes",
      label: "Mistakes ceiling",
      target,
      actual,
      unit: "count",
      pct: target > 0 ? clampPct((actual / target) * 100) : (actual === 0 ? 0 : 100),
      status,
      detail: `Worst GP has ${actual} mistake${actual === 1 ? "" : "s"} · ceiling ${target}`,
    });
  }

  return items;
}

/** Roll many per-metric statuses into one headline status (worst wins). */
export function overallGoalStatus(items: GoalProgressItem[]): GoalStatus | null {
  if (items.length === 0) return null;
  const rank: Record<GoalStatus, number> = { behind: 0, at_risk: 1, on_track: 2, achieved: 3 };
  return items.reduce((worst, i) => (rank[i.status] < rank[worst] ? i.status : worst), "achieved" as GoalStatus);
}

// ============================================
// READ / WRITE
// ============================================

export async function getCompanyGoals(month: number, year: number): Promise<CompanyGoals | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(companyGoals)
    .where(and(eq(companyGoals.month, month), eq(companyGoals.year, year)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertCompanyGoals(
  month: number,
  year: number,
  patch: Partial<Pick<CompanyGoals, "targetAvgScore" | "targetCoveragePct" | "targetEvalsPerGp" | "targetMaxMistakes" | "notes">>,
  byId: number | null,
): Promise<CompanyGoals | null> {
  const db = await getDb();
  if (!db) return null;
  const existing = await getCompanyGoals(month, year);
  if (existing) {
    await db.update(companyGoals).set({ ...patch, updatedById: byId }).where(eq(companyGoals.id, existing.id));
  } else {
    await db.insert(companyGoals).values({ month, year, ...patch, updatedById: byId });
  }
  return getCompanyGoals(month, year);
}

/**
 * Live actuals for the month — four cheap aggregates:
 * score avg + eval count, per-GP eval counts (for coverage), the GP
 * roster size, and the worst per-GP mistake count.
 */
export async function getGoalActuals(
  month: number,
  year: number,
  targetEvalsPerGp: number,
): Promise<GoalActuals> {
  const empty: GoalActuals = { avgScore: 0, totalEvaluations: 0, completeGps: 0, totalGps: 0, coveragePct: 0, maxMistakes: 0 };
  const db = await getDb();
  if (!db) return empty;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const [scoreAgg, perGp, gpCount, mistakeAgg] = await Promise.all([
    db.select({
      avgScore: sql<number>`AVG(${evaluations.totalScore})`,
      total: sql<number>`COUNT(*)`,
    }).from(evaluations)
      .where(and(gte(evaluations.evaluationDate, start), lte(evaluations.evaluationDate, end))),
    db.select({
      gpId: evaluations.gamePresenterId,
      cnt: sql<number>`COUNT(*)`,
    }).from(evaluations)
      .where(and(gte(evaluations.evaluationDate, start), lte(evaluations.evaluationDate, end)))
      .groupBy(evaluations.gamePresenterId),
    db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters),
    db.select({ maxMistakes: sql<number>`MAX(${monthlyGpStats.mistakes})` })
      .from(monthlyGpStats)
      .where(and(eq(monthlyGpStats.month, month), eq(monthlyGpStats.year, year))),
  ]);

  const totalGps = Number(gpCount[0]?.count ?? 0);
  const completeGps = perGp.filter(r => Number(r.cnt) >= targetEvalsPerGp).length;
  return {
    avgScore: Number(scoreAgg[0]?.avgScore ?? 0) || 0,
    totalEvaluations: Number(scoreAgg[0]?.total ?? 0) || 0,
    completeGps,
    totalGps,
    coveragePct: totalGps > 0 ? (completeGps / totalGps) * 100 : 0,
    maxMistakes: Number(mistakeAgg[0]?.maxMistakes ?? 0) || 0,
  };
}

export type GoalsOverview = {
  period: { month: number; year: number };
  /** True while no row exists and the defaults are shown. */
  isDefault: boolean;
  targets: GoalTargets;
  notes: string | null;
  actuals: GoalActuals;
  progress: GoalProgressItem[];
  overall: GoalStatus | null;
  elapsedPct: number;
};

export async function getGoalsOverview(month: number, year: number, now: Date = new Date()): Promise<GoalsOverview> {
  const row = await getCompanyGoals(month, year);
  const targets: GoalTargets = row
    ? {
        targetAvgScore: row.targetAvgScore,
        targetCoveragePct: row.targetCoveragePct,
        targetEvalsPerGp: row.targetEvalsPerGp ?? 10,
        targetMaxMistakes: row.targetMaxMistakes,
      }
    : DEFAULT_GOAL_TARGETS;
  const actuals = await getGoalActuals(month, year, targets.targetEvalsPerGp);
  const elapsed = monthElapsedFraction(month, year, now);
  const progress = computeGoalProgress(targets, actuals, elapsed);
  return {
    period: { month, year },
    isDefault: !row,
    targets,
    notes: row?.notes ?? null,
    actuals,
    progress,
    overall: overallGoalStatus(progress),
    elapsedPct: Math.round(elapsed * 100),
  };
}
