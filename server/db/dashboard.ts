/**
 * Dashboard & Analytics Database Operations
 * Handles dashboard stats, monthly trends, team comparison, and admin stats
 */
import { eq, and, or, inArray, isNull, sql, desc } from "drizzle-orm";
import { evaluations, gamePresenters, reports, users, fmTeams, errorFiles, gpMonthlyAttendance, monthlyGpStats } from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================
// HELPER: Format GP stats from raw query
// ============================================
function formatGpStats(gpStatsRaw: any[]) {
  return gpStatsRaw.map(gp => ({
    gpId: gp.gpId,
    gpName: gp.gpName,
    evalCount: gp.evalCount,
    avgTotal: gp.avgTotal ? Number(gp.avgTotal).toFixed(1) : "0.0",
    avgHair: gp.avgHair ? Number(gp.avgHair).toFixed(1) : "0.0",
    avgMakeup: gp.avgMakeup ? Number(gp.avgMakeup).toFixed(1) : "0.0",
    avgOutfit: gp.avgOutfit ? Number(gp.avgOutfit).toFixed(1) : "0.0",
    avgPosture: gp.avgPosture ? Number(gp.avgPosture).toFixed(1) : "0.0",
    avgDealing: gp.avgDealing ? Number(gp.avgDealing).toFixed(1) : "0.0",
    avgGamePerf: gp.avgGamePerf ? Number(gp.avgGamePerf).toFixed(1) : "0.0",
    avgAppearance: gp.avgHair && gp.avgMakeup && gp.avgOutfit && gp.avgPosture
      ? ((Number(gp.avgHair) + Number(gp.avgMakeup) + Number(gp.avgOutfit) + Number(gp.avgPosture))).toFixed(1) : "0.0",
    avgPerformance: gp.avgDealing && gp.avgGamePerf
      ? (Number(gp.avgDealing) + Number(gp.avgGamePerf)).toFixed(1) : "0.0",
  }));
}

const EMPTY_DASHBOARD = { totalGPs: 0, totalEvaluations: 0, totalReports: 0, thisMonthGPs: 0, gpStats: [], recentEvaluations: [] };

async function getGpStatsQuery(db: any, conditions: any[]) {
  return await db.select({
    gpId: gamePresenters.id, gpName: gamePresenters.name,
    evalCount: sql<number>`COUNT(*)`,
    avgTotal: sql<number>`AVG(${evaluations.totalScore})`,
    avgHair: sql<number>`AVG(${evaluations.hairScore})`,
    avgMakeup: sql<number>`AVG(${evaluations.makeupScore})`,
    avgOutfit: sql<number>`AVG(${evaluations.outfitScore})`,
    avgPosture: sql<number>`AVG(${evaluations.postureScore})`,
    avgDealing: sql<number>`AVG(${evaluations.dealingStyleScore})`,
    avgGamePerf: sql<number>`AVG(${evaluations.gamePerformanceScore})`,
  }).from(evaluations)
    .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
    .where(and(...conditions))
    .groupBy(gamePresenters.id, gamePresenters.name)
    .orderBy(gamePresenters.name);
}

// ============================================
// DASHBOARD STATS
// ============================================

