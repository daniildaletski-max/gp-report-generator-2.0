/**
 * GP Monthly Attendance Database Operations
 */
import { eq, and } from "drizzle-orm";
import { gpMonthlyAttendance, InsertGpMonthlyAttendance, GpMonthlyAttendance, gamePresenters, monthlyGpStats } from "../../drizzle/schema";
import { getDb } from "./connection";

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
