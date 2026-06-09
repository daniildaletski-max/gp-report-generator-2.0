/**
 * Monthly GP Stats Database Operations
 * Handles attitude, mistakes, bulk operations, and GP history
 */
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import { monthlyGpStats, InsertMonthlyGpStats, MonthlyGpStats, gamePresenters } from "../../drizzle/schema";
import { getDb } from "./connection";
import { getOrCreateAttendance, updateAttendance } from "./attendance";
import { addColumnIfMissing } from "./_schemaUtils";

/**
 * Idempotent boot install of monthly_gp_stats.workedHours — the worked-
 * hours input the performance-bonus engine multiplies by the level rate.
 * Same "Manus doesn't run migrations" pattern as ensureAttitudeManualColumn.
 */
export async function ensureWorkedHoursColumn(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await addColumnIfMissing(
    db,
    "ALTER TABLE `monthly_gp_stats` ADD COLUMN `workedHours` int NULL",
    "monthly_gp_stats.workedHours",
  );
}

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
  data: { attitude?: number | null; mistakes?: number; totalGames?: number; workedHours?: number | null; notes?: string | null; updatedById?: number; userId?: number }
): Promise<MonthlyGpStats | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const stats = await getOrCreateMonthlyGpStats(gpId, month, year);
  const patch: Record<string, unknown> = { ...data };
  // A manual attitude edit pins the value (hybrid model): mark it an
  // override so screenshot-driven recomputation won't clobber it.
  if (data.attitude !== undefined) patch.attitudeIsManual = 1;
  await db.update(monthlyGpStats).set(patch).where(eq(monthlyGpStats.id, stats.id));
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

/**
 * Bulk fetch one month's stats rows for many GPs in a single query,
 * keyed by gamePresenterId. Kills the per-GP lookup loop that made
 * listWithStats issue N queries for an N-GP roster.
 */
export async function getMonthlyGpStatsForGPs(
  gamePresenterIds: number[],
  month: number,
  year: number,
): Promise<Map<number, MonthlyGpStats>> {
  const out = new Map<number, MonthlyGpStats>();
  if (gamePresenterIds.length === 0) return out;
  const db = await getDb();
  if (!db) return out;
  const rows = await db.select().from(monthlyGpStats)
    .where(and(
      inArray(monthlyGpStats.gamePresenterId, gamePresenterIds),
      eq(monthlyGpStats.month, month),
      eq(monthlyGpStats.year, year),
    ));
  for (const r of rows) out.set(r.gamePresenterId, r);
  return out;
}

export async function getGamePresentersByTeamWithStats(teamId: number, month: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  const gps = await db.select().from(gamePresenters).where(eq(gamePresenters.teamId, teamId)).orderBy(gamePresenters.name);
  const statsByGp = await getMonthlyGpStatsForGPs(gps.map(g => g.id), month, year);
  return gps.map(gp => ({ ...gp, stats: statsByGp.get(gp.id) ?? null }));
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
      if (update.attitude !== undefined) { updateData.attitude = update.attitude; updateData.attitudeIsManual = 1; }
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
      // Manual set → pin as an override (hybrid model).
      await db.update(monthlyGpStats).set({ attitude, attitudeIsManual: 1, updatedById }).where(eq(monthlyGpStats.id, stats.id));
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

/**
 * Batch sibling of `getGpMonthlyHistory` for the peer-benchmark
 * widget on the GP Portal. Returns each GP's average total /
 * appearance / performance over the last `monthsBack` months in a
 * single team-scoped query, instead of running getGpMonthlyHistory
 * once per peer (which itself fans out to 2 queries per month).
 *
 * Returns a Map<gpId, { total, appearance, performance, evalCount }>
 * where avg fields are 0 when the GP has no evals in the window.
 */
export async function getTeamPeerAverages(opts: {
  teamId: number;
  monthsBack?: number;
}): Promise<Map<number, { total: number; appearance: number; performance: number; evalCount: number }>> {
  const out = new Map<number, { total: number; appearance: number; performance: number; evalCount: number }>();
  const db = await getDb();
  if (!db) return out;
  const months = opts.monthsBack ?? 6;
  const { evaluations: evs, gamePresenters: gps } = await import("../../drizzle/schema");
  const now = new Date();
  // Window start: first day of the month `monthsBack-1` ago.
  const winStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  // ONE query: every relevant eval row for everyone on the team in
  // the window. Joined to gamePresenters so we can filter by team.
  const rows = await db
    .select({
      gpId: evs.gamePresenterId,
      total: evs.totalScore,
      appearance: evs.appearanceScore,
      perf: evs.gamePerformanceTotalScore,
    })
    .from(evs)
    .innerJoin(gps, eq(gps.id, evs.gamePresenterId))
    // COALESCE on (evaluationDate, createdAt): legacy / partially-
    // parsed rows often have a null evaluationDate but a valid
    // createdAt. Using a strict gte(evaluationDate, ...) silently
    // drops those rows from the benchmark pool, shrinking the
    // comparison and skewing percentiles (Codex P2 on PR #78).
    .where(and(
      eq(gps.teamId, opts.teamId),
      gte(sql`COALESCE(${evs.evaluationDate}, ${evs.createdAt})`, winStart),
    ));
  // Group + aggregate in memory. Cheap — even huge teams have at most
  // a few hundred evals across 6 months.
  type Acc = { total: number; appearance: number; performance: number; evalCount: number };
  const sums = new Map<number, Acc>();
  for (const r of rows) {
    const id = r.gpId;
    if (id == null) continue;
    const a = sums.get(id) ?? { total: 0, appearance: 0, performance: 0, evalCount: 0 };
    a.total += Number(r.total ?? 0);
    a.appearance += Number(r.appearance ?? 0);
    a.performance += Number(r.perf ?? 0);
    a.evalCount += 1;
    sums.set(id, a);
  }
  sums.forEach((a, id) => {
    if (a.evalCount === 0) return;
    out.set(id, {
      total: a.total / a.evalCount,
      appearance: a.appearance / a.evalCount,
      performance: a.performance / a.evalCount,
      evalCount: a.evalCount,
    });
  });
  return out;
}