export async function getDashboardStats(month?: number, year?: number, teamId?: number) {
  const db = await getDb();
  if (!db) return EMPTY_DASHBOARD;

  const gpCountQuery = teamId
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters).where(eq(gamePresenters.teamId, teamId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters);
  const evalCountQuery = teamId
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(evaluations).innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id)).where(eq(gamePresenters.teamId, teamId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(evaluations);
  const reportCountQuery = teamId
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(reports).where(eq(reports.teamId, teamId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(reports);

  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  const thisMonthConditions: any[] = [sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`, sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`];
  if (teamId) thisMonthConditions.push(eq(gamePresenters.teamId, teamId));

  const thisMonthGPsResult = await db.select({ count: sql<number>`COUNT(DISTINCT ${evaluations.gamePresenterId})` })
    .from(evaluations).innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id)).where(and(...thisMonthConditions));

  const gpStatsConditions: any[] = [sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`, sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`];
  if (teamId) gpStatsConditions.push(eq(gamePresenters.teamId, teamId));

  const gpStatsRaw = await getGpStatsQuery(db, gpStatsConditions);

  return {
    totalGPs: gpCountQuery[0].count, totalEvaluations: evalCountQuery[0].count, totalReports: reportCountQuery[0].count,
    thisMonthGPs: thisMonthGPsResult[0]?.count || 0,
    gpStats: formatGpStats(gpStatsRaw), recentEvaluations: [],
    selectedMonth: targetMonth, selectedYear: targetYear,
  };
}

export async function getDashboardStatsByTeam(month?: number, year?: number, teamId?: number) {
  return getDashboardStats(month, year, teamId);
}

export async function getDashboardStatsByUser(month?: number, year?: number, userId?: number) {
  // One shared database — dashboard stats are global, no per-user scope.
  void userId;
  return getDashboardStats(month, year);
}

// ============================================
// ADMIN DASHBOARD
// ============================================

export async function getAdminDashboardStats() {
  const db = await getDb();
  if (!db) return null;
  const [totalUsers, totalTeams, totalGPs, totalEvaluations, totalReports] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(users),
    db.select({ count: sql<number>`COUNT(*)` }).from(fmTeams),
    db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters),
    db.select({ count: sql<number>`COUNT(*)` }).from(evaluations),
    db.select({ count: sql<number>`COUNT(*)` }).from(reports),
  ]);
  const recentReports = await db.select({ report: reports, team: fmTeams }).from(reports).leftJoin(fmTeams, eq(reports.teamId, fmTeams.id)).orderBy(desc(reports.createdAt)).limit(5);
  const recentUsers = await db.select().from(users).orderBy(desc(users.lastSignedIn)).limit(5);
  return {
    totalUsers: totalUsers[0]?.count || 0, totalTeams: totalTeams[0]?.count || 0,
    totalGPs: totalGPs[0]?.count || 0, totalEvaluations: totalEvaluations[0]?.count || 0,
    totalReports: totalReports[0]?.count || 0, recentReports, recentUsers,
  };
}

// ============================================
// TRENDS & COMPARISON
// ============================================

export async function getMonthlyTrendData(months: number = 6, teamId?: number, userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const monthList: { month: number; year: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthList.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }

  // One shared database — trends are global; the userId param is ignored.
  void userId;

  const results = [];
  for (const m of monthList) {
    const conditions: any[] = [sql`MONTH(${evaluations.evaluationDate}) = ${m.month}`, sql`YEAR(${evaluations.evaluationDate}) = ${m.year}`];
    if (teamId) conditions.push(eq(gamePresenters.teamId, teamId));

    const statsRaw = await db.select({
      totalEvaluations: sql<number>`COUNT(*)`, uniqueGPs: sql<number>`COUNT(DISTINCT ${evaluations.gamePresenterId})`,
      avgTotalScore: sql<number>`AVG(${evaluations.totalScore})`,
      avgAppearance: sql<number>`AVG(${evaluations.hairScore} + ${evaluations.makeupScore} + ${evaluations.outfitScore} + ${evaluations.postureScore})`,
      avgPerformance: sql<number>`AVG(${evaluations.dealingStyleScore} + ${evaluations.gamePerformanceScore})`,
      topScore: sql<number>`MAX(${evaluations.totalScore})`, lowScore: sql<number>`MIN(${evaluations.totalScore})`,
    }).from(evaluations).innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id)).where(and(...conditions));

    const row = statsRaw[0];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    results.push({
      month: m.month, year: m.year, label: `${monthNames[m.month - 1]} ${m.year}`,
      totalEvaluations: Number(row?.totalEvaluations || 0), uniqueGPs: Number(row?.uniqueGPs || 0),
      avgTotalScore: row?.avgTotalScore ? Number(Number(row.avgTotalScore).toFixed(1)) : 0,
      avgAppearanceScore: row?.avgAppearance ? Number(Number(row.avgAppearance).toFixed(1)) : 0,
      avgPerformanceScore: row?.avgPerformance ? Number(Number(row.avgPerformance).toFixed(1)) : 0,
      topScore: Number(row?.topScore || 0), lowScore: Number(row?.lowScore || 0),
    });
  }
  return results;
}

