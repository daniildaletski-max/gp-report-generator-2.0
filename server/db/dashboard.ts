/**
 * Dashboard & Analytics Database Operations
 * Handles dashboard stats, monthly trends, team comparison, and admin stats
 */
import { eq, and, or, inArray, sql, desc } from "drizzle-orm";
import { evaluations, gamePresenters, reports, users, fmTeams, personaSyncLogs, errorFiles } from "../../drizzle/schema";
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
  const db = await getDb();
  if (!db) return EMPTY_DASHBOARD;

  const gpCountQuery = userId
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters).where(eq(gamePresenters.userId, userId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters);
  const evalCountQuery = userId
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(evaluations).where(eq(evaluations.userId, userId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(evaluations);
  const reportCountQuery = userId
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(reports).where(eq(reports.userId, userId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(reports);

  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  const thisMonthConditions: any[] = [sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`, sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`];
  if (userId) thisMonthConditions.push(eq(evaluations.userId, userId));
  const thisMonthGPsResult = await db.select({ count: sql<number>`COUNT(DISTINCT ${evaluations.gamePresenterId})` }).from(evaluations).where(and(...thisMonthConditions));

  const gpStatsConditions: any[] = [sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`, sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`];
  if (userId) gpStatsConditions.push(eq(evaluations.userId, userId));
  const gpStatsRaw = await getGpStatsQuery(db, gpStatsConditions);

  return {
    totalGPs: gpCountQuery[0].count, totalEvaluations: evalCountQuery[0].count, totalReports: reportCountQuery[0].count,
    thisMonthGPs: thisMonthGPsResult[0]?.count || 0,
    gpStats: formatGpStats(gpStatsRaw), recentEvaluations: [],
    selectedMonth: targetMonth, selectedYear: targetYear,
  };
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

  let teamIds: number[] | undefined;
  if (userId && !teamId) {
    const userTeams = await db.select({ id: fmTeams.id }).from(fmTeams).where(eq(fmTeams.userId, userId));
    teamIds = userTeams.map(t => t.id);
    if (teamIds.length === 0) return monthList.map(m => ({
      month: m.month, year: m.year,
      label: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m.month - 1]} ${m.year}`,
      totalEvaluations: 0, uniqueGPs: 0, avgTotalScore: 0, avgAppearanceScore: 0, avgPerformanceScore: 0, topScore: 0, lowScore: 0,
    }));
  }

  const results = [];
  for (const m of monthList) {
    const conditions: any[] = [sql`MONTH(${evaluations.evaluationDate}) = ${m.month}`, sql`YEAR(${evaluations.evaluationDate}) = ${m.year}`];
    if (teamId) conditions.push(eq(gamePresenters.teamId, teamId));
    else if (teamIds && teamIds.length > 0) conditions.push(inArray(gamePresenters.teamId, teamIds));

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
  const db = await getDb();
  if (!db) return [];
  const teams = await db.select().from(fmTeams).where(eq(fmTeams.userId, userId));
  if (teams.length === 0) return [];
  const selectedTeams = teamIds && teamIds.length > 0 ? teams.filter(t => teamIds.includes(t.id)) : teams;
  const results = [];
  for (const team of selectedTeams) {
    const gps = await db.select().from(gamePresenters).where(and(eq(gamePresenters.teamId, team.id), eq(gamePresenters.userId, userId)));
    if (gps.length === 0) {
      results.push({ teamId: team.id, teamName: team.teamName, floorManager: team.floorManagerName, gpCount: 0, avgTotalScore: 0, avgAppearanceScore: 0, avgPerformanceScore: 0, totalEvaluations: 0, topScore: 0, lowScore: 0, gps: [] });
      continue;
    }
    const gpIds = gps.map(g => g.id);
    const teamStats = await db.select({
      avgTotal: sql<number>`AVG(${evaluations.totalScore})`, avgAppearance: sql<number>`AVG(${evaluations.appearanceScore})`,
      avgPerformance: sql<number>`AVG(${evaluations.gamePerformanceTotalScore})`, totalEvals: sql<number>`COUNT(*)`,
      topScore: sql<number>`MAX(${evaluations.totalScore})`, lowScore: sql<number>`MIN(${evaluations.totalScore})`,
    }).from(evaluations).where(and(inArray(evaluations.gamePresenterId, gpIds), eq(evaluations.userId, userId)));
    const stats = teamStats[0];
    const gpStats = await db.select({
      gpId: evaluations.gamePresenterId, avgTotal: sql<number>`AVG(${evaluations.totalScore})`,
      avgAppearance: sql<number>`AVG(${evaluations.appearanceScore})`, avgPerformance: sql<number>`AVG(${evaluations.gamePerformanceTotalScore})`,
      evalCount: sql<number>`COUNT(*)`,
    }).from(evaluations).where(and(inArray(evaluations.gamePresenterId, gpIds), eq(evaluations.userId, userId))).groupBy(evaluations.gamePresenterId);
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
  | "stale_sync"
  | "missing_report"
  | "score_regression"
  | "score_improvement"
  | "coverage_gap";

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

const STALE_SYNC_DAYS = 14;
const SCORE_DELTA_THRESHOLD = 2; // Points
const MAX_INSIGHTS = 12;

/**
 * Compute auto-generated insights for the FM. Every check is wrapped
 * in try/catch so a single broken query doesn't take the whole widget
 * down — partial insights are infinitely better than a 500.
 */
export async function computeDashboardInsights(opts: {
  teamId?: number;
  userId?: number;
}): Promise<DashboardInsight[]> {
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

  // Resolve which teams the caller can see. When userId is set (non-admin
  // caller), every branch ALSO filters by that userId so a crafted teamId
  // can't pull another tenant's data — defense in depth on top of the
  // router-level ownership check.
  let teamRows: { id: number; teamName: string }[];
  try {
    if (opts.teamId && opts.userId) {
      teamRows = await db.select({ id: fmTeams.id, teamName: fmTeams.teamName })
        .from(fmTeams)
        .where(and(eq(fmTeams.id, opts.teamId), eq(fmTeams.userId, opts.userId)))
        .limit(1);
    } else if (opts.teamId) {
      // Admin path — no userId scoping needed.
      teamRows = await db.select({ id: fmTeams.id, teamName: fmTeams.teamName })
        .from(fmTeams).where(eq(fmTeams.id, opts.teamId)).limit(1);
    } else if (opts.userId) {
      teamRows = await db.select({ id: fmTeams.id, teamName: fmTeams.teamName })
        .from(fmTeams).where(eq(fmTeams.userId, opts.userId));
    } else {
      teamRows = await db.select({ id: fmTeams.id, teamName: fmTeams.teamName }).from(fmTeams);
    }
  } catch {
    teamRows = [];
  }
  if (teamRows.length === 0) return [];
  const teamIds = teamRows.map(t => t.id);
  const teamNameById = new Map(teamRows.map(t => [t.id, t.teamName]));

  const insights: DashboardInsight[] = [];

  // ----------------------------------------------------------
  // Insight 1: stale Persona sync — last sync >14 days ago, OR never
  // ----------------------------------------------------------
  try {
    const lastSyncs = await db
      .select({
        teamId: personaSyncLogs.teamId,
        lastSync: sql<Date>`MAX(${personaSyncLogs.startedAt})`,
      })
      .from(personaSyncLogs)
      .where(inArray(personaSyncLogs.teamId, teamIds))
      .groupBy(personaSyncLogs.teamId);

    const teamsWithSync = new Set(lastSyncs.map(s => s.teamId));
    const staleThreshold = new Date(now.getTime() - STALE_SYNC_DAYS * 24 * 60 * 60 * 1000);

    for (const sync of lastSyncs) {
      if (!sync.lastSync) continue;
      const lastDate = new Date(sync.lastSync);
      const daysAgo = Math.floor((now.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
      if (lastDate < staleThreshold) {
        const teamName = teamNameById.get(sync.teamId) ?? `Team ${sync.teamId}`;
        insights.push({
          id: `stale-sync-${sync.teamId}`,
          kind: "stale_sync",
          severity: "warning",
          title: `${teamName} hasn't synced for ${daysAgo} days`,
          description: `Last Persona sync was ${daysAgo} days ago. Attendance numbers may be out of date.`,
          action: { label: "Sync now", href: "/admin?tab=persona" },
          timestamp: lastDate,
          metadata: { teamId: sync.teamId, teamName },
        });
      }
    }
    // Teams that have NEVER synced
    for (const t of teamRows) {
      if (!teamsWithSync.has(t.id)) {
        insights.push({
          id: `never-synced-${t.id}`,
          kind: "stale_sync",
          severity: "warning",
          title: `${t.teamName} has never been synced`,
          description: "No Persona sync has ever run for this team. Set the Project ID in admin and run a sync.",
          action: { label: "Configure", href: "/admin?tab=persona" },
          timestamp: new Date(0),
          metadata: { teamId: t.id, teamName: t.teamName },
        });
      }
    }
  } catch { /* skip on error */ }

  // ----------------------------------------------------------
  // Insight 2: missing report for last calendar month
  // ----------------------------------------------------------
  try {
    const lastMonthReports = await db
      .select({ teamId: reports.teamId })
      .from(reports)
      .where(
        and(
          inArray(reports.teamId, teamIds),
          eq(reports.reportMonth, lastMonth),
          eq(reports.reportYear, lastMonthYear),
        ),
      );
    const teamsWithReport = new Set(lastMonthReports.map(r => r.teamId));
    const monthName = new Date(lastMonthYear, lastMonth - 1, 1).toLocaleString("en-US", { month: "long" });
    for (const t of teamRows) {
      if (!teamsWithReport.has(t.id)) {
        insights.push({
          id: `missing-report-${t.id}-${lastMonthYear}-${lastMonth}`,
          kind: "missing_report",
          severity: "recommendation",
          title: `${t.teamName} — ${monthName} report not generated`,
          description: `No report exists for ${monthName} ${lastMonthYear}. Generate it now to keep the team's history complete.`,
          action: { label: "Generate", href: "/reports" },
          timestamp: lastMonthDate,
          metadata: { teamId: t.id, teamName: t.teamName },
        });
      }
    }
  } catch { /* skip on error */ }

  // ----------------------------------------------------------
  // Insight 3 & 4: GP score regressions / improvements (last month vs prior)
  // ----------------------------------------------------------
  try {
    const lastMonthScores = await db
      .select({
        gpId: evaluations.gamePresenterId,
        gpName: gamePresenters.name,
        teamId: gamePresenters.teamId,
        avgScore: sql<number>`AVG(${evaluations.totalScore})`,
        evalCount: sql<number>`COUNT(*)`,
      })
      .from(evaluations)
      .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
      .where(
        and(
          inArray(gamePresenters.teamId, teamIds),
          sql`MONTH(${evaluations.evaluationDate}) = ${lastMonth}`,
          sql`YEAR(${evaluations.evaluationDate}) = ${lastMonthYear}`,
        ),
      )
      .groupBy(evaluations.gamePresenterId, gamePresenters.name, gamePresenters.teamId);

    const priorMonthScores = await db
      .select({
        gpId: evaluations.gamePresenterId,
        avgScore: sql<number>`AVG(${evaluations.totalScore})`,
      })
      .from(evaluations)
      .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
      .where(
        and(
          inArray(gamePresenters.teamId, teamIds),
          sql`MONTH(${evaluations.evaluationDate}) = ${twoMonthsAgoMonth}`,
          sql`YEAR(${evaluations.evaluationDate}) = ${twoMonthsAgoYear}`,
        ),
      )
      .groupBy(evaluations.gamePresenterId);

    const priorByGp = new Map(priorMonthScores.map(p => [p.gpId, Number(p.avgScore) || 0]));

    // Find biggest movers — limit to top 3 of each direction so the
    // insights panel doesn't get flooded with 50 GPs at +/- 0.5 points.
    const movers: { gpId: number; gpName: string; teamId: number | null; current: number; prev: number; delta: number; evalCount: number }[] = [];
    for (const lm of lastMonthScores) {
      const current = Number(lm.avgScore) || 0;
      const prev = priorByGp.get(lm.gpId) ?? 0;
      if (prev <= 0 || current <= 0) continue; // need both periods
      if (Number(lm.evalCount) < 2) continue;  // need enough data
      const delta = current - prev;
      if (Math.abs(delta) < SCORE_DELTA_THRESHOLD) continue;
      movers.push({
        gpId: lm.gpId,
        gpName: lm.gpName,
        teamId: lm.teamId,
        current,
        prev,
        delta,
        evalCount: Number(lm.evalCount),
      });
    }

    const regressions = movers.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
    const improvements = movers.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);

    const monthNameLM = new Date(lastMonthYear, lastMonth - 1, 1).toLocaleString("en-US", { month: "short" });

    for (const r of regressions) {
      insights.push({
        id: `regression-${r.gpId}-${lastMonthYear}-${lastMonth}`,
        kind: "score_regression",
        severity: "alert",
        title: `${r.gpName} dropped ${Math.abs(r.delta).toFixed(1)} points`,
        description: `${monthNameLM} avg ${r.current.toFixed(1)}, down from ${r.prev.toFixed(1)} the month before. Worth a coaching check-in.`,
        action: { label: "Open profile", href: `/admin?tab=stats&gpId=${r.gpId}` },
        timestamp: lastMonthDate,
        metadata: { gpId: r.gpId, gpName: r.gpName, teamId: r.teamId ?? undefined, teamName: r.teamId ? teamNameById.get(r.teamId) : undefined },
      });
    }
    for (const im of improvements) {
      insights.push({
        id: `improvement-${im.gpId}-${lastMonthYear}-${lastMonth}`,
        kind: "score_improvement",
        severity: "celebration",
        title: `${im.gpName} improved ${im.delta.toFixed(1)} points`,
        description: `${monthNameLM} avg ${im.current.toFixed(1)}, up from ${im.prev.toFixed(1)}. Worth recognising.`,
        action: { label: "Open profile", href: `/admin?tab=stats&gpId=${im.gpId}` },
        timestamp: lastMonthDate,
        metadata: { gpId: im.gpId, gpName: im.gpName, teamId: im.teamId ?? undefined, teamName: im.teamId ? teamNameById.get(im.teamId) : undefined },
      });
    }
  } catch { /* skip on error */ }

  // ----------------------------------------------------------
  // Insight 5: coverage gap — current month, no evaluations for >50% of GPs
  // ----------------------------------------------------------
  try {
    const totalGpsByTeam = await db
      .select({ teamId: gamePresenters.teamId, total: sql<number>`COUNT(*)` })
      .from(gamePresenters)
      .where(inArray(gamePresenters.teamId, teamIds))
      .groupBy(gamePresenters.teamId);

    const evaluatedThisMonth = await db
      .select({
        teamId: gamePresenters.teamId,
        evaluated: sql<number>`COUNT(DISTINCT ${evaluations.gamePresenterId})`,
      })
      .from(evaluations)
      .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
      .where(
        and(
          inArray(gamePresenters.teamId, teamIds),
          sql`MONTH(${evaluations.evaluationDate}) = ${currentMonth}`,
          sql`YEAR(${evaluations.evaluationDate}) = ${currentYear}`,
        ),
      )
      .groupBy(gamePresenters.teamId);

    const evaluatedByTeam = new Map(evaluatedThisMonth.map(e => [e.teamId, Number(e.evaluated)]));
    const dayOfMonth = now.getDate();
    // Only flag coverage gap after the 14th of the month — before that,
    // it's normal for half the GPs to not have been evaluated yet.
    if (dayOfMonth >= 14) {
      for (const t of totalGpsByTeam) {
        if (!t.teamId) continue;
        const total = Number(t.total);
        if (total === 0) continue;
        const evaluated = evaluatedByTeam.get(t.teamId) ?? 0;
        const coverage = evaluated / total;
        if (coverage < 0.5) {
          const teamName = teamNameById.get(t.teamId) ?? `Team ${t.teamId}`;
          insights.push({
            id: `coverage-gap-${t.teamId}-${currentYear}-${currentMonth}`,
            kind: "coverage_gap",
            severity: "warning",
            title: `${teamName} — only ${evaluated}/${total} GPs evaluated this month`,
            description: `${Math.round(coverage * 100)}% coverage with ${30 - dayOfMonth}-ish days left. Schedule the rest before month-end.`,
            action: { label: "Open evaluations", href: "/evaluations" },
            timestamp: now,
            metadata: { teamId: t.teamId, teamName },
          });
        }
      }
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
}): Promise<ActivityItem[]> {
  const db = await getDb();
  if (!db) return [];

  // Resolve teams the caller can see — used to scope each per-source query.
  let teamIds: number[] | undefined;
  try {
    if (opts.userId) {
      const userTeams = await db.select({ id: fmTeams.id }).from(fmTeams).where(eq(fmTeams.userId, opts.userId));
      teamIds = userTeams.map(t => t.id);
      if (teamIds.length === 0) return [];
    }
  } catch {
    return [];
  }

  const perSource = Math.max(5, Math.ceil(opts.limit / 2));
  const items: ActivityItem[] = [];

  // Persona syncs
  try {
    const conds = teamIds && teamIds.length > 0 ? [inArray(personaSyncLogs.teamId, teamIds)] : [];
    const rows = await db
      .select({
        id: personaSyncLogs.id,
        teamId: personaSyncLogs.teamId,
        startedAt: personaSyncLogs.startedAt,
        status: personaSyncLogs.status,
        matched: personaSyncLogs.matched,
        unmatched: personaSyncLogs.unmatched,
        teamName: fmTeams.teamName,
      })
      .from(personaSyncLogs)
      .innerJoin(fmTeams, eq(personaSyncLogs.teamId, fmTeams.id))
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(personaSyncLogs.startedAt))
      .limit(perSource);
    for (const r of rows) {
      items.push({
        id: `sync-${r.id}`,
        kind: "sync",
        timestamp: r.startedAt,
        title: `${r.teamName} — Persona sync ${r.status}`,
        detail: r.status === "failed" ? "see admin log" : `${r.matched} matched, ${r.unmatched} unmatched`,
        href: "/admin?tab=persona",
        status: r.status,
      });
    }
  } catch { /* skip */ }

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

  // Recent error file uploads
  try {
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
        href: "/admin?tab=errors",
      });
    }
  } catch { /* skip */ }

  // Sort merged feed and cap
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return items.slice(0, opts.limit);
}
