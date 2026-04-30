/**
 * Error Files, GP Errors, Error Screenshots Database Operations
 */
import { eq, and, gte, lte, lt, desc, sql } from "drizzle-orm";
import {
  errorFiles, InsertErrorFile, ErrorFile,
  gpErrors, InsertGpError, GpError,
  errorScreenshots, InsertErrorScreenshot, ErrorScreenshot,
  gamePresenters, monthlyGpStats
} from "../../drizzle/schema";
import { getDb } from "./connection";
import { getOrCreateMonthlyGpStats } from "./monthlyStats";
import { getOrCreateAttendance, updateAttendance } from "./attendance";
import { createLogger } from "../services/logger";
import { monthRange } from "./_dateRange";

/**
 * Match rows whose `errorDate` falls in the given month — fall back to
 * `createdAt` for legacy rows where `errorDate` was never parsed. Without
 * this, a screenshot uploaded in April containing errors dated March
 * leaks into April's filter (the row's stored `month`/`year` came from
 * upload moment, not from the parsed `errorDate`).
 */
function errorScreenshotMonthFilter(month: number, year: number) {
  const { start, endExclusive } = monthRange(month, year);
  const effective = sql`COALESCE(${errorScreenshots.errorDate}, ${errorScreenshots.createdAt})`;
  return and(gte(effective, start), lt(effective, endExclusive));
}

const log = createLogger("DB:Errors");

// ============================================
// ERROR FILES
// ============================================

export async function createErrorFile(data: InsertErrorFile): Promise<ErrorFile> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(errorFiles).values(data);
  const newFile = await db.select().from(errorFiles).where(eq(errorFiles.id, Number(result[0].insertId))).limit(1);
  return newFile[0];
}

export async function getErrorFileByMonthYearType(month: number, year: number, fileType: "playgon" | "mg", userId: number): Promise<ErrorFile | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(errorFiles)
    .where(and(eq(errorFiles.month, month), eq(errorFiles.year, year), eq(errorFiles.fileType, fileType), eq(errorFiles.uploadedById, userId)))
    .orderBy(desc(errorFiles.createdAt)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllErrorFiles(): Promise<ErrorFile[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(errorFiles).orderBy(desc(errorFiles.createdAt));
}

export async function deleteErrorFile(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Also delete every `gpErrors` row that pointed at this file, otherwise
  // those rows become orphans (errorFileId references a no-longer-existent
  // file) but keep counting in the GP portal's mistakes total. The user's
  // report of "5 mistakes vs 2 in Excel" was driven by exactly this leak.
  await db.delete(gpErrors).where(eq(gpErrors.errorFileId, id));
  await db.delete(errorFiles).where(eq(errorFiles.id, id));
}

export async function getErrorFilesByUser(userId: number): Promise<ErrorFile[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(errorFiles).where(eq(errorFiles.uploadedById, userId)).orderBy(desc(errorFiles.createdAt));
}

export async function deleteErrorFileByUser(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const file = await db.select().from(errorFiles).where(eq(errorFiles.id, id)).limit(1);
  if (!file.length) throw new Error("Error file not found");
  if (file[0].uploadedById !== userId) throw new Error("Access denied: You can only delete your own error files");
  // Cascade: drop gpErrors first so they don't survive as orphans (see
  // matching comment in deleteErrorFile).
  await db.delete(gpErrors).where(eq(gpErrors.errorFileId, id));
  await db.delete(errorFiles).where(eq(errorFiles.id, id));
  return true;
}

/**
 * One-shot cleanup: drop every `gpErrors` row whose `errorFileId` no
 * longer points to an existing `errorFiles` row. These are orphans
 * left behind by an earlier version of `deleteErrorFile` that didn't
 * cascade. Returns the count removed.
 *
 * Optional `userId` scope keeps the cleanup tenant-safe.
 */
export async function pruneOrphanGpErrors(userId?: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conditions: any[] = [];
  if (userId) conditions.push(eq(gpErrors.userId, userId));
  const candidates = await db.select({
    id: gpErrors.id,
    errorFileId: gpErrors.errorFileId,
  }).from(gpErrors).where(conditions.length ? and(...conditions) : undefined as any);
  if (candidates.length === 0) return 0;
  const fileIds = Array.from(new Set(candidates.map(c => c.errorFileId).filter((x): x is number => typeof x === "number")));
  let liveIds = new Set<number>();
  if (fileIds.length > 0) {
    const live = await db.select({ id: errorFiles.id }).from(errorFiles);
    liveIds = new Set(live.map(f => f.id));
  }
  const orphanIds = candidates.filter(c => !c.errorFileId || !liveIds.has(c.errorFileId)).map(c => c.id);
  if (orphanIds.length === 0) return 0;
  // Delete in batches of 500 so a giant orphan set doesn't blow up the IN clause.
  for (let i = 0; i < orphanIds.length; i += 500) {
    const batch = orphanIds.slice(i, i + 500);
    await db.delete(gpErrors).where(sql`${gpErrors.id} IN (${sql.join(batch.map(id => sql`${id}`), sql`, `)})`);
  }
  return orphanIds.length;
}

// ============================================
// GP ERRORS
// ============================================

export async function createGpError(data: InsertGpError): Promise<GpError> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(gpErrors).values(data);
  const newError = await db.select().from(gpErrors).where(eq(gpErrors.id, Number(result[0].insertId))).limit(1);
  return newError[0];
}