export async function getTeamComparisonData(userId: number, teamIds?: number[]) {
  // One shared database — compare across every team; userId no longer scopes.
  void userId;
  const db = await getDb();
  if (!db) return [];
  const teams = await db.select().from(fmTeams);
  if (teams.length === 0) return [];
  const selectedTeams = teamIds && teamIds.length > 0 ? teams.filter(t => teamIds.includes(t.id)) : teams;
  const results = [];
  for (const team of selectedTeams) {
    const gps = await db.select().from(gamePresenters).where(eq(gamePresenters.teamId, team.id));
    if (gps.length === 0) {
      results.push({ teamId: team.id, teamName: team.teamName, floorManager: team.floorManagerName, gpCount: 0, avgTotalScore: 0, avgAppearanceScore: 0, avgPerformanceScore: 0, totalEvaluations: 0, topScore: 0, lowScore: 0, gps: [] });
      continue;
    }
    const gpIds = gps.map(g => g.id);
    const teamStats = await db.select({
      avgTotal: sql<number>`AVG(${evaluations.totalScore})`, avgAppearance: sql<number>`AVG(${evaluations.appearanceScore})`,
      avgPerformance: sql<number>`AVG(${evaluations.gamePerformanceTotalScore})`, totalEvals: sql<number>`COUNT(*)`,
      topScore: sql<number>`MAX(${evaluations.totalScore})`, lowScore: sql<number>`MIN(${evaluations.totalScore})`,
    }).from(evaluations).where(inArray(evaluations.gamePresenterId, gpIds));
    const stats = teamStats[0];
    const gpStats = await db.select({
      gpId: evaluations.gamePresenterId, avgTotal: sql<number>`AVG(${evaluations.totalScore})`,
      avgAppearance: sql<number>`AVG(${evaluations.appearanceScore})`, avgPerformance: sql<number>`AVG(${evaluations.gamePerformanceTotalScore})`,
      evalCount: sql<number>`COUNT(*)`,
    }).from(evaluations).where(inArray(evaluations.gamePresenterId, gpIds)).groupBy(evaluations.gamePresenterId);
    const gpData = gpStats.map(gs => {
      const gp = gps.find(g => g.id === gs.gpId);
      return {
        id: gs.gpId, name: gp?.name || 'Unknown',
        avgTotalScore: gs.avgTotal ? Number(Number(gs.avgTotal).toFixed(1)) : 0,
        avgAppearanceScore: gs.avgAppearance ? Number(Number(gs.avgAppearance).toFixed(1)) : 0,
        avgPerformanceScore: gs.avgPerformance ? Number(Number(gs.avgPerformance).toFixed(1)) : 0,
        evaluationCount: Number(gs.evalCount || 0),
      };
    }).sort((a, b) => b.avgTotalScore - a.avgTotalScore);
    results.push({
      teamId: team.id, teamName: team.teamName, floorManager: team.floorManagerName,
      gpCount: gps.length,
      avgTotalScore: stats?.avgTotal ? Number(Number(stats.avgTotal).toFixed(1)) : 0,
      avgAppearanceScore: stats?.avgAppearance ? Number(Number(stats.avgAppearance).toFixed(1)) : 0,
      avgPerformanceScore: stats?.avgPerformance ? Number(Number(stats.avgPerformance).toFixed(1)) : 0,
      totalEvaluations: Number(stats?.totalEvals || 0),
      topScore: Number(stats?.topScore || 0), lowScore: Number(stats?.lowScore || 0),
      gps: gpData,
    });
  }
  return results.sort((a, b) => b.avgTotalScore - a.avgTotalScore);
}

// ============================================
// Operations Brain — auto-generated insights + activity feed
// ============================================

export type InsightSeverity = "alert" | "warning" | "recommendation" | "celebration" | "info";
export type InsightKind =
  | "missing_report"
  | "score_regression"
  | "score_improvement"
  | "coverage_gap"
  | "evaluation_stale"
  | "attendance_risk"
  | "error_spike"
  | "top_performer";

export interface DashboardInsight {
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  description: string;
  /** Suggested next-step for the FM. */
  action?: { label: string; href: string };
  /** Sortable timestamp — most recent insights surface first within a severity tier. */
  timestamp: Date;
  metadata?: { gpId?: number; gpName?: string; teamId?: number; teamName?: string };
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  alert: 4,
  warning: 3,
  recommendation: 2,
  celebration: 1,
  info: 0,
};

const SCORE_DELTA_THRESHOLD = 2; // Points
const MAX_INSIGHTS = 14;
const STALE_EVAL_DAYS = 35;
const ATTENDANCE_MISSED_THRESHOLD = 3;
const ATTENDANCE_LATE_THRESHOLD = 3;
const ERROR_SPIKE_MIN = 4; // at least this many mistakes this month
const ERROR_SPIKE_DELTA = 3; // and at least this much more than last month
const TOP_PERFORMER_MIN_SCORE = 20;
const TOP_PERFORMER_MIN_EVALS = 3;

