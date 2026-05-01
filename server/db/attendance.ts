/**
 * GP Monthly Attendance Database Operations
 */
import { eq, and } from "drizzle-orm";
import { gpMonthlyAttendance, InsertGpMonthlyAttendance, GpMonthlyAttendance, gamePresenters, monthlyGpStats } from "../../drizzle/schema";
import { getDb } from "./connection";

/**
 * Read-only attendance lookup — does NOT create a zero-filled row
 * when nothing exists. Use this in code paths that need to distinguish
 * "this month genuinely has no record" from "this month has all-zero
 * absences", e.g. the Persona anomaly detector reading a baseline
 * prior month. Otherwise the read mutates historical data.
 */
export async function findAttendance(gpId: number, month: number, year: number): Promise<GpMonthlyAttendance | null> {
  const db = await getDb();
  if (!db) return null;
  const existing = await db.select().from(gpMonthlyAttendance)
    .where(and(eq(gpMonthlyAttendance.gamePresenterId, gpId), eq(gpMonthlyAttendance.month, month), eq(gpMonthlyAttendance.year, year)))
    .limit(1);
  return existing.length > 0 ? existing[0] : null;
}

export async function getOrCreateAttendance(gpId: number, month: number, year: number): Promise<GpMonthlyAttendance> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(gpMonthlyAttendance)
    .where(and(eq(gpMonthlyAttendance.gamePresenterId, gpId), eq(gpMonthlyAttendance.month, month), eq(gpMonthlyAttendance.year, year)))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const result = await db.insert(gpMonthlyAttendance).values({ gamePresenterId: gpId, month, year, mistakes: 0, extraShifts: 0, lateToWork: 0, missedDays: 0, sickLeaves: 0 });
  const newRecord = await db.select().from(gpMonthlyAttendance).where(eq(gpMonthlyAttendance.id, Number(result[0].insertId))).limit(1);
  return newRecord[0];
}

export async function updateAttendance(id: number, data: Partial<InsertGpMonthlyAttendance>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(gpMonthlyAttendance).set(data).where(eq(gpMonthlyAttendance.id, id));
}

export async function getAttendanceByTeamMonth(teamId: number, month: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  const teamGPs = await db.select().from(gamePresenters).where(eq(gamePresenters.teamId, teamId)).orderBy(gamePresenters.name);
  const attendanceData = await db.select({ attendance: gpMonthlyAttendance, gamePresenter: gamePresenters })
    .from(gpMonthlyAttendance)
    .innerJoin(gamePresenters, eq(gpMonthlyAttendance.gamePresenterId, gamePresenters.id))
    .where(and(eq(gamePresenters.teamId, teamId), eq(gpMonthlyAttendance.month, month), eq(gpMonthlyAttendance.year, year)));
  const statsData = await db.select({ stats: monthlyGpStats, gamePresenter: gamePresenters })
    .from(monthlyGpStats)
    .innerJoin(gamePresenters, eq(monthlyGpStats.gamePresenterId, gamePresenters.id))
    .where(and(eq(gamePresenters.teamId, teamId), eq(monthlyGpStats.month, month), eq(monthlyGpStats.year, year)));
  return teamGPs.map(gp => {
    const gpAttendance = attendanceData.find(a => a.gamePresenter.id === gp.id);
    const gpStats = statsData.find(s => s.gamePresenter.id === gp.id);
    return { gamePresenter: gp, attendance: gpAttendance?.attendance || null, monthlyStats: gpStats?.stats || null };
  });
}

/**
 * Get attendance trends for a team across multiple months
 * Returns aggregated monthly totals for the last N months
 */
export async function getAttendanceTrends(teamId: number, months: number = 6) {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const results: Array<{
    month: number;
    year: number;
    totalMistakes: number;
    totalExtraShifts: number;
    totalLateToWork: number;
    totalMissedDays: number;
    totalSickLeaves: number;
    gpCount: number;
  }> = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    const teamGPs = await db.select().from(gamePresenters).where(eq(gamePresenters.teamId, teamId));
    const attendanceData = await db.select({ attendance: gpMonthlyAttendance })
      .from(gpMonthlyAttendance)
      .innerJoin(gamePresenters, eq(gpMonthlyAttendance.gamePresenterId, gamePresenters.id))
      .where(and(eq(gamePresenters.teamId, teamId), eq(gpMonthlyAttendance.month, month), eq(gpMonthlyAttendance.year, year)));
    const statsData = await db.select({ stats: monthlyGpStats })
      .from(monthlyGpStats)
      .innerJoin(gamePresenters, eq(monthlyGpStats.gamePresenterId, gamePresenters.id))
      .where(and(eq(gamePresenters.teamId, teamId), eq(monthlyGpStats.month, month), eq(monthlyGpStats.year, year)));

    const totals = {
      month,
      year,
      totalMistakes: 0,
      totalExtraShifts: 0,
      totalLateToWork: 0,
      totalMissedDays: 0,
      totalSickLeaves: 0,
      gpCount: teamGPs.length,
    };

    // Use monthlyGpStats.mistakes as the primary source for mistake counts
    // Build a set of GP IDs that have stats data
    const gpMistakesFromStats = new Set<number>();
    for (const stat of statsData) {
      if (stat.stats?.gamePresenterId) {
        gpMistakesFromStats.add(stat.stats.gamePresenterId);
        totals.totalMistakes += stat.stats.mistakes ?? 0;
      }
    }

    for (const att of attendanceData) {
      // Only use attendance.mistakes as fallback if no stats record exists for this GP
      if (att.attendance?.gamePresenterId && !gpMistakesFromStats.has(att.attendance.gamePresenterId)) {
        totals.totalMistakes += att.attendance?.mistakes ?? 0;
      }
      totals.totalExtraShifts += att.attendance?.extraShifts ?? 0;
      totals.totalLateToWork += att.attendance?.lateToWork ?? 0;
      totals.totalMissedDays += att.attendance?.missedDays ?? 0;
      totals.totalSickLeaves += att.attendance?.sickLeaves ?? 0;
    }

    results.push(totals);
  }

  return results;
}