export async function deleteGpErrorsByMonthYear(
  month: number,
  year: number,
  userId?: number,
  errorFileId?: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const conditions: any[] = [];

  // When the caller knows the originating file, scope deletion to that file
  // so a "playgon" reupload doesn't wipe out "mg" errors for the same month
  // (cross-type deletion bug, fixed in commit 42035e0).
  if (errorFileId) {
    conditions.push(eq(gpErrors.errorFileId, errorFileId));
  } else {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    conditions.push(gte(gpErrors.errorDate, startDate));
    conditions.push(lte(gpErrors.errorDate, endDate));
  }

  if (userId) conditions.push(eq(gpErrors.userId, userId));
  await db.delete(gpErrors).where(and(...conditions));
}

export async function getErrorCountByGP(month: number, year: number, userId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  // PRIMARY: Read from monthlyGpStats.mistakes which stores the correct count
  // from "Error Count Analysis" sheet column E (excludes technical errors)
  const conditions: any[] = [
    eq(monthlyGpStats.month, month),
    eq(monthlyGpStats.year, year),
  ];
  if (userId) conditions.push(eq(gamePresenters.userId, userId));
  
  const result = await db.select({
    gpName: gamePresenters.name,
    errorCount: monthlyGpStats.mistakes,
  })
  .from(monthlyGpStats)
  .innerJoin(gamePresenters, eq(monthlyGpStats.gamePresenterId, gamePresenters.id))
  .where(and(...conditions));
  
  // Filter out GPs with 0 mistakes to match previous behavior
  return result.filter(r => (r.errorCount || 0) > 0).map(r => ({
    gpName: r.gpName,
    errorCount: r.errorCount || 0,
  }));
}

export async function updateGPMistakesFromErrors(month: number, year: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const errorCounts = await getErrorCountByGP(month, year);
  for (const { gpName, errorCount } of errorCounts) {
    const gp = await db.select().from(gamePresenters).where(eq(gamePresenters.name, gpName)).limit(1);
    if (gp.length > 0) {
      const attendance = await getOrCreateAttendance(gp[0].id, month, year);
      await updateAttendance(attendance.id, { mistakes: errorCount });
      const stats = await getOrCreateMonthlyGpStats(gp[0].id, month, year);
      await db.update(monthlyGpStats).set({ mistakes: errorCount }).where(eq(monthlyGpStats.id, stats.id));
    }
  }
}

