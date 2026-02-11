/**
 * Evaluation Database Operations
 * Handles evaluation CRUD, queries, aggregation, and data sheet functions
 */
import { eq, and, or, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { evaluations, InsertEvaluation, Evaluation, gamePresenters } from "../../drizzle/schema";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";

const log = createLogger("DB:Evaluations");

// ============================================
// CRUD
// ============================================

export async function createEvaluation(data: InsertEvaluation): Promise<Evaluation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const appearanceScore = (data.hairScore || 0) + (data.makeupScore || 0) + (data.outfitScore || 0) + (data.postureScore || 0);
  const gamePerformanceTotalScore = (data.dealingStyleScore || 0) + (data.gamePerformanceScore || 0);
  const result = await db.insert(evaluations).values({ ...data, appearanceScore, gamePerformanceTotalScore });
  const newEval = await db.select().from(evaluations).where(eq(evaluations.id, Number(result[0].insertId))).limit(1);
  return newEval[0];
}

export async function updateEvaluation(id: number, data: Partial<InsertEvaluation>): Promise<Evaluation | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = { ...data };
  if (data.hairScore !== undefined || data.makeupScore !== undefined || data.outfitScore !== undefined || data.postureScore !== undefined) {
    const current = await db.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
    if (current.length > 0) {
      const hair = data.hairScore ?? current[0].hairScore ?? 0;
      const makeup = data.makeupScore ?? current[0].makeupScore ?? 0;
      const outfit = data.outfitScore ?? current[0].outfitScore ?? 0;
      const posture = data.postureScore ?? current[0].postureScore ?? 0;
      updateData.appearanceScore = hair + makeup + outfit + posture;
    }
  }
  if (data.dealingStyleScore !== undefined || data.gamePerformanceScore !== undefined) {
    const current = await db.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
    if (current.length > 0) {
      const dealing = data.dealingStyleScore ?? current[0].dealingStyleScore ?? 0;
      const gamePerf = data.gamePerformanceScore ?? current[0].gamePerformanceScore ?? 0;
      updateData.gamePerformanceTotalScore = dealing + gamePerf;
    }
  }
  if (updateData.appearanceScore !== undefined || updateData.gamePerformanceTotalScore !== undefined) {
    const current = await db.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
    if (current.length > 0) {
      const appearance = (updateData.appearanceScore as number) ?? current[0].appearanceScore ?? 0;
      const gamePerf = (updateData.gamePerformanceTotalScore as number) ?? current[0].gamePerformanceTotalScore ?? 0;
      updateData.totalScore = appearance + gamePerf;
    }
  }
  await db.update(evaluations).set(updateData as any).where(eq(evaluations.id, id));
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
