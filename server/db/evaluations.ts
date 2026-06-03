/**
 * Evaluation Database Operations
 * Handles evaluation CRUD, queries, aggregation, and data sheet functions
 */
import { eq, and, or, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { evaluations, InsertEvaluation, Evaluation, gamePresenters } from "../../drizzle/schema";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";
import { computeEvaluationScores, DEFAULT_RUBRIC_V1, type CriterionScores } from "../../shared/scoring";
import { diffEvaluation, recordEvaluationRevision } from "./evaluationHistory";

const log = createLogger("DB:Evaluations");

/**
 * Map the legacy per-criterion columns on an (insert) evaluation row to
 * the rubric's criterion keys, so the scoring engine can derive the
 * appearance / game-performance / total subtotals from one place.
 *
 * The keys here mirror `DEFAULT_RUBRIC_V1`. When the rubric moves into
 * the database (Phase 2) this mapping stays — only the rubric argument
 * to `computeEvaluationScores` changes.
 */
function criterionScoresFromColumns(
  row: Partial<Pick<InsertEvaluation,
    | "hairScore" | "makeupScore" | "outfitScore" | "postureScore"
    | "dealingStyleScore" | "gamePerformanceScore">>,
): CriterionScores {
  return {
    hair: row.hairScore,
    makeup: row.makeupScore,
    outfit: row.outfitScore,
    posture: row.postureScore,
    dealingStyle: row.dealingStyleScore,
    gamePerformance: row.gamePerformanceScore,
  };
}

// ============================================
// CRUD
// ============================================

export async function createEvaluation(data: InsertEvaluation): Promise<Evaluation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Single source of truth: derive appearance / game-performance / total
  // from the per-criterion scores. Previously `totalScore` was left as
  // the (often null) input, forcing callers to patch it with a follow-up
  // UPDATE. We compute it here so every write path is consistent.
  const computed = computeEvaluationScores(criterionScoresFromColumns(data), DEFAULT_RUBRIC_V1);
  // Prefer the derived total. Fall back to an explicitly-supplied total
  // only when no sub-scores were provided (derived === 0) so we never
  // discard a legacy/external "total-only" value.
  const totalScore = computed.totalScore > 0 ? computed.totalScore : (data.totalScore ?? computed.totalScore);
  const result = await db.insert(evaluations).values({
    ...data,
    appearanceScore: computed.appearanceScore,
    gamePerformanceTotalScore: computed.gamePerformanceTotalScore,
    totalScore,
    // Dual-write the forward-looking shape: per-criterion JSON + the
    // rubric version this was scored under (v1 today). Legacy columns
    // above are still written so existing readers keep working.
    scores: computed.perCriterion,
    rubricVersionId: data.rubricVersionId ?? DEFAULT_RUBRIC_V1.rubricVersionId,
  });
  const newEval = await db.select().from(evaluations).where(eq(evaluations.id, Number(result[0].insertId))).limit(1);
  return newEval[0];
}

export async function updateEvaluation(
  id: number,
  data: Partial<InsertEvaluation>,
  meta?: { editedById?: number; reason?: string },
): Promise<Evaluation | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = { ...data };

  // Read the row once — needed both to recompute derived scores and to
  // snapshot the "before" state for the audit trail.
  const currentRows = await db.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
  const current = currentRows.length > 0 ? currentRows[0] : null;

  // If any per-criterion score is part of this update, recompute the
  // appearance / game-performance / total subtotals from the merged
  // (incoming over stored) scores via the single scoring engine.
  const touchesScores =
    data.hairScore !== undefined || data.makeupScore !== undefined ||
    data.outfitScore !== undefined || data.postureScore !== undefined ||
    data.dealingStyleScore !== undefined || data.gamePerformanceScore !== undefined;

  if (touchesScores && current) {
    const merged = criterionScoresFromColumns({
      hairScore: data.hairScore ?? current.hairScore,
      makeupScore: data.makeupScore ?? current.makeupScore,
      outfitScore: data.outfitScore ?? current.outfitScore,
      postureScore: data.postureScore ?? current.postureScore,
      dealingStyleScore: data.dealingStyleScore ?? current.dealingStyleScore,
      gamePerformanceScore: data.gamePerformanceScore ?? current.gamePerformanceScore,
    });
    const computed = computeEvaluationScores(merged, DEFAULT_RUBRIC_V1);
    updateData.appearanceScore = computed.appearanceScore;
    updateData.gamePerformanceTotalScore = computed.gamePerformanceTotalScore;
    updateData.totalScore = computed.totalScore;
    updateData.scores = computed.perCriterion;
  }

  // Audit trail: record what changed (old -> new) before applying it.
  // Best-effort inside recordEvaluationRevision — never blocks the edit.
  if (current) {
    const changedFields = diffEvaluation(current as Record<string, unknown>, updateData);
    if (Object.keys(changedFields).length > 0) {
      await recordEvaluationRevision({
        evaluationId: id,
        editedById: meta?.editedById ?? null,
        reason: meta?.reason ?? null,
        changedFields,
        snapshotBefore: current,
      });
    }
  }

  await db.update(evaluations).set(updateData as Partial<InsertEvaluation>).where(eq(evaluations.id, id));
  const updated = await db.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
  return updated.length > 0 ? updated[0] : null;
}

