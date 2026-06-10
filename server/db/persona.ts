/**
 * Persona HR sync — persistence layer: sync-run history + learned
 * name aliases, plus the attendance write-back. Mirrors the Studioworks
 * module's architecture (idempotent boot installer, PURE helpers,
 * best-effort writes). Company-wide — no team scoping.
 */
import { eq, desc, sql } from "drizzle-orm";
import {
  personaSyncLogs,
  personaNameAliases,
  type InsertPersonaSyncLog,
  type PersonaSyncLog,
  type PersonaNameAlias,
} from "../../drizzle/schema";
import { getDb } from "./connection";
import { getOrCreateAttendance, updateAttendance } from "./attendance";
import { createLogger } from "../services/logger";

const log = createLogger("DB:Persona");

// ============================================
// SCHEMA (idempotent boot installer)
// ============================================

export async function ensurePersonaSyncSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS \`persona_sync_logs\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`teamId\` int NULL,
      \`triggeredById\` int NULL,
      \`source\` enum('manual','scheduled') NOT NULL DEFAULT 'manual',
      \`month\` int NOT NULL,
      \`year\` int NOT NULL,
      \`status\` enum('success','partial','failed') NOT NULL,
      \`totalWorkers\` int NOT NULL DEFAULT 0,
      \`matched\` int NOT NULL DEFAULT 0,
      \`unmatched\` int NOT NULL DEFAULT 0,
      \`errorMessage\` text NULL,
      \`startedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`completedAt\` timestamp NULL
    )`),
  );
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS \`persona_name_aliases\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`teamId\` int NULL,
      \`personaName\` varchar(255) NOT NULL,
      \`gamePresenterId\` int NOT NULL,
      \`createdById\` int NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
  );
  // Pre-teardown installs created these with teamId NOT NULL — relax it
  // so company-wide rows (teamId NULL) insert cleanly. Best-effort: a
  // fresh CREATE above already has the right shape.
  for (const stmt of [
    "ALTER TABLE `persona_sync_logs` MODIFY `teamId` int NULL",
    "ALTER TABLE `persona_name_aliases` MODIFY `teamId` int NULL",
  ]) {
    try { await db.execute(sql.raw(stmt)); } catch { /* already nullable */ }
  }
  log.info("Persona sync tables ensured");
}

// ============================================
// PURE helpers (unit-tested)
// ============================================

/** Lookup key for an alias: lowercased, whitespace-collapsed, trimmed. */
export function normalizePersonaName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type PersonaSyncDetail = {
  workerName: string;
  matched: boolean;
  error?: string;
};

/** Reduce per-worker details to log counts + an overall status. PURE. */
export function summarizePersonaSync(details: PersonaSyncDetail[]): {
  totalWorkers: number;
  matched: number;
  unmatched: number;
  status: "success" | "partial" | "failed";
} {
  const matched = details.filter(d => d.matched && !d.error).length;
  const unmatched = details.filter(d => !d.matched).length;
  const errors = details.filter(d => !!d.error).length;
  const status = details.length === 0
    ? "failed"
    : unmatched > 0 || errors > 0 ? "partial" : "success";
  return { totalWorkers: details.length, matched, unmatched, status };
}

// ============================================
// Sync logs (history)
// ============================================

/** Persist one sync-run row. Best-effort — never throws. */
export async function recordPersonaSyncLog(row: InsertPersonaSyncLog): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(personaSyncLogs).values(row);
  } catch (err) {
    log.warn(`Could not record persona sync log: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function listPersonaSyncLogs(limit = 20): Promise<PersonaSyncLog[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(personaSyncLogs)
    .orderBy(desc(personaSyncLogs.startedAt))
    .limit(limit);
}

// ============================================
// Name aliases (learned mappings) — company-wide, keyed on the name
// ============================================

export async function listPersonaAliases(): Promise<PersonaNameAlias[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(personaNameAliases).orderBy(personaNameAliases.personaName);
}

/** Resolve a Persona worker name to a GP id via a learned alias, or null. */
export async function resolvePersonaAlias(name: string): Promise<number | null> {
  try {
    const key = normalizePersonaName(name);
    if (!key) return null;
    const all = await listPersonaAliases();
    const hit = all.find(a => normalizePersonaName(a.personaName) === key);
    return hit?.gamePresenterId ?? null;
  } catch {
    return null;
  }
}

/** Learn (or update) a name → GP mapping. Best-effort. */
export async function upsertPersonaAlias(
  name: string,
  gamePresenterId: number,
  createdById: number | null,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const key = normalizePersonaName(name);
    if (!key) return;
    const all = await listPersonaAliases();
    const existing = all.find(a => normalizePersonaName(a.personaName) === key);
    if (existing) {
      if (existing.gamePresenterId === gamePresenterId) return;
      await db.update(personaNameAliases)
        .set({ gamePresenterId, personaName: name.trim() })
        .where(eq(personaNameAliases.id, existing.id));
    } else {
      await db.insert(personaNameAliases)
        .values({ personaName: name.trim(), gamePresenterId, createdById, teamId: null });
    }
  } catch (err) {
    log.warn(`Could not upsert persona alias "${name}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function deletePersonaAlias(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(personaNameAliases).where(eq(personaNameAliases.id, id));
}

// ============================================
// Attendance write-back
// ============================================

/**
 * Write one worker's monthly attendance onto the GP's row. Persona is
 * the HR source of truth, so values OVERWRITE what's stored for the
 * month (manual edits made between syncs are superseded by HR data).
 */
export async function applyPersonaAttendance(
  gpId: number,
  month: number,
  year: number,
  counts: { sickLeaves: number; missedDays: number; lateToWork: number; extraShifts: number },
): Promise<void> {
  const existing = await getOrCreateAttendance(gpId, month, year);
  await updateAttendance(existing.id, {
    sickLeaves: counts.sickLeaves,
    missedDays: counts.missedDays,
    lateToWork: counts.lateToWork,
    extraShifts: counts.extraShifts,
  });
}
