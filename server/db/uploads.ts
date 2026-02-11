/**
 * Upload Batch & Sanitization Database Operations
 */
import { eq } from "drizzle-orm";
import { uploadBatches, InsertUploadBatch, UploadBatch } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createUploadBatch(data: InsertUploadBatch): Promise<UploadBatch> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(uploadBatches).values(data);
  const newBatch = await db.select().from(uploadBatches).where(eq(uploadBatches.id, Number(result[0].insertId))).limit(1);
  return newBatch[0];
}

export async function updateUploadBatch(id: number, data: Partial<InsertUploadBatch>): Promise<UploadBatch | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(uploadBatches).set(data).where(eq(uploadBatches.id, id));
  const updated = await db.select().from(uploadBatches).where(eq(uploadBatches.id, id)).limit(1);
  return updated.length > 0 ? updated[0] : null;
}

// ============================================
// INPUT SANITIZATION HELPERS
// ============================================

export function sanitizeString(input: string | null | undefined, maxLength: number = 1000): string {
  if (!input) return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .substring(0, maxLength);
}

export function sanitizeNumber(input: any, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
  const num = Number(input);
  if (isNaN(num)) return min;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 320;
}

export function validateDateRange(startDate: Date, endDate: Date, maxDays: number = 365): boolean {
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= maxDays;
}