export async function deleteEvaluation(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(evaluations).where(eq(evaluations.id, id));
  return true;
}

export async function deleteEvaluationsByDateRange(startDate: Date, endDate: Date): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.delete(evaluations).where(and(gte(evaluations.evaluationDate, startDate), lte(evaluations.evaluationDate, endDate)));
  return (result as any)[0]?.affectedRows || 0;
}

export async function deleteEvaluationsByMonth(year: number, month: number): Promise<number> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return await deleteEvaluationsByDateRange(startDate, endDate);
}

export async function deleteEvaluationsByDateRangeAndUser(startDate: Date, endDate: Date, userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.delete(evaluations).where(and(gte(evaluations.evaluationDate, startDate), lte(evaluations.evaluationDate, endDate), or(eq(evaluations.uploadedById, userId), eq(evaluations.userId, userId))));
  return (result as any)[0]?.affectedRows || 0;
}

export async function deleteEvaluationsByMonthAndUser(year: number, month: number, userId: number): Promise<number> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return await deleteEvaluationsByDateRangeAndUser(startDate, endDate, userId);
}

// ============================================
// QUERIES
// ============================================

export async function getEvaluationById(id: number): Promise<Evaluation | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getEvaluationsByGP(gamePresenterId: number): Promise<Evaluation[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(evaluations).where(eq(evaluations.gamePresenterId, gamePresenterId)).orderBy(desc(evaluations.evaluationDate));
}

export async function getEvaluationsByGPAndMonth(gamePresenterId: number, year: number, month: number): Promise<Evaluation[]> {
  const db = await getDb();
  if (!db) return [];
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return await db.select().from(evaluations).where(and(eq(evaluations.gamePresenterId, gamePresenterId), gte(evaluations.evaluationDate, startDate), lte(evaluations.evaluationDate, endDate))).orderBy(evaluations.evaluationDate);
}

export async function getEvaluationsByMonth(year: number, month: number): Promise<Evaluation[]> {
  const db = await getDb();
  if (!db) return [];
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return await db.select().from(evaluations).where(and(gte(evaluations.evaluationDate, startDate), lte(evaluations.evaluationDate, endDate))).orderBy(evaluations.evaluationDate);
}

export async function getEvaluationsByMonthAndUser(year: number, month: number, userId: number): Promise<Evaluation[]> {
  const db = await getDb();
  if (!db) return [];
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return await db.select().from(evaluations).where(and(gte(evaluations.evaluationDate, startDate), lte(evaluations.evaluationDate, endDate), or(eq(evaluations.uploadedById, userId), eq(evaluations.userId, userId)))).orderBy(evaluations.evaluationDate);
}

export async function getAllEvaluations(): Promise<Evaluation[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(evaluations).orderBy(desc(evaluations.createdAt));
}

export async function getAllEvaluationsByUser(userId: number): Promise<Evaluation[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(evaluations).where(eq(evaluations.userId, userId)).orderBy(desc(evaluations.createdAt));
}

export async function getEvaluationWithGP(evaluationId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ evaluation: evaluations, gamePresenter: gamePresenters })
    .from(evaluations)
    .leftJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getEvaluationsWithGP() {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ evaluation: evaluations, gamePresenter: gamePresenters })
    .from(evaluations)
    .leftJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
    .orderBy(desc(evaluations.createdAt));
}

export async function getEvaluationsWithGPByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ evaluation: evaluations, gamePresenter: gamePresenters })
    .from(evaluations)
    .leftJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
    .where(or(eq(evaluations.uploadedById, userId), eq(evaluations.userId, userId)))
    .orderBy(desc(evaluations.createdAt));
}