/**
 * Compute auto-generated insights for the FM. Every check is wrapped
 * in try/catch so a single broken query doesn't take the whole widget
 * down — partial insights are infinitely better than a 500.
 */
export async function computeDashboardInsights(opts: {
  teamId?: number;
  userId?: number;
  userRole?: string;
}): Promise<DashboardInsight[]> {
  // One shared database — insights are company-wide. teamId/userId/userRole
  // are accepted for backwards-compatible callers but no longer scope the
  // data (every check below runs across the whole studio).
  void opts.teamId;
  void opts.userId;
  void opts.userRole;
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  // Last calendar month (the month for which a report would normally be due)
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = lastMonthDate.getMonth() + 1;
  const lastMonthYear = lastMonthDate.getFullYear();
  // Two months ago — used to compute regression/improvement (compare last
  // month's scores to the month before to see who moved).
  const twoMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const twoMonthsAgoMonth = twoMonthsAgoDate.getMonth() + 1;
  const twoMonthsAgoYear = twoMonthsAgoDate.getFullYear();

  const insights: DashboardInsight[] = [];

  // ----------------------------------------------------------
  // Missing company report for last calendar month
  // ----------------------------------------------------------
  try {
    const existing = await db
      .select({ id: reports.id })
      .from(reports)
      .where(and(isNull(reports.teamId), eq(reports.reportMonth, lastMonth), eq(reports.reportYear, lastMonthYear)))
      .limit(1);
    if (existing.length === 0) {
      const monthName = lastMonthDate.toLocaleString("en-US", { month: "long" });
      insights.push({
        id: `missing-report-${lastMonthYear}-${lastMonth}`,
        kind: "missing_report",
        severity: "recommendation",
        title: `${monthName} report not generated`,
        description: `No company report exists for ${monthName} ${lastMonthYear}. Generate it to keep the monthly history complete.`,
        action: { label: "Generate", href: "/reports" },
        timestamp: lastMonthDate,
      });
    }
  } catch { /* skip on error */ }

  // ----------------------------------------------------------
  // Score regressions / improvements / top performer (last month vs prior)
  // ----------------------------------------------------------
  try {
    const lastMonthScores = await db
      .select({
        gpId: evaluations.gamePresenterId,
        gpName: gamePresenters.name,
        avgScore: sql<number>`AVG(${evaluations.totalScore})`,
        evalCount: sql<number>`COUNT(*)`,
      })
      .from(evaluations)
      .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
      .where(
        and(
          sql`MONTH(${evaluations.evaluationDate}) = ${lastMonth}`,
          sql`YEAR(${evaluations.evaluationDate}) = ${lastMonthYear}`,
        ),
      )
      .groupBy(evaluations.gamePresenterId, gamePresenters.name);

    const priorMonthScores = await db
      .select({
        gpId: evaluations.gamePresenterId,
        avgScore: sql<number>`AVG(${evaluations.totalScore})`,
      })
      .from(evaluations)
      .where(
        and(
          sql`MONTH(${evaluations.evaluationDate}) = ${twoMonthsAgoMonth}`,
          sql`YEAR(${evaluations.evaluationDate}) = ${twoMonthsAgoYear}`,
        ),
      )
      .groupBy(evaluations.gamePresenterId);

    const priorByGp = new Map(priorMonthScores.map(p => [p.gpId, Number(p.avgScore) || 0]));

    // Find biggest movers — limit to top 3 of each direction so the
    // insights panel doesn't get flooded with 50 GPs at +/- 0.5 points.
    const movers: { gpId: number; gpName: string; current: number; prev: number; delta: number }[] = [];
    for (const lm of lastMonthScores) {
      const current = Number(lm.avgScore) || 0;
      const prev = priorByGp.get(lm.gpId) ?? 0;
      if (prev <= 0 || current <= 0) continue; // need both periods
      if (Number(lm.evalCount) < 2) continue;  // need enough data
      const delta = current - prev;
      if (Math.abs(delta) < SCORE_DELTA_THRESHOLD) continue;
      movers.push({ gpId: lm.gpId, gpName: lm.gpName, current, prev, delta });
    }

    const regressions = movers.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
    const improvements = movers.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
    const monthNameLM = lastMonthDate.toLocaleString("en-US", { month: "short" });

    for (const r of regressions) {
      insights.push({
        id: `regression-${r.gpId}-${lastMonthYear}-${lastMonth}`,
        kind: "score_regression",
        severity: "alert",
        title: `${r.gpName} dropped ${Math.abs(r.delta).toFixed(1)} points`,
        description: `${monthNameLM} avg ${r.current.toFixed(1)}, down from ${r.prev.toFixed(1)} the month before. Worth a coaching check-in.`,
        action: { label: "Open profile", href: `/dashboard?gp=${r.gpId}` },
        timestamp: lastMonthDate,
        metadata: { gpId: r.gpId, gpName: r.gpName },
      });
    }
    for (const im of improvements) {
      insights.push({
        id: `improvement-${im.gpId}-${lastMonthYear}-${lastMonth}`,
        kind: "score_improvement",
        severity: "celebration",
        title: `${im.gpName} improved ${im.delta.toFixed(1)} points`,
        description: `${monthNameLM} avg ${im.current.toFixed(1)}, up from ${im.prev.toFixed(1)}. Worth recognising.`,
        action: { label: "Open profile", href: `/dashboard?gp=${im.gpId}` },
        timestamp: lastMonthDate,
        metadata: { gpId: im.gpId, gpName: im.gpName },
      });
    }

    // Top performer — highest average last month with enough evaluations.
    const top = lastMonthScores
      .filter(s => Number(s.evalCount) >= TOP_PERFORMER_MIN_EVALS && Number(s.avgScore) >= TOP_PERFORMER_MIN_SCORE)
      .sort((a, b) => Number(b.avgScore) - Number(a.avgScore))[0];
    if (top) {
      insights.push({
        id: `top-performer-${top.gpId}-${lastMonthYear}-${lastMonth}`,
        kind: "top_performer",
        severity: "celebration",
        title: `${top.gpName} led the studio at ${Number(top.avgScore).toFixed(1)}/22`,
        description: `Highest average score in ${monthNameLM} across ${Number(top.evalCount)} evaluations. Worth recognising.`,
        action: { label: "Open profile", href: `/dashboard?gp=${top.gpId}` },
        timestamp: lastMonthDate,
        metadata: { gpId: top.gpId, gpName: top.gpName },
      });
    }
  } catch { /* skip on error */ }

  // ----------------------------------------------------------
  // Coverage gap — company-wide, current month, >50% GPs unevaluated
  // ----------------------------------------------------------
  try {
    const dayOfMonth = now.getDate();
    // Only flag coverage gap after the 14th — before that it's normal for
    // half the roster to not have been evaluated yet.
    if (dayOfMonth >= 14) {
      const [totalRow] = await db.select({ total: sql<number>`COUNT(*)` }).from(gamePresenters);
      const [evalRow] = await db
        .select({ evaluated: sql<number>`COUNT(DISTINCT ${evaluations.gamePresenterId})` })
        .from(evaluations)
        .where(
          and(
            sql`MONTH(${evaluations.evaluationDate}) = ${currentMonth}`,
            sql`YEAR(${evaluations.evaluationDate}) = ${currentYear}`,
          ),
        );
      const total = Number(totalRow?.total) || 0;
      const evaluated = Number(evalRow?.evaluated) || 0;
      if (total > 0 && evaluated / total < 0.5) {
        const coverage = Math.round((evaluated / total) * 100);
        insights.push({
          id: `coverage-gap-${currentYear}-${currentMonth}`,
          kind: "coverage_gap",
          severity: "warning",
          title: `Only ${evaluated}/${total} GPs evaluated this month`,
          description: `${coverage}% coverage with ~${Math.max(0, 30 - dayOfMonth)} days left. Schedule the rest before month-end.`,
          action: { label: "Open evaluations", href: "/evaluations" },
          timestamp: now,
        });
      }
    }
  } catch { /* skip on error */ }

  // ----------------------------------------------------------
  // Stale evaluations — GPs not evaluated in 35+ days
  // ----------------------------------------------------------
  try {
    const staleThreshold = new Date(now.getTime() - STALE_EVAL_DAYS * 86400000);
    const lastEvalByGp = await db
      .select({
        gpId: gamePresenters.id,
        gpName: gamePresenters.name,
        lastEval: sql<string | null>`MAX(${evaluations.evaluationDate})`,
      })
      .from(gamePresenters)
      .leftJoin(evaluations, eq(evaluations.gamePresenterId, gamePresenters.id))
      .groupBy(gamePresenters.id, gamePresenters.name);

    const stale = lastEvalByGp
      .filter(g => g.lastEval != null && new Date(g.lastEval) < staleThreshold)
      .map(g => ({ gpId: g.gpId, gpName: g.gpName, daysSince: Math.floor((now.getTime() - new Date(g.lastEval!).getTime()) / 86400000) }))
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 3);

    for (const s of stale) {
      insights.push({
        id: `stale-eval-${s.gpId}`,
        kind: "evaluation_stale",
        severity: "warning",
        title: `${s.gpName} not evaluated in ${s.daysSince} days`,
        description: `Last evaluation was ${s.daysSince} days ago. A fresh one keeps coaching and bonus data current.`,
        action: { label: "Evaluate now", href: `/workspace?gp=${s.gpId}` },
        timestamp: now,
        metadata: { gpId: s.gpId, gpName: s.gpName },
      });
    }
  } catch { /* skip on error */ }

  // ----------------------------------------------------------
  // Attendance risk — this month's missed days / late arrivals
  // ----------------------------------------------------------
  try {
    const att = await db
      .select({
        gpId: gpMonthlyAttendance.gamePresenterId,
        gpName: gamePresenters.name,
        missed: gpMonthlyAttendance.missedDays,
        late: gpMonthlyAttendance.lateToWork,
      })
      .from(gpMonthlyAttendance)
      .innerJoin(gamePresenters, eq(gpMonthlyAttendance.gamePresenterId, gamePresenters.id))
      .where(and(eq(gpMonthlyAttendance.month, currentMonth), eq(gpMonthlyAttendance.year, currentYear)));

    const atRisk = att
      .filter(a => (a.missed ?? 0) >= ATTENDANCE_MISSED_THRESHOLD || (a.late ?? 0) >= ATTENDANCE_LATE_THRESHOLD)
      .sort((a, b) => ((b.missed ?? 0) + (b.late ?? 0)) - ((a.missed ?? 0) + (a.late ?? 0)))
      .slice(0, 3);

    for (const a of atRisk) {
      const parts: string[] = [];
      if ((a.missed ?? 0) > 0) parts.push(`${a.missed} missed day${a.missed === 1 ? "" : "s"}`);
      if ((a.late ?? 0) > 0) parts.push(`${a.late} late arrival${a.late === 1 ? "" : "s"}`);
      insights.push({
        id: `attendance-risk-${a.gpId}-${currentYear}-${currentMonth}`,
        kind: "attendance_risk",
        severity: "alert",
        title: `${a.gpName} — attendance needs attention`,
        description: `${parts.join(" and ")} this month. Worth a conversation before it affects the bonus.`,
        action: { label: "Open attendance", href: "/attendance" },
        timestamp: now,
        metadata: { gpId: a.gpId, gpName: a.gpName },
      });
    }
  } catch { /* skip on error */ }

  // ----------------------------------------------------------
  // Error spike — mistakes climbing month-over-month
  // ----------------------------------------------------------
  try {
    const errThis = await db
      .select({ gpId: monthlyGpStats.gamePresenterId, gpName: gamePresenters.name, mistakes: monthlyGpStats.mistakes })
      .from(monthlyGpStats)
      .innerJoin(gamePresenters, eq(monthlyGpStats.gamePresenterId, gamePresenters.id))
      .where(and(eq(monthlyGpStats.month, currentMonth), eq(monthlyGpStats.year, currentYear)));

    const errLast = await db
      .select({ gpId: monthlyGpStats.gamePresenterId, mistakes: monthlyGpStats.mistakes })
      .from(monthlyGpStats)
      .where(and(eq(monthlyGpStats.month, lastMonth), eq(monthlyGpStats.year, lastMonthYear)));

    const lastByGp = new Map(errLast.map(e => [e.gpId, e.mistakes ?? 0]));
    const spikes = errThis
      .map(e => ({ gpId: e.gpId, gpName: e.gpName, mistakes: e.mistakes ?? 0, prev: lastByGp.get(e.gpId) ?? 0 }))
      .filter(e => e.mistakes >= ERROR_SPIKE_MIN && (e.mistakes - e.prev) >= ERROR_SPIKE_DELTA)
      .sort((a, b) => (b.mistakes - b.prev) - (a.mistakes - a.prev))
      .slice(0, 2);

    for (const s of spikes) {
      insights.push({
        id: `error-spike-${s.gpId}-${currentYear}-${currentMonth}`,
        kind: "error_spike",
        severity: "warning",
        title: `${s.gpName} — error count climbing`,
        description: `${s.mistakes} mistakes this month, up from ${s.prev} last month. A quick review could reverse the trend.`,
        action: { label: "Open profile", href: `/dashboard?gp=${s.gpId}` },
        timestamp: now,
        metadata: { gpId: s.gpId, gpName: s.gpName },
      });
    }
  } catch { /* skip on error */ }

  // ----------------------------------------------------------
  // Sort + cap
  // ----------------------------------------------------------
  insights.sort((a, b) => {
    const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sev !== 0) return sev;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });

  return insights.slice(0, MAX_INSIGHTS);
}

