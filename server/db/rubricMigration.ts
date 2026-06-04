/**
 * Idempotent, boot-time installer for the versioned-rubric schema.
 *
 * Mirrors the existing `ensureRealNameColumn` / `ensureManagerEmailColumn`
 * pattern: the deploy pipeline doesn't reliably run drizzle migration
 * files, so anything schema.ts adds must also be applied defensively at
 * startup or production queries fail with "Unknown column".
 *
 * This runs the full Phase-2 data move in one safe, re-runnable pass:
 *   1. Create the rubric tables    (CREATE TABLE IF NOT EXISTS).
 *   2. Add evaluations.rubricVersionId / scores (swallow "Duplicate column").
 *   3. Seed rubric v1 from DEFAULT_RUBRIC_V1 (INSERT IGNORE — code & DB
 *      stay in lockstep; version id is pinned to 1).
 *   4. Backfill legacy evaluations: tag them v1 and project their fixed
 *      `<criterion>Score` columns into the new `scores` JSON.
 *
 * Every step is idempotent, so re-running on an already-migrated DB is a
 * no-op. Non-fatal by design — a failure logs and the server still boots.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";
import { addColumnIfMissing } from "./_schemaUtils";
import { DEFAULT_RUBRIC_V1, rubricMaxTotal } from "../../shared/scoring";

const log = createLogger("DB:RubricMigration");

export async function ensureRubricSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // ----------------------------------------------------------------- 1
  // Tables. CREATE TABLE IF NOT EXISTS is natively idempotent.
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS \`rubrics\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`name\` varchar(255) NOT NULL,
      \`isActive\` int NOT NULL DEFAULT 1,
      \`createdById\` int NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`),
  );

  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS \`rubric_versions\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`rubricId\` int NOT NULL,
      \`version\` int NOT NULL,
      \`label\` varchar(255) NOT NULL,
      \`effectiveFrom\` timestamp NULL,
      \`totalMax\` int NOT NULL DEFAULT 0,
      \`isLocked\` int NOT NULL DEFAULT 0,
      \`isActive\` int NOT NULL DEFAULT 0,
      \`createdById\` int NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY \`uk_rubric_versions_rubric_version\` (\`rubricId\`, \`version\`),
      KEY \`idx_rubric_versions_rubric\` (\`rubricId\`)
    )`),
  );

  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS \`rubric_criteria\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`versionId\` int NOT NULL,
      \`criterionKey\` varchar(64) NOT NULL,
      \`label\` varchar(255) NOT NULL,
      \`description\` text NULL,
      \`maxScore\` int NOT NULL,
      \`criterionGroup\` enum('appearance','game') NOT NULL,
      \`sortOrder\` int NOT NULL DEFAULT 0,
      UNIQUE KEY \`uk_rubric_criteria_version_key\` (\`versionId\`, \`criterionKey\`),
      KEY \`idx_rubric_criteria_version\` (\`versionId\`)
    )`),
  );

  // ----------------------------------------------------------------- 2
  // New evaluation columns.
  await addColumnIfMissing(
    db,
    "ALTER TABLE `evaluations` ADD COLUMN `rubricVersionId` int NULL",
    "evaluations.rubricVersionId",
  );
  await addColumnIfMissing(
    db,
    "ALTER TABLE `evaluations` ADD COLUMN `scores` json NULL",
    "evaluations.scores",
  );
  // Quality-review flag (Phase 6a) — set at write time when an evaluation
  // looks suspect, so bad extractions surface in a queue.
  await addColumnIfMissing(
    db,
    "ALTER TABLE `evaluations` ADD COLUMN `needsReview` int NULL DEFAULT 0",
    "evaluations.needsReview",
  );
  await addColumnIfMissing(
    db,
    "ALTER TABLE `evaluations` ADD COLUMN `reviewReason` varchar(512) NULL",
    "evaluations.reviewReason",
  );

  // ----------------------------------------------------------------- 3
  // Seed rubric v1 from the code-side definition so the two never drift.
  // ids are pinned to 1 to satisfy DEFAULT_RUBRIC_V1.rubricVersionId === 1.
  await db.execute(
    sql`INSERT IGNORE INTO \`rubrics\` (\`id\`, \`name\`, \`isActive\`) VALUES (1, 'Default GP Evaluation', 1)`,
  );
  await db.execute(
    sql`INSERT IGNORE INTO \`rubric_versions\`
      (\`id\`, \`rubricId\`, \`version\`, \`label\`, \`totalMax\`, \`isLocked\`, \`isActive\`)
      VALUES (1, 1, 1, ${DEFAULT_RUBRIC_V1.label}, ${rubricMaxTotal(DEFAULT_RUBRIC_V1)}, 1, 1)`,
  );
  for (const c of DEFAULT_RUBRIC_V1.criteria) {
    await db.execute(
      sql`INSERT IGNORE INTO \`rubric_criteria\`
        (\`versionId\`, \`criterionKey\`, \`label\`, \`description\`, \`maxScore\`, \`criterionGroup\`, \`sortOrder\`)
        VALUES (1, ${c.key}, ${c.label}, ${c.description}, ${c.maxScore}, ${c.group}, ${c.sortOrder})`,
    );
  }

  // ----------------------------------------------------------------- 4
  // Backfill historical rows. Both guarded by "IS NULL" so they run once.
  await db.execute(
    sql.raw("UPDATE `evaluations` SET `rubricVersionId` = 1 WHERE `rubricVersionId` IS NULL"),
  );
  await db.execute(
    sql.raw(`UPDATE \`evaluations\` SET \`scores\` = JSON_OBJECT(
      'hair', COALESCE(\`hairScore\`, 0),
      'makeup', COALESCE(\`makeupScore\`, 0),
      'outfit', COALESCE(\`outfitScore\`, 0),
      'posture', COALESCE(\`postureScore\`, 0),
      'dealingStyle', COALESCE(\`dealingStyleScore\`, 0),
      'gamePerformance', COALESCE(\`gamePerformanceScore\`, 0)
    ) WHERE \`scores\` IS NULL`),
  );

  log.info("Rubric schema ensured, v1 seeded, legacy evaluations backfilled");
}
