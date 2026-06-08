/**
 * Studioworks sync — persistence layer for the "advanced sync" features:
 *   - sync run history  (studioworks_sync_logs)
 *   - learned name aliases (studioworks_name_aliases)
 *
 * Co-locates the idempotent boot-time table creation, the pure helpers
 * (name normalization + run summarization, both unit-tested), and the
 * read/write functions. Writes are best-effort: a failure to record a log
 * or learn an alias must never break the surrounding import.
 */
import { eq, desc, sql } from "drizzle-orm";
import {
  studioworksSyncLogs,
  studioworksNameAliases,
  type InsertStudioworksSyncLog,
  type StudioworksSyncLog,
  type StudioworksNameAlias,
} from "../../drizzle/schema";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";

const log = createLogger("DB:Studioworks");

// ============================================
// SCHEMA (idempotent boot installer)
// ============================================

export async function ensureStudioworksSyncSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS \`studioworks_sync_logs\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`triggeredById\` int NULL,
      \`trigger\` enum('manual','import','scheduled') NOT NULL DEFAULT 'manual',
      \`dataSource\` enum('json','html','excel','browser','none') NOT NULL DEFAULT 'none',
      \`status\` enum('success','partial','failed') NOT NULL,
      \`totalFound\` int NOT NULL DEFAULT 0,
      \`inserted\` int NOT NULL DEFAULT 0,
      \`updated\` int NOT NULL DEFAULT 0,
      \`skipped\` int NOT NULL DEFAULT 0,
      \`unmatched\` int NOT NULL DEFAULT 0,
      \`errors\` int NOT NULL DEFAULT 0,
      \`durationMs\` int NULL,
      \`errorMessage\` text NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY \`idx_sw_sync_logs_created\` (\`createdAt\`)
    )`),
  );
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS \`studioworks_name_aliases\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`normalizedName\` varchar(255) NOT NULL,
      \`displayName\` varchar(255) NOT NULL,
      \`gamePresenterId\` int NOT NULL,
      \`createdById\` int NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY \`uq_sw_alias_name\` (\`normalizedName\`)
    )`),
  );
  log.info("Studioworks sync tables ensured");
}

// ============================================
// PURE helpers (unit-tested)
// ============================================

/** Lookup key for an alias: lowercased, whitespace-collapsed, trimmed. */
export function normalizeStudioworksName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type SummarizableDetail = {
  matched: boolean;
  skippedExisting?: boolean;
  updated?: boolean;
  error?: string;
};

export type ImportCounts = {
  totalFound: number;
  inserted: number;
  updated: number;
  skipped: number;
  unmatched: number;
  errors: number;
  status: "success" | "partial" | "failed";
};

/**
 * Reduce per-row import details to the headline counts + overall status.
 * A row is: inserted (matched, new), updated (matched, changed), skipped
 * (matched, unchanged), unmatched (no GP, not a date error), or errored.
 * Status is failed when nothing was found, partial when anything didn't
 * cleanly land, else success.
 */
export function summarizeImportDetails(details: SummarizableDetail[], totalFound?: number): ImportCounts {
  const inserted = details.filter(d => d.matched && !d.skippedExisting && !d.updated && !d.error).length;
  const updated = details.filter(d => !!d.updated && !d.error).length;
  const skipped = details.filter(d => !!d.skippedExisting && !d.error).length;
  const unmatched = details.filter(d => !d.matched && !d.error?.includes("date")).length;
  const errors = details.filter(d => !!d.error).length;
  const total = totalFound ?? details.length;
  const status: ImportCounts["status"] =
    total === 0 ? "failed" : unmatched > 0 || errors > 0 ? "partial" : "success";
  return { totalFound: total, inserted, updated, skipped, unmatched, errors, status };
}

// ============================================
// Sync logs (history)
// ============================================

/** Persist one sync-run row. Best-effort — never throws. */
export async function recordStudioworksSyncLog(row: InsertStudioworksSyncLog): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(studioworksSyncLogs).values(row);
  } catch (err) {
    log.warn(`Could not record studioworks sync log: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function listStudioworksSyncLogs(limit = 20): Promise<StudioworksSyncLog[]> {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(studioworksSyncLogs)
    .orderBy(desc(studioworksSyncLogs.createdAt))
    .limit(limit);
}

// ============================================
// Name aliases (learned mappings)
// ============================================

/** Resolve a Studioworks name to a GP id via a learned alias, or null. */
export async function resolveStudioworksAlias(name: string): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const key = normalizeStudioworksName(name);
    if (!key) return null;
    const rows = await db
      .select()
      .from(studioworksNameAliases)
      .where(eq(studioworksNameAliases.normalizedName, key))
      .limit(1);
    return rows[0]?.gamePresenterId ?? null;
  } catch (err) {
    log.warn(`Alias resolve failed for "${name}": ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function listStudioworksAliases(): Promise<StudioworksNameAlias[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(studioworksNameAliases).orderBy(studioworksNameAliases.displayName);
}

/**
 * Learn (or update) a name → GP mapping. Best-effort so a failed write
 * can't break the import that triggered it. Keyed by normalized name.
 */
export async function upsertStudioworksAlias(
  name: string,
  gamePresenterId: number,
  createdById: number | null,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const normalizedName = normalizeStudioworksName(name);
    if (!normalizedName) return;
    const existing = await db
      .select()
      .from(studioworksNameAliases)
      .where(eq(studioworksNameAliases.normalizedName, normalizedName))
      .limit(1);
    if (existing[0]) {
      if (existing[0].gamePresenterId === gamePresenterId) return; // already learned
      await db
        .update(studioworksNameAliases)
        .set({ gamePresenterId, displayName: name.trim() })
        .where(eq(studioworksNameAliases.id, existing[0].id));
    } else {
      await db
        .insert(studioworksNameAliases)
        .values({ normalizedName, displayName: name.trim(), gamePresenterId, createdById });
    }
  } catch (err) {
    log.warn(`Could not upsert studioworks alias "${name}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function deleteStudioworksAlias(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(studioworksNameAliases).where(eq(studioworksNameAliases.id, id));
}