export async function updateGPMistakesDirectly(gpName: string, mistakesCount: number, month: number, year: number, userId?: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const conditions: any[] = [eq(gamePresenters.name, gpName.trim())];
  if (userId) conditions.push(eq(gamePresenters.userId, userId));
  const gp = await db.select().from(gamePresenters).where(and(...conditions)).limit(1);
  if (gp.length === 0) {
    const normalizedName = gpName.trim().replace(/\s+/g, ' ');
    const allGPs = userId
      ? await db.select().from(gamePresenters).where(eq(gamePresenters.userId, userId))
      : await db.select().from(gamePresenters);
    const matchedGP = allGPs.find(g => g.name.toLowerCase().replace(/\s+/g, ' ') === normalizedName.toLowerCase());
    if (!matchedGP) return false;
    const stats = await getOrCreateMonthlyGpStats(matchedGP.id, month, year);
    await db.update(monthlyGpStats).set({ mistakes: mistakesCount }).where(eq(monthlyGpStats.id, stats.id));
    const attendance = await getOrCreateAttendance(matchedGP.id, month, year);
    await updateAttendance(attendance.id, { mistakes: mistakesCount });
    return true;
  }
  const stats = await getOrCreateMonthlyGpStats(gp[0].id, month, year);
  await db.update(monthlyGpStats).set({ mistakes: mistakesCount }).where(eq(monthlyGpStats.id, stats.id));
  const attendance = await getOrCreateAttendance(gp[0].id, month, year);
  await updateAttendance(attendance.id, { mistakes: mistakesCount });
  return true;
}

/**
 * Pull every Excel-imported error for a GP in a given month.
 *
 * Two leak vectors that this function used to suffer from:
 *
 *   1. Exact `gpName` equality. Excel files routinely come with subtle
 *      whitespace differences (double space, trailing space, mixed case)
 *      relative to the canonical name in `gamePresenters`. Olha's
 *      Playgon row was being dropped because the Excel said
 *      "Olha Kyrychenko" while the DB stored "Olha  Kyrychenko".
 *      Normalize both sides before comparing.
 *
 *   2. Strict `errorDate BETWEEN startDate AND endDate`. Rows where the
 *      OCR/parser couldn't recover a date (NULL `errorDate`) were
 *      silently filtered out, even though we know the row belongs to
 *      this `errorFile`'s month/year. Use `COALESCE(errorDate, createdAt)`
 *      so legacy / partially-parsed rows still surface.
 */
export async function getGpErrorsForPortal(gpId: number, month: number, year: number): Promise<GpError[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const gp = await db.select().from(gamePresenters).where(eq(gamePresenters.id, gpId)).limit(1);
    if (gp.length === 0) return [];
    const { start, endExclusive } = monthRange(month, year);
    const effective = sql`COALESCE(${gpErrors.errorDate}, ${gpErrors.createdAt})`;
    // Pull all candidates by month, then post-filter on a normalized
    // name so whitespace/case variations between the Excel parse and
    // the canonical GP name don't drop rows.
    const candidates = await db
      .select()
      .from(gpErrors)
      .where(and(gte(effective, start), lt(effective, endExclusive)))
      .orderBy(desc(gpErrors.errorDate));
    const target = normalizeName(gp[0].name);
    return candidates.filter(row => normalizeName(row.gpName) === target);
  } catch (error) {
    log.error("Error getting GP errors for portal", error instanceof Error ? error : undefined);
    return [];
  }
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// ============================================
// ERROR SCREENSHOTS
// ============================================

export async function createErrorScreenshot(data: InsertErrorScreenshot): Promise<ErrorScreenshot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(errorScreenshots).values(data);
  const created = await db.select().from(errorScreenshots).where(eq(errorScreenshots.id, result[0].insertId)).limit(1);
  return created[0];
}

export async function getErrorScreenshots(month: number, year: number, gamePresenterId?: number): Promise<ErrorScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [errorScreenshotMonthFilter(month, year)];
  if (gamePresenterId) conditions.push(eq(errorScreenshots.gamePresenterId, gamePresenterId));
  return await db.select().from(errorScreenshots).where(and(...conditions)).orderBy(desc(errorScreenshots.createdAt));
}

