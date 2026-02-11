/**
 * Error Files, GP Errors, Error Screenshots Database Operations
 */
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
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
  await db.delete(errorFiles).where(eq(errorFiles.id, id));
  return true;
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

export async function deleteGpErrorsByMonthYear(month: number, year: number, userId?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const conditions: any[] = [gte(gpErrors.errorDate, startDate), lte(gpErrors.errorDate, endDate)];
  if (userId) conditions.push(eq(gpErrors.userId, userId));
  await db.delete(gpErrors).where(and(...conditions));
}

export async function getErrorCountByGP(month: number, year: number, userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const conditions: any[] = [gte(gpErrors.errorDate, startDate), lte(gpErrors.errorDate, endDate)];
  if (userId) conditions.push(eq(gpErrors.userId, userId));
  return await db.select({ gpName: gpErrors.gpName, errorCount: sql<number>`COUNT(${gpErrors.id})` })
    .from(gpErrors).where(and(...conditions)).groupBy(gpErrors.gpName);
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

export async function getGpErrorsForPortal(gpId: number, month: number, year: number): Promise<GpError[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const gp = await db.select().from(gamePresenters).where(eq(gamePresenters.id, gpId)).limit(1);
    if (gp.length === 0) return [];
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    return await db.select().from(gpErrors).where(and(eq(gpErrors.gpName, gp[0].name), gte(gpErrors.errorDate, startDate), lte(gpErrors.errorDate, endDate))).orderBy(desc(gpErrors.errorDate));
  } catch (error) { log.error("Error getting GP errors for portal", error instanceof Error ? error : undefined); return []; }
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
  const conditions: any[] = [eq(errorScreenshots.month, month), eq(errorScreenshots.year, year)];
  if (gamePresenterId) conditions.push(eq(errorScreenshots.gamePresenterId, gamePresenterId));
  return await db.select().from(errorScreenshots).where(and(...conditions)).orderBy(desc(errorScreenshots.createdAt));
}

export async function getErrorScreenshotsByGpId(gamePresenterId: number, month?: number, year?: number): Promise<ErrorScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(errorScreenshots.gamePresenterId, gamePresenterId)];
  if (month && year) { conditions.push(eq(errorScreenshots.month, month)); conditions.push(eq(errorScreenshots.year, year)); }
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
  const baseConditions = [eq(errorScreenshots.month, month), eq(errorScreenshots.year, year)];
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
    return await db.select().from(errorScreenshots).where(and(eq(errorScreenshots.gamePresenterId, gpId), eq(errorScreenshots.month, month), eq(errorScreenshots.year, year))).orderBy(desc(errorScreenshots.createdAt));
  } catch (error) { log.error("Error getting error screenshots for GP", error instanceof Error ? error : undefined); return []; }
}

export async function getErrorScreenshotsByUser(month: number, year: number, userId: number, gamePresenterId?: number): Promise<ErrorScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(errorScreenshots.month, month), eq(errorScreenshots.year, year), eq(errorScreenshots.uploadedById, userId)];
  if (gamePresenterId) conditions.push(eq(errorScreenshots.gamePresenterId, gamePresenterId));
  return await db.select().from(errorScreenshots).where(and(...conditions)).orderBy(desc(errorScreenshots.createdAt));
}

export async function getErrorScreenshotStatsByUser(month: number, year: number, userId: number) {
  const db = await getDb();
  if (!db) return { byType: [], bySeverity: [], total: 0 };
  const baseConditions = [eq(errorScreenshots.month, month), eq(errorScreenshots.year, year), eq(errorScreenshots.uploadedById, userId)];
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