export async function getEvaluationsByTeam(teamId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ evaluation: evaluations, gamePresenter: gamePresenters })
    .from(evaluations)
    .leftJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
    .where(eq(gamePresenters.teamId, teamId))
    .orderBy(desc(evaluations.createdAt));
}

// ============================================
// AGGREGATION & DATA SHEET
// ============================================

export async function getGPMonthlyStats(teamId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return await db.select({
    gpId: gamePresenters.id,
    gpName: gamePresenters.name,
    evaluationCount: sql<number>`COUNT(${evaluations.id})`,
    avgAppearanceScore: sql<number>`AVG(${evaluations.appearanceScore})`,
    avgGamePerfScore: sql<number>`AVG(${evaluations.gamePerformanceTotalScore})`,
    avgTotalScore: sql<number>`AVG(${evaluations.totalScore})`,
  })
  .from(evaluations)
  .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
  .where(and(eq(gamePresenters.teamId, teamId), gte(evaluations.evaluationDate, startDate), lte(evaluations.evaluationDate, endDate)))
  .groupBy(gamePresenters.id, gamePresenters.name);
}

export async function getGPEvaluationsForDataSheet(teamId: number, year: number, month: number) {
  log.info("getGPEvaluationsForDataSheet", { teamId, year, month });
  const db = await getDb();
  if (!db) { log.info("No database connection"); return []; }
  const startDate = new Date(year, month - 1, 1, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const gps = await db.select({ gpId: gamePresenters.id, gpName: gamePresenters.name })
    .from(gamePresenters)
    .where(eq(gamePresenters.teamId, teamId));

  const gpIds = gps.map(g => g.gpId);
  if (gpIds.length > 0) {
    const allTeamEvals = await db.select({ id: evaluations.id, gpId: evaluations.gamePresenterId, date: evaluations.evaluationDate, appearance: evaluations.appearanceScore, gamePerf: evaluations.gamePerformanceTotalScore })
      .from(evaluations)
      .where(inArray(evaluations.gamePresenterId, gpIds));
    log.debug("All team evaluations (no date filter)", { count: allTeamEvals.length });
  }

  const result = [];
  for (const gp of gps) {
    const gpEvaluations = await db.select({ gamePerformanceScore: evaluations.gamePerformanceTotalScore, appearanceScore: evaluations.appearanceScore, evaluationDate: evaluations.evaluationDate })
      .from(evaluations)
      .where(and(eq(evaluations.gamePresenterId, gp.gpId), gte(evaluations.evaluationDate, startDate), lte(evaluations.evaluationDate, endDate)))
      .orderBy(evaluations.evaluationDate);
    result.push({ gpId: gp.gpId, gpName: gp.gpName, evaluations: gpEvaluations });
  }

  log.info(`Found ${gps.length} GPs, ${result.filter(r => r.evaluations.length > 0).length} with evaluations`);
  return result;
}

export async function getGpEvaluationsForPortal(gpId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({
    id: evaluations.id, evaluationDate: evaluations.evaluationDate, game: evaluations.game, totalScore: evaluations.totalScore,
    hairScore: evaluations.hairScore, hairMaxScore: evaluations.hairMaxScore, hairComment: evaluations.hairComment,
    makeupScore: evaluations.makeupScore, makeupMaxScore: evaluations.makeupMaxScore, makeupComment: evaluations.makeupComment,
    outfitScore: evaluations.outfitScore, outfitMaxScore: evaluations.outfitMaxScore, outfitComment: evaluations.outfitComment,
    postureScore: evaluations.postureScore, postureMaxScore: evaluations.postureMaxScore, postureComment: evaluations.postureComment,
    dealingStyleScore: evaluations.dealingStyleScore, dealingStyleMaxScore: evaluations.dealingStyleMaxScore, dealingStyleComment: evaluations.dealingStyleComment,
    gamePerformanceScore: evaluations.gamePerformanceScore, gamePerformanceMaxScore: evaluations.gamePerformanceMaxScore, gamePerformanceComment: evaluations.gamePerformanceComment,
    appearanceScore: evaluations.appearanceScore, gamePerformanceTotalScore: evaluations.gamePerformanceTotalScore,
    screenshotUrl: evaluations.screenshotUrl, createdAt: evaluations.createdAt,
  }).from(evaluations).where(eq(evaluations.gamePresenterId, gpId)).orderBy(desc(evaluations.evaluationDate));
}