export async function getErrorScreenshotsByGpId(gamePresenterId: number, month?: number, year?: number): Promise<ErrorScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(errorScreenshots.gamePresenterId, gamePresenterId)];
  if (month && year) conditions.push(errorScreenshotMonthFilter(month, year));
  return await db.select().from(errorScreenshots).where(and(...conditions)).orderBy(desc(errorScreenshots.createdAt));
}

export async function deleteErrorScreenshot(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(errorScreenshots).where(eq(errorScreenshots.id, id));
  return true;
}

export async function getErrorScreenshotStats(month: number, year: number) {
  const db = await getDb();
  if (!db) return { byType: [], bySeverity: [], byGp: [], total: 0 };
  const baseConditions = [errorScreenshotMonthFilter(month, year)];
  const byType = await db.select({ errorType: errorScreenshots.errorType, count: sql<number>`COUNT(*)` }).from(errorScreenshots).where(and(...baseConditions)).groupBy(errorScreenshots.errorType);
  const bySeverity = await db.select({ severity: errorScreenshots.severity, count: sql<number>`COUNT(*)` }).from(errorScreenshots).where(and(...baseConditions)).groupBy(errorScreenshots.severity);
  const byGp = await db.select({ gpName: errorScreenshots.gpName, gamePresenterId: errorScreenshots.gamePresenterId, count: sql<number>`COUNT(*)` }).from(errorScreenshots).where(and(...baseConditions)).groupBy(errorScreenshots.gpName, errorScreenshots.gamePresenterId).orderBy(desc(sql`COUNT(*)`));
  const totalResult = await db.select({ count: sql<number>`COUNT(*)` }).from(errorScreenshots).where(and(...baseConditions));
  return { byType, bySeverity, byGp, total: totalResult[0]?.count || 0 };
}

export async function getErrorScreenshotsForGP(gpId: number, month: number, year: number): Promise<ErrorScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(errorScreenshots).where(and(eq(errorScreenshots.gamePresenterId, gpId), errorScreenshotMonthFilter(month, year))).orderBy(desc(errorScreenshots.createdAt));
  } catch (error) { log.error("Error getting error screenshots for GP", error instanceof Error ? error : undefined); return []; }
}

export async function getErrorScreenshotsByUser(month: number, year: number, userId: number, gamePresenterId?: number): Promise<ErrorScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [errorScreenshotMonthFilter(month, year), eq(errorScreenshots.uploadedById, userId)];
  if (gamePresenterId) conditions.push(eq(errorScreenshots.gamePresenterId, gamePresenterId));
  return await db.select().from(errorScreenshots).where(and(...conditions)).orderBy(desc(errorScreenshots.createdAt));
}

export async function getErrorScreenshotStatsByUser(month: number, year: number, userId: number) {
  const db = await getDb();
  if (!db) return { byType: [], bySeverity: [], total: 0 };
  const baseConditions = [errorScreenshotMonthFilter(month, year), eq(errorScreenshots.uploadedById, userId)];
  const byType = await db.select({ errorType: errorScreenshots.errorType, count: sql<number>`COUNT(*)` }).from(errorScreenshots).where(and(...baseConditions)).groupBy(errorScreenshots.errorType);
  const bySeverity = await db.select({ severity: errorScreenshots.severity, count: sql<number>`COUNT(*)` }).from(errorScreenshots).where(and(...baseConditions)).groupBy(errorScreenshots.severity);
  const totalResult = await db.select({ count: sql<number>`COUNT(*)` }).from(errorScreenshots).where(and(...baseConditions));
  return { byType, bySeverity, total: totalResult[0]?.count || 0 };
}

export async function deleteErrorScreenshotByUser(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const screenshot = await db.select().from(errorScreenshots).where(eq(errorScreenshots.id, id)).limit(1);
  if (!screenshot.length) throw new Error("Error screenshot not found");
  if (screenshot[0].uploadedById !== userId) throw new Error("Access denied");
  await db.delete(errorScreenshots).where(eq(errorScreenshots.id, id));
  return true;
}