// ============================================
// Activity feed — recent events across the system
// ============================================

export type ActivityKind = "sync" | "report" | "evaluation" | "error_file";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  timestamp: Date;
  title: string;
  detail?: string;
  href?: string;
  status?: "success" | "partial" | "failed";
}

/**
 * Pull the most recent activity events from across the system, merge,
 * sort by timestamp, return the top N. Each kind is queried with its
 * own LIMIT so one chatty source can't crowd out the others.
 */
export async function getDashboardActivityFeed(opts: {
  limit: number;
  userId?: number;
  /** When set, scope every per-source query to this team so the feed
   *  matches the team selector at the top of the dashboard. */
  teamId?: number;
  /** Used to gate admin-only link targets (persona/errors tabs) so
   *  FMs don't get rows that send them to a screen they can't open. */
  userRole?: string;
}): Promise<ActivityItem[]> {
  const db = await getDb();
  if (!db) return [];

  const isAdmin = opts.userRole === "admin";
  // Sync rows link to the admin Persona tab (admin-only). For FMs we
  // still surface the row — useful as a "this happened" notice — but
  // omit the href so clicking does nothing (the row is rendered as a
  // disabled button). Same logic for error_file → admin Errors tab.
  const syncHref: string | undefined = isAdmin ? "/admin" : undefined;
  const errorFileHref: string | undefined = isAdmin ? "/admin?tab=errors" : undefined;

  // One shared database — the activity feed is global. An explicit
  // teamId still narrows it (legacy filter), but the caller's userId no
  // longer scopes which teams are visible.
  void opts.userId;
  const teamIds: number[] | undefined = opts.teamId ? [opts.teamId] : undefined;

  const perSource = Math.max(5, Math.ceil(opts.limit / 2));
  const items: ActivityItem[] = [];

  // (Persona sync activity removed with the module.)

  // Recent reports
  try {
    const conds = teamIds && teamIds.length > 0 ? [inArray(reports.teamId, teamIds)] : [];
    const rows = await db
      .select({
        id: reports.id,
        createdAt: reports.createdAt,
        reportMonth: reports.reportMonth,
        reportYear: reports.reportYear,
        status: reports.status,
        teamName: fmTeams.teamName,
      })
      .from(reports)
      .innerJoin(fmTeams, eq(reports.teamId, fmTeams.id))
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(reports.createdAt))
      .limit(perSource);
    for (const r of rows) {
      const monthName = new Date(r.reportYear, r.reportMonth - 1, 1).toLocaleString("en-US", { month: "short" });
      items.push({
        id: `report-${r.id}`,
        kind: "report",
        timestamp: r.createdAt,
        title: `${r.teamName} — ${monthName} ${r.reportYear} report ${r.status === "finalized" ? "finalized" : "saved"}`,
        href: "/reports",
      });
    }
  } catch { /* skip */ }

  // Recent evaluations
  try {
    const evalConds = teamIds && teamIds.length > 0 ? [inArray(gamePresenters.teamId, teamIds)] : [];
    const rows = await db
      .select({
        id: evaluations.id,
        createdAt: evaluations.createdAt,
        totalScore: evaluations.totalScore,
        gpName: gamePresenters.name,
      })
      .from(evaluations)
      .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
      .where(evalConds.length > 0 ? and(...evalConds) : undefined)
      .orderBy(desc(evaluations.createdAt))
      .limit(perSource);
    for (const r of rows) {
      items.push({
        id: `eval-${r.id}`,
        kind: "evaluation",
        timestamp: r.createdAt,
        title: `${r.gpName} evaluated`,
        detail: `total ${r.totalScore}`,
        href: "/evaluations",
      });
    }
  } catch { /* skip */ }

  // Recent error file uploads. Skipped entirely when a teamId filter
  // is active: error_files has no teamId column so we'd otherwise show
  // uploads from other teams next to team-scoped sync/report/evaluation
  // rows — visually consistent feed > slightly emptier feed.
  try {
    if (opts.teamId) {
      // teamId filter is active and we can't constrain error_files to
      // it, so don't show these rows in this view.
    } else {
    const conds = opts.userId ? [eq(errorFiles.userId, opts.userId)] : [];
    const rows = await db
      .select({
        id: errorFiles.id,
        createdAt: errorFiles.createdAt,
        fileName: errorFiles.fileName,
        fileType: errorFiles.fileType,
      })
      .from(errorFiles)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(errorFiles.createdAt))
      .limit(perSource);
    for (const r of rows) {
      items.push({
        id: `errfile-${r.id}`,
        kind: "error_file",
        timestamp: r.createdAt,
        title: `Error file uploaded: ${r.fileName}`,
        detail: r.fileType.toUpperCase(),
        href: errorFileHref,
      });
    }
    }
  } catch { /* skip */ }

  // Sort merged feed and cap
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return items.slice(0, opts.limit);
}

