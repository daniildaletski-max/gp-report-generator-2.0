/**
 * Rubric read layer — turns the `rubric_versions` + `rubric_criteria`
 * rows into the `RubricVersionDef` value the scoring engine consumes.
 *
 * Everything here degrades gracefully to the code-side `DEFAULT_RUBRIC_V1`
 * so the app keeps scoring even before the boot migration has created /
 * seeded the tables (or if the DB is briefly unavailable). That keeps
 * Phase 2 strictly additive: nothing that reads scores today can break
 * because the rubric tables aren't ready yet.
 */
import { eq, desc } from "drizzle-orm";
import {
  rubricVersions,
  rubricCriteria,
  type RubricVersion,
  type RubricCriterion as RubricCriterionRow,
} from "../../drizzle/schema";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";
import { cache, CacheTTL } from "../services/cache";
import { DEFAULT_RUBRIC_V1, type RubricVersionDef } from "../../shared/scoring";

const log = createLogger("DB:Rubric");

/**
 * Pure: assemble a `RubricVersionDef` from a version row and its criteria
 * rows. Sorted by `sortOrder` so display order is deterministic. Kept
 * separate (and exported) so it can be unit-tested without a database.
 */
export function assembleRubricVersion(
  version: Pick<RubricVersion, "id" | "version" | "label">,
  criteria: Array<
    Pick<RubricCriterionRow, "key" | "label" | "description" | "maxScore" | "group" | "sortOrder">
  >,
): RubricVersionDef {
  return {
    rubricVersionId: version.id,
    version: version.version,
    label: version.label,
    criteria: [...criteria]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        key: c.key,
        label: c.label,
        description: c.description ?? "",
        maxScore: c.maxScore,
        group: c.group,
        sortOrder: c.sortOrder,
      })),
  };
}

/**
 * The rubric version new evaluations should be scored under. Returns the
 * DB's active version, or `DEFAULT_RUBRIC_V1` when the tables aren't
 * ready / empty / unreachable.
 */
export async function getActiveRubricVersion(): Promise<RubricVersionDef> {
  return cache.getOrSet(
    "rubric:active",
    async () => {
      try {
        const db = await getDb();
        if (!db) return DEFAULT_RUBRIC_V1;
        const versions = await db
          .select()
          .from(rubricVersions)
          .where(eq(rubricVersions.isActive, 1))
          .orderBy(desc(rubricVersions.version))
          .limit(1);
        if (versions.length === 0) return DEFAULT_RUBRIC_V1;
        const criteria = await db
          .select()
          .from(rubricCriteria)
          .where(eq(rubricCriteria.versionId, versions[0].id));
        if (criteria.length === 0) return DEFAULT_RUBRIC_V1;
        return assembleRubricVersion(versions[0], criteria);
      } catch (err) {
        // Tables may not exist yet (pre-migration) — fall back silently.
        log.debug("getActiveRubricVersion fell back to DEFAULT_RUBRIC_V1", {
          error: err instanceof Error ? err.message : String(err),
        });
        return DEFAULT_RUBRIC_V1;
      }
    },
    CacheTTL.DEFAULT,
  );
}

/**
 * Look up a specific rubric version by id (the value stored on each
 * evaluation). Falls back to `DEFAULT_RUBRIC_V1` for version 1 so legacy
 * rows always resolve to a usable rubric.
 */
export async function getRubricVersionById(id: number): Promise<RubricVersionDef | null> {
  return cache.getOrSet(
    `rubric:version:${id}`,
    async () => {
      try {
        const db = await getDb();
        if (!db) return id === DEFAULT_RUBRIC_V1.rubricVersionId ? DEFAULT_RUBRIC_V1 : null;
        const versions = await db
          .select()
          .from(rubricVersions)
          .where(eq(rubricVersions.id, id))
          .limit(1);
        if (versions.length === 0) {
          return id === DEFAULT_RUBRIC_V1.rubricVersionId ? DEFAULT_RUBRIC_V1 : null;
        }
        const criteria = await db
          .select()
          .from(rubricCriteria)
          .where(eq(rubricCriteria.versionId, id));
        return assembleRubricVersion(versions[0], criteria);
      } catch {
        return id === DEFAULT_RUBRIC_V1.rubricVersionId ? DEFAULT_RUBRIC_V1 : null;
      }
    },
    CacheTTL.DEFAULT,
  );
}

/** Invalidate cached rubric reads — call after any rubric write (Phase 7). */
export function invalidateRubricCache(): void {
  cache.invalidate("rubric:active");
  cache.invalidateByPrefix("rubric:version:");
}
