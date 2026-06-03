/**
 * Evaluation edit history — append-only audit trail for evaluation edits.
 *
 * Co-locates the feature: the idempotent boot-time table creation, the
 * pure field-diff used to summarise an edit, and the read/write helpers.
 * Recording is best-effort — if the table somehow isn't there yet, an
 * edit still succeeds (the revision is just skipped and logged) so audit
 * logging can never block a legitimate save.
 */
import { eq, desc, sql } from "drizzle-orm";
import { evaluationRevisions, InsertEvaluationRevision, EvaluationRevision } from "../../drizzle/schema";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";

const log = createLogger("DB:EvaluationHistory");

// ============================================
// SCHEMA (idempotent boot installer)
// ============================================

export async function ensureEvaluationHistorySchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS \`evaluation_revisions\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`evaluationId\` int NOT NULL,
      \`editedById\` int NULL,
      \`reason\` text NULL,
      \`changedFields\` json NULL,
      \`snapshotBefore\` json NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY \`idx_evaluation_revisions_eval\` (\`evaluationId\`)
    )`),
  );
  log.info("Evaluation revisions table ensured");
}

// ============================================
// PURE: field diff
// ============================================

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : new Date(a as string).getTime();
    const tb = b instanceof Date ? b.getTime() : new Date(b as string).getTime();
    return ta === tb;
  }
  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * Compare the fields present in `after` against `before` and return
 * `{ field: { old, new } }` for the ones that changed. Pure; the keys
 * considered are exactly those in `after` (the update payload), so
 * untouched columns never show up as spurious changes.
 */
export function diffEvaluation(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { old: unknown; new: unknown }> {
  const out: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (!valuesEqual(before[key], after[key])) {
      out[key] = { old: before[key] ?? null, new: after[key] ?? null };
    }
  }
  return out;
}

// ============================================
// WRITE / READ
// ============================================

/**
 * Persist one revision row. Best-effort: never throws, so a missing
 * table or transient error can't fail the surrounding evaluation edit.
 */
export async function recordEvaluationRevision(rev: InsertEvaluationRevision): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(evaluationRevisions).values(rev);
  } catch (err) {
    log.warn("Failed to record evaluation revision (non-fatal)", {
      evaluationId: rev.evaluationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Newest-first edit history for one evaluation. */
export async function getEvaluationRevisions(evaluationId: number): Promise<EvaluationRevision[]> {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(evaluationRevisions)
    .where(eq(evaluationRevisions.evaluationId, evaluationId))
    .orderBy(desc(evaluationRevisions.createdAt));
}
