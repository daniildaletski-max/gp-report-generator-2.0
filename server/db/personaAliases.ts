/**
 * Persona Name Aliases — persistent map from a Persona-side worker
 * name to a GP, scoped per team.
 *
 * Purpose: short-circuits the fuzzy matcher when a name is a known
 * mismatch (e.g. Persona uses "Lastname Firstname" word order, or HR
 * has the legal name while we have the dealer pseudonym). Once an
 * FM resolves an unmatched Persona name in the Reconcile UI, the
 * alias is saved here and every future sync hits a direct lookup
 * instead of recomputing fuzzy similarity.
 *
 * Lookup is case-insensitive on the persona-side name. Trim
 * defensively at insert time so trailing whitespace from copy-paste
 * doesn't create dupes.
 */
import { and, eq, sql, desc } from "drizzle-orm";
import { personaNameAliases, gamePresenters, type PersonaNameAlias } from "../../drizzle/schema";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";

const log = createLogger("DB:PersonaAliases");

export interface PersonaAliasWithGp {
  id: number;
  teamId: number;
  personaName: string;
  gamePresenterId: number;
  gpName: string | null;
  createdById: number | null;
  createdAt: Date;
}

/**
 * Look up a single alias by team + persona-name (case-insensitive,
 * trimmed). Returns null when none exists.
 */
export async function findAliasForTeam(teamId: number, personaName: string): Promise<PersonaNameAlias | null> {
  const db = await getDb();
  if (!db) return null;
  const trimmed = personaName.trim();
  if (!trimmed) return null;
  // MySQL string compare is case-insensitive by default with utf8mb4
  // collation, but be explicit with LOWER() so a future collation
  // change doesn't silently break the lookup.
  const rows = await db.select().from(personaNameAliases)
    .where(and(
      eq(personaNameAliases.teamId, teamId),
      sql`LOWER(${personaNameAliases.personaName}) = LOWER(${trimmed})`,
    ))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List all aliases for a team — joined with GP name so the UI can
 * render "Persona X → GP Y" without a second round-trip.
 */
export async function listAliasesForTeam(teamId: number): Promise<PersonaAliasWithGp[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: personaNameAliases.id,
      teamId: personaNameAliases.teamId,
      personaName: personaNameAliases.personaName,
      gamePresenterId: personaNameAliases.gamePresenterId,
      gpName: gamePresenters.name,
      createdById: personaNameAliases.createdById,
      createdAt: personaNameAliases.createdAt,
    })
    .from(personaNameAliases)
    .leftJoin(gamePresenters, eq(gamePresenters.id, personaNameAliases.gamePresenterId))
    .where(eq(personaNameAliases.teamId, teamId))
    .orderBy(desc(personaNameAliases.createdAt));
  return rows;
}

/**
 * Upsert an alias. If (teamId, personaName) already exists with a
 * different gpId, we OVERWRITE the gpId — the FM is correcting a
 * stale mapping. Returns the row id.
 */
export async function upsertAlias(opts: {
  teamId: number;
  personaName: string;
  gamePresenterId: number;
  createdById: number | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const trimmed = opts.personaName.trim();
  if (!trimmed) throw new Error("personaName cannot be empty");

  const existing = await findAliasForTeam(opts.teamId, trimmed);
  if (existing) {
    if (existing.gamePresenterId !== opts.gamePresenterId) {
      await db.update(personaNameAliases)
        .set({ gamePresenterId: opts.gamePresenterId, createdById: opts.createdById })
        .where(eq(personaNameAliases.id, existing.id));
      log.info(`Alias updated: team ${opts.teamId} "${trimmed}" -> GP ${opts.gamePresenterId} (was ${existing.gamePresenterId})`);
    }
    return existing.id;
  }
  const result = await db.insert(personaNameAliases).values({
    teamId: opts.teamId,
    personaName: trimmed,
    gamePresenterId: opts.gamePresenterId,
    createdById: opts.createdById,
  });
  log.info(`Alias created: team ${opts.teamId} "${trimmed}" -> GP ${opts.gamePresenterId}`);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function deleteAlias(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(personaNameAliases).where(eq(personaNameAliases.id, id));
}

/**
 * Single-row lookup by id. Used by ownership checks before delete.
 */
export async function getAliasById(id: number): Promise<PersonaNameAlias | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(personaNameAliases).where(eq(personaNameAliases.id, id)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Bulk-load every alias for a team into a Map for O(1) lookups
 * during sync. Saves N round-trips when matching N Persona names.
 */
export async function loadAliasMapForTeam(teamId: number): Promise<Map<string, number>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db.select({
    personaName: personaNameAliases.personaName,
    gamePresenterId: personaNameAliases.gamePresenterId,
  }).from(personaNameAliases).where(eq(personaNameAliases.teamId, teamId));
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.personaName.trim().toLowerCase(), r.gamePresenterId);
  }
  return map;
}
