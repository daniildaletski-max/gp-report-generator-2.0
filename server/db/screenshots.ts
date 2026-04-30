/**
 * Attitude Screenshots Database Operations
 */
import { eq, and, desc, gte, lt, sql } from "drizzle-orm";
import { attitudeScreenshots, InsertAttitudeScreenshot, AttitudeScreenshot } from "../../drizzle/schema";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";
import { monthRange } from "./_dateRange";

/**
 * Filter expression that matches rows whose entry-time `evaluationDate`
 * falls inside the given month — falling back to `createdAt` for legacy
 * rows that have no parsed evaluationDate.
 *
 * Without this, a screenshot uploaded in April containing entries dated
 * March leaks into April's filter (the row's stored `month`/`year` ints
 * came from upload moment, not from entry date).
 */
function attitudeMonthFilter(month: number, year: number) {
  const { start, endExclusive } = monthRange(month, year);
  const effective = sql`COALESCE(${attitudeScreenshots.evaluationDate}, ${attitudeScreenshots.createdAt})`;
  return and(gte(effective, start), lt(effective, endExclusive));
}

const log = createLogger("DB:Screenshots");

export async function createAttitudeScreenshot(data: InsertAttitudeScreenshot): Promise<AttitudeScreenshot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(attitudeScreenshots).values(data);
  const created = await db.select().from(attitudeScreenshots).where(eq(attitudeScreenshots.id, result[0].insertId)).limit(1);
  return created[0];
}

export async function getAttitudeScreenshots(month: number, year: number, gamePresenterId?: number): Promise<AttitudeScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [attitudeMonthFilter(month, year)];
  if (gamePresenterId) conditions.push(eq(attitudeScreenshots.gamePresenterId, gamePresenterId));
  return await db.select().from(attitudeScreenshots).where(and(...conditions)).orderBy(desc(attitudeScreenshots.createdAt));
}

export async function getAttitudeScreenshotsByGpId(gamePresenterId: number, month?: number, year?: number): Promise<AttitudeScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(attitudeScreenshots.gamePresenterId, gamePresenterId)];
  if (month && year) conditions.push(attitudeMonthFilter(month, year));
  return await db.select().from(attitudeScreenshots).where(and(...conditions)).orderBy(desc(attitudeScreenshots.createdAt));
}

export async function deleteAttitudeScreenshot(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(attitudeScreenshots).where(eq(attitudeScreenshots.id, id));
  return true;
}

export async function getAttitudeScreenshotsForGP(gpId: number, month: number, year: number): Promise<AttitudeScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(attitudeScreenshots).where(and(eq(attitudeScreenshots.gamePresenterId, gpId), attitudeMonthFilter(month, year))).orderBy(desc(attitudeScreenshots.createdAt));
  } catch (error) { log.error("Error getting attitude screenshots for GP", error instanceof Error ? error : undefined); return []; }
}

export async function getAllAttitudeScreenshots(month?: number, year?: number, gamePresenterId?: number): Promise<AttitudeScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const conditions: any[] = [];
    if (month !== undefined && year !== undefined) conditions.push(attitudeMonthFilter(month, year));
    if (gamePresenterId !== undefined) conditions.push(eq(attitudeScreenshots.gamePresenterId, gamePresenterId));
    const query = db.select().from(attitudeScreenshots);
    if (conditions.length > 0) return await query.where(and(...conditions)).orderBy(desc(attitudeScreenshots.createdAt));
    return await query.orderBy(desc(attitudeScreenshots.createdAt));
  } catch (error) { log.error("Error getting all attitude screenshots", error instanceof Error ? error : undefined); return []; }
}

export async function getAttitudeScreenshotsByUser(month: number, year: number, userId: number, gamePresenterId?: number): Promise<AttitudeScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [attitudeMonthFilter(month, year), eq(attitudeScreenshots.uploadedById, userId)];
  if (gamePresenterId) conditions.push(eq(attitudeScreenshots.gamePresenterId, gamePresenterId));
  return await db.select().from(attitudeScreenshots).where(and(...conditions)).orderBy(desc(attitudeScreenshots.createdAt));
}

export async function getAllAttitudeScreenshotsByUser(userId: number, month?: number, year?: number, gamePresenterId?: number): Promise<AttitudeScreenshot[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const conditions: any[] = [eq(attitudeScreenshots.uploadedById, userId)];
    if (month && year) conditions.push(attitudeMonthFilter(month, year));
    if (gamePresenterId) conditions.push(eq(attitudeScreenshots.gamePresenterId, gamePresenterId));
    return await db.select().from(attitudeScreenshots).where(and(...conditions)).orderBy(desc(attitudeScreenshots.createdAt));
  } catch (error) { log.error("Error getting attitude screenshots by user", error instanceof Error ? error : undefined); return []; }
}

export async function deleteAttitudeScreenshotByUser(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const screenshot = await db.select().from(attitudeScreenshots).where(eq(attitudeScreenshots.id, id)).limit(1);
  if (!screenshot.length) throw new Error("Attitude screenshot not found");
  if (screenshot[0].uploadedById !== userId) throw new Error("Access denied");
  await db.delete(attitudeScreenshots).where(eq(attitudeScreenshots.id, id));
  return true;
}
