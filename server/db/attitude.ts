/**
 * Attitude derivation (hybrid model).
 *
 * `monthlyGpStats.attitude` is, by default, a DERIVED cache: the net sum
 * of +1/-1 attitude-screenshot events for a GP in a month. It is
 * recomputed from the screenshots whenever they change (upload OR delete)
 * — fixing the old "blind increment" that drifted when a screenshot was
 * removed or a batch re-uploaded.
 *
 * An FM can still pin a manual value (bulkSetAttitude / a manual stats
 * edit), which sets `attitudeIsManual = 1`; while that flag is set the
 * derivation skips the row so the manual number is never clobbered.
 * `clearAttitudeOverride` drops the flag and re-derives.
 *
 * Lives in its own module (imports only schema + getOrCreate) so the
 * screenshot delete path and the screenshot router can both call it
 * without an import cycle through screenshots.ts.
 */
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { attitudeScreenshots, monthlyGpStats } from "../../drizzle/schema";
import { getDb } from "./connection";
import { getOrCreateMonthlyGpStats } from "./monthlyStats";
import { monthRange } from "./_dateRange";
import { addColumnIfMissing } from "./_schemaUtils";
import { createLogger } from "../services/logger";

const log = createLogger("DB:Attitude");

/** Idempotent boot install of the attitudeIsManual column. */
export async function ensureAttitudeManualColumn(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await addColumnIfMissing(
    db,
    "ALTER TABLE `monthly_gp_stats` ADD COLUMN `attitudeIsManual` int NULL DEFAULT 0",
    "monthly_gp_stats.attitudeIsManual",
  );
}

/**
 * Recompute a GP's monthly attitude from its screenshots, unless the row
 * is a manual override. Uses the same effective-date window
 * (COALESCE(evaluationDate, createdAt)) the rest of the app filters by,
 * so entries dated into a different month land in the right bucket.
 */
export async function recomputeGPAttitudeFromScreenshots(
  gpId: number,
  month: number,
  year: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const stats = await getOrCreateMonthlyGpStats(gpId, month, year);
  if (stats.attitudeIsManual === 1) return; // manual override — leave it alone

  const { start, endExclusive } = monthRange(month, year);
  const effective = sql`COALESCE(${attitudeScreenshots.evaluationDate}, ${attitudeScreenshots.createdAt})`;
  const rows = await db
    .select({ score: attitudeScreenshots.attitudeScore })
    .from(attitudeScreenshots)
    .where(and(eq(attitudeScreenshots.gamePresenterId, gpId), gte(effective, start), lt(effective, endExclusive)));
  const total = rows.reduce((s, r) => s + (r.score ?? 0), 0);

  await db.update(monthlyGpStats).set({ attitude: total }).where(eq(monthlyGpStats.id, stats.id));
  log.debug("Recomputed attitude from screenshots", { gpId, month, year, total });
}

/** Drop a manual override and re-derive attitude from screenshots. */
export async function clearAttitudeOverride(gpId: number, month: number, year: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const stats = await getOrCreateMonthlyGpStats(gpId, month, year);
  await db.update(monthlyGpStats).set({ attitudeIsManual: 0 }).where(eq(monthlyGpStats.id, stats.id));
  await recomputeGPAttitudeFromScreenshots(gpId, month, year);
}
