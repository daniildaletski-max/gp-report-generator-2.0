/**
 * Monthly GP Stats Database Operations
 * Handles attitude, mistakes, bulk operations, and GP history
 */
import { eq, and, sql } from "drizzle-orm";
import { monthlyGpStats, InsertMonthlyGpStats, MonthlyGpStats, gamePresenters } from "../../drizzle/schema";
import { getDb } from "./connection";
import { getOrCreateAttendance, updateAttendance } from "./attendance";

// ============================================
// CRUD
// ============================================

export async function getOrCreateMonthlyGpStats(gpId: number, month: number, year: number): Promise<MonthlyGpStats> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(monthlyGpStats)
    .where(and(eq(monthlyGpStats.gamePresenterId, gpId), eq(monthlyGpStats.month, month), eq(monthlyGpStats.year, year)))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const result = await db.insert(monthlyGpStats).values({ gamePresenterId: gpId, month, year, attitude: null, mistakes: 0 });
  const newStats = await db.select().from(monthlyGpStats).where(eq(monthlyGpStats.id, Number(result[0].insertId))).limit(1);
  return newStats[0];
}

export async function updateMonthlyGpStats(
  gpId: number, month: number, year: number,
  data: { attitude?: number | null; mistakes?: number; notes?: string | null; updatedById?: number; userId?: number }
): Promise<MonthlyGpStats | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const stats = await getOrCreateMonthlyGpStats(gpId, month, year);
  await db.update(monthlyGpStats).set(data).where(eq(monthlyGpStats.id, stats.id));
  const updated = await db.select().from(monthlyGpStats).where(eq(monthlyGpStats.id, stats.id)).limit(1);
  return updated.length > 0 ? updated[0] : null;
}

export async function getMonthlyGpStatsByTeam(teamId: number, month: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ stats: monthlyGpStats, gp: gamePresenters })
    .from(monthlyGpStats)
    .innerJoin(gamePresenters, eq(monthlyGpStats.gamePresenterId, gamePresenters.id))
    .where(and(eq(gamePresenters.teamId, teamId), eq(monthlyGpStats.month, month), eq(monthlyGpStats.year, year)));
}

export async function getAllMonthlyGpStats(month: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ stats: monthlyGpStats, gp: gamePresenters })
    .from(monthlyGpStats)
    .innerJoin(gamePresenters, eq(monthlyGpStats.gamePresenterId, gamePresenters.id))
    .where(and(eq(monthlyGpStats.month, month), eq(monthlyGpStats.year, year)));
}

