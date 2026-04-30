/**
 * Persona Sync Log — DB operations.
 *
 * Records every scrape attempt so admins can see when each team last
 * got fresh attendance data and why a sync failed if it did.
 */
import { eq, and, desc } from "drizzle-orm";
import {
  personaSyncLogs, InsertPersonaSyncLog, PersonaSyncLog,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createSyncLog(data: InsertPersonaSyncLog): Promise<PersonaSyncLog> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(personaSyncLogs).values(data);
  const row = await db.select().from(personaSyncLogs).where(eq(personaSyncLogs.id, Number(result[0].insertId))).limit(1);
  return row[0];
}

export async function updateSyncLog(id: number, patch: Partial<PersonaSyncLog>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(personaSyncLogs).set(patch).where(eq(personaSyncLogs.id, id));
}

export async function getLastSyncForTeam(teamId: number): Promise<PersonaSyncLog | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(personaSyncLogs)
    .where(eq(personaSyncLogs.teamId, teamId))
    .orderBy(desc(personaSyncLogs.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRecentSyncsForTeam(teamId: number, limit = 10): Promise<PersonaSyncLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(personaSyncLogs)
    .where(eq(personaSyncLogs.teamId, teamId))
    .orderBy(desc(personaSyncLogs.startedAt))
    .limit(limit);
}

export async function getAllRecentSyncs(limit = 50): Promise<PersonaSyncLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(personaSyncLogs)
    .orderBy(desc(personaSyncLogs.startedAt))
    .limit(limit);
}
