/**
 * Dashboard & Analytics Database Operations
 * Handles dashboard stats, monthly trends, team comparison, and admin stats
 */
import { eq, and, or, inArray, sql, desc } from "drizzle-orm";
import { evaluations, gamePresenters, reports, users, fmTeams } from "../../drizzle/schema";
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