export async function getMonthlyGpStats(gpId: number, month: number, year: number): Promise<MonthlyGpStats | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(monthlyGpStats)
    .where(and(eq(monthlyGpStats.gamePresenterId, gpId), eq(monthlyGpStats.month, month), eq(monthlyGpStats.year, year)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getGamePresentersByTeamWithStats(teamId: number, month: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  const gps = await db.select().from(gamePresenters).where(eq(gamePresenters.teamId, teamId)).orderBy(gamePresenters.name);
  return await Promise.all(gps.map(async (gp) => {
    const statsResult = await db.select().from(monthlyGpStats)
      .where(and(eq(monthlyGpStats.gamePresenterId, gp.id), eq(monthlyGpStats.month, month), eq(monthlyGpStats.year, year)))
      .limit(1);
    return { ...gp, stats: statsResult.length > 0 ? statsResult[0] : null };
  }));
}

// ============================================
// BULK OPERATIONS
// ============================================

export interface BulkGpStatsUpdate {
  gpId: number;
  attitude?: number | null;
  mistakes?: number;
  notes?: string | null;
}

export async function bulkUpdateMonthlyGpStats(
  updates: BulkGpStatsUpdate[], month: number, year: number, updatedById: number
): Promise<{ success: number; failed: number; errors: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let success = 0, failed = 0;
  const errors: string[] = [];
  for (const update of updates) {
    try {
      const stats = await getOrCreateMonthlyGpStats(update.gpId, month, year);
      const updateData: Record<string, any> = { updatedById };
      if (update.attitude !== undefined) updateData.attitude = update.attitude;
      if (update.mistakes !== undefined) updateData.mistakes = update.mistakes;
      if (update.notes !== undefined) updateData.notes = update.notes;
      await db.update(monthlyGpStats).set(updateData).where(eq(monthlyGpStats.id, stats.id));
      success++;
    } catch (error: any) { failed++; errors.push(`GP ${update.gpId}: ${error.message}`); }
  }
  return { success, failed, errors };
}

export async function bulkSetAttitude(gpIds: number[], attitude: number, month: number, year: number, updatedById: number): Promise<{ success: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let success = 0, failed = 0;
  for (const gpId of gpIds) {
    try {
      const stats = await getOrCreateMonthlyGpStats(gpId, month, year);
      await db.update(monthlyGpStats).set({ attitude, updatedById }).where(eq(monthlyGpStats.id, stats.id));
      success++;
    } catch { failed++; }
  }
  return { success, failed };
}

export async function bulkResetMistakes(gpIds: number[], month: number, year: number, updatedById: number): Promise<{ success: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let success = 0, failed = 0;
  for (const gpId of gpIds) {
    try {
      const stats = await getOrCreateMonthlyGpStats(gpId, month, year);
      await db.update(monthlyGpStats).set({ mistakes: 0, updatedById }).where(eq(monthlyGpStats.id, stats.id));
      success++;
    } catch { failed++; }
  }
  return { success, failed };
}

export async function incrementGPMistakes(gamePresenterId: number, month: number, year: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const stats = await getOrCreateMonthlyGpStats(gamePresenterId, month, year);
  await db.update(monthlyGpStats).set({ mistakes: (stats.mistakes || 0) + 1 }).where(eq(monthlyGpStats.id, stats.id));
}

export async function updateGPAttitude(gamePresenterId: number, month: number, year: number, attitudeScore: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const stats = await getOrCreateMonthlyGpStats(gamePresenterId, month, year);
  const currentAttitude = stats.attitude ?? 0;
  await db.update(monthlyGpStats).set({ attitude: currentAttitude + attitudeScore }).where(eq(monthlyGpStats.id, stats.id));
}

// ============================================
// GP HISTORY (for GP Portal)
// ============================================

export async function getGpMonthlyHistory(gpId: number, monthsBack: number = 6) {
  const db = await getDb();
  if (!db) return [];
  const { evaluations } = await import("../../drizzle/schema");
  const { gte, lte } = await import("drizzle-orm");
  const now = new Date();
  const months: Array<any> = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const label = `${monthNames[month - 1]} ${year}`;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const monthEvals = await db.select({ totalScore: evaluations.totalScore, appearanceScore: evaluations.appearanceScore, gamePerformanceTotalScore: evaluations.gamePerformanceTotalScore })
      .from(evaluations)
      .where(and(eq(evaluations.gamePresenterId, gpId), gte(evaluations.evaluationDate, startDate), lte(evaluations.evaluationDate, endDate)));
    const statsResult = await db.select().from(monthlyGpStats)
      .where(and(eq(monthlyGpStats.gamePresenterId, gpId), eq(monthlyGpStats.month, month), eq(monthlyGpStats.year, year)))
      .limit(1);
    const stats = statsResult.length > 0 ? statsResult[0] : null;
    const evalCount = monthEvals.length;
    const scores = monthEvals.map(e => e.totalScore || 0);
    const appearanceScores = monthEvals.map(e => e.appearanceScore || 0);
    const performanceScores = monthEvals.map(e => e.gamePerformanceTotalScore || 0);
    months.push({
      month, year, label,
      avgTotal: evalCount > 0 ? scores.reduce((a, b) => a + b, 0) / evalCount : 0,
      avgAppearance: evalCount > 0 ? appearanceScores.reduce((a, b) => a + b, 0) / evalCount : 0,
      avgPerformance: evalCount > 0 ? performanceScores.reduce((a, b) => a + b, 0) / evalCount : 0,
      evalCount,
      highScore: evalCount > 0 ? Math.max(...scores) : 0,
      lowScore: evalCount > 0 ? Math.min(...scores) : 0,
      attitude: stats?.attitude ?? null,
      mistakes: stats?.mistakes ?? 0,
      totalGames: stats?.totalGames ?? 0,
    });
  }
  return months;
}

// ============================================
// GOOGLE SHEETS SYNC
// ============================================

export interface GoogleSheetsErrorData {
  gpName: string;
  errorCount: number;
}

export async function syncErrorsFromGoogleSheets(errors: GoogleSheetsErrorData[], month: number, year: number): Promise<{ updated: number; notFound: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let updated = 0;
  const notFound: string[] = [];
  for (const { gpName, errorCount } of errors) {
    const gps = await db.select().from(gamePresenters).where(sql`LOWER(${gamePresenters.name}) LIKE LOWER(${'%' + gpName + '%'})`).limit(1);
    if (gps.length > 0) {
      const stats = await getOrCreateMonthlyGpStats(gps[0].id, month, year);
      await db.update(monthlyGpStats).set({ mistakes: errorCount }).where(eq(monthlyGpStats.id, stats.id));
      updated++;
    } else {
      const exactMatch = await db.select().from(gamePresenters).where(eq(gamePresenters.name, gpName)).limit(1);
      if (exactMatch.length > 0) {
        const stats = await getOrCreateMonthlyGpStats(exactMatch[0].id, month, year);
        await db.update(monthlyGpStats).set({ mistakes: errorCount }).where(eq(monthlyGpStats.id, stats.id));
        updated++;
      } else { notFound.push(gpName); }
    }
  }
  return { updated, notFound };
}