/**
 * Lightweight existence-only check used by the Dashboard
 * OnboardingChecklist. Replaces the heavier dashboard.stats +
 * full-evaluation-scan path with five DB-level LIMIT 1 reads. Each
 * check returns the moment a single matching row is found, so the
 * cost is O(1) regardless of evaluation history size.
 *
 * Tenant scope:
 *   - admin gets tenant-wide existence (any tenant matters).
 *   - non-admin sees only their own teams / GPs / evaluations.
 */
export async function getOnboardingStatus(opts: {
  userId: number;
  isAdmin: boolean;
}): Promise<{
  hasTeam: boolean;
  hasGp: boolean;
  hasAssignedGp: boolean;
  hasEvaluation: boolean;
  hasReport: boolean;
  hasPersonaSync: boolean;
  hasStudioworksImport: boolean;
}> {
  const db = await getDb();
  if (!db) {
    return {
      hasTeam: false, hasGp: false, hasAssignedGp: false,
      hasEvaluation: false, hasReport: false,
      hasPersonaSync: false, hasStudioworksImport: false,
    };
  }
  const ownerScope = opts.isAdmin ? undefined : opts.userId;
  // Helper — true when SELECT … LIMIT 1 returns a row.
  const exists = async <T>(promise: Promise<T[]>): Promise<boolean> => {
    try { return (await promise).length > 0; } catch { return false; }
  };
  const teamCond = ownerScope != null ? eq(fmTeams.userId, ownerScope) : undefined;
  const gpCond = ownerScope != null ? eq(gamePresenters.userId, ownerScope) : undefined;
  const evalCond = ownerScope != null ? eq(evaluations.userId, ownerScope) : undefined;
  const reportCond = ownerScope != null ? eq(reports.userId, ownerScope) : undefined;
  // Persona module was removed; the onboarding step is permanently
  // satisfied so it stops nagging.
  // Studioworks-source check uses a JSON path predicate on the
  // rawExtractedData column (MySQL JSON_EXTRACT).
  const studioCond = sql`JSON_EXTRACT(${evaluations.rawExtractedData}, '$.source') = 'studioworks'`;
  const studioQuery = ownerScope != null
    ? db.select({ id: evaluations.id })
        .from(evaluations)
        .where(and(eq(evaluations.userId, ownerScope), studioCond))
        .limit(1)
    : db.select({ id: evaluations.id }).from(evaluations).where(studioCond).limit(1);

  const [
    hasTeam, hasGp, hasAssignedGp, hasEvaluation, hasReport,
    hasStudioworksImport,
  ] = await Promise.all([
    exists(db.select({ id: fmTeams.id }).from(fmTeams).where(teamCond as any).limit(1)),
    exists(db.select({ id: gamePresenters.id }).from(gamePresenters).where(gpCond as any).limit(1)),
    exists(db.select({ id: gamePresenters.id }).from(gamePresenters).where(
      ownerScope != null
        ? and(eq(gamePresenters.userId, ownerScope), sql`${gamePresenters.teamId} IS NOT NULL`)
        : sql`${gamePresenters.teamId} IS NOT NULL`,
    ).limit(1)),
    exists(db.select({ id: evaluations.id }).from(evaluations).where(evalCond as any).limit(1)),
    exists(db.select({ id: reports.id }).from(reports).where(reportCond as any).limit(1)),
    exists(studioQuery as any),
  ]);

  return {
    hasTeam, hasGp, hasAssignedGp, hasEvaluation, hasReport,
    hasPersonaSync: true, hasStudioworksImport,
  };
}
