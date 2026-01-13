import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  gamePresenters, InsertGamePresenter, GamePresenter,
  evaluations, InsertEvaluation, Evaluation,
  reports, InsertReport, Report,
  uploadBatches, InsertUploadBatch, UploadBatch
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================
// USER FUNCTIONS
// ============================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================
// GAME PRESENTER FUNCTIONS
// ============================================

export async function findOrCreateGamePresenter(name: string, teamName?: string): Promise<GamePresenter> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(gamePresenters)
    .where(eq(gamePresenters.name, name))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const result = await db.insert(gamePresenters).values({
    name,
    teamName: teamName || null,
  });

  const newGP = await db.select().from(gamePresenters)
    .where(eq(gamePresenters.id, Number(result[0].insertId)))
    .limit(1);

  return newGP[0];
}

export async function getAllGamePresenters(): Promise<GamePresenter[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(gamePresenters).orderBy(gamePresenters.name);
}

// ============================================
// EVALUATION FUNCTIONS
// ============================================

export async function createEvaluation(data: InsertEvaluation): Promise<Evaluation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(evaluations).values(data);
  
  const newEval = await db.select().from(evaluations)
    .where(eq(evaluations.id, Number(result[0].insertId)))
    .limit(1);

  return newEval[0];
}

export async function getEvaluationsByGP(gamePresenterId: number): Promise<Evaluation[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(evaluations)
    .where(eq(evaluations.gamePresenterId, gamePresenterId))
    .orderBy(desc(evaluations.evaluationDate));
}

export async function getEvaluationsByMonth(year: number, month: number): Promise<Evaluation[]> {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  return await db.select().from(evaluations)
    .where(
      and(
        gte(evaluations.evaluationDate, startDate),
        lte(evaluations.evaluationDate, endDate)
      )
    )
    .orderBy(evaluations.evaluationDate);
}

export async function getAllEvaluations(): Promise<Evaluation[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(evaluations).orderBy(desc(evaluations.createdAt));
}

export async function getEvaluationWithGP(evaluationId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select({
    evaluation: evaluations,
    gamePresenter: gamePresenters,
  })
  .from(evaluations)
  .leftJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
  .where(eq(evaluations.id, evaluationId))
  .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getEvaluationsWithGP() {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    evaluation: evaluations,
    gamePresenter: gamePresenters,
  })
  .from(evaluations)
  .leftJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
  .orderBy(desc(evaluations.createdAt));
}

// ============================================
// REPORT FUNCTIONS
// ============================================

export async function createReport(data: InsertReport): Promise<Report> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(reports).values(data);
  
  const newReport = await db.select().from(reports)
    .where(eq(reports.id, Number(result[0].insertId)))
    .limit(1);

  return newReport[0];
}

export async function updateReport(id: number, data: Partial<InsertReport>): Promise<Report | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(reports).set(data).where(eq(reports.id, id));
  
  const updated = await db.select().from(reports)
    .where(eq(reports.id, id))
    .limit(1);

  return updated.length > 0 ? updated[0] : null;
}

export async function getReportById(id: number): Promise<Report | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(reports)
    .where(eq(reports.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getAllReports(): Promise<Report[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(reports).orderBy(desc(reports.createdAt));
}

export async function getReportByMonthYear(teamName: string, month: string, year: number): Promise<Report | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(reports)
    .where(
      and(
        eq(reports.teamName, teamName),
        eq(reports.reportMonth, month),
        eq(reports.reportYear, year)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

// ============================================
// UPLOAD BATCH FUNCTIONS
// ============================================

export async function createUploadBatch(data: InsertUploadBatch): Promise<UploadBatch> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(uploadBatches).values(data);
  
  const newBatch = await db.select().from(uploadBatches)
    .where(eq(uploadBatches.id, Number(result[0].insertId)))
    .limit(1);

  return newBatch[0];
}

export async function updateUploadBatch(id: number, data: Partial<InsertUploadBatch>): Promise<UploadBatch | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(uploadBatches).set(data).where(eq(uploadBatches.id, id));
  
  const updated = await db.select().from(uploadBatches)
    .where(eq(uploadBatches.id, id))
    .limit(1);

  return updated.length > 0 ? updated[0] : null;
}

// ============================================
// AGGREGATION FUNCTIONS
// ============================================

export async function getGPMonthlyStats(year: number, month: number) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const result = await db.select({
    gpId: gamePresenters.id,
    gpName: gamePresenters.name,
    teamName: gamePresenters.teamName,
    evaluationCount: sql<number>`COUNT(${evaluations.id})`,
    avgTotalScore: sql<number>`AVG(${evaluations.totalScore})`,
    avgHairScore: sql<number>`AVG(${evaluations.hairScore})`,
    avgMakeupScore: sql<number>`AVG(${evaluations.makeupScore})`,
    avgOutfitScore: sql<number>`AVG(${evaluations.outfitScore})`,
    avgPostureScore: sql<number>`AVG(${evaluations.postureScore})`,
    avgDealingStyleScore: sql<number>`AVG(${evaluations.dealingStyleScore})`,
    avgGamePerformanceScore: sql<number>`AVG(${evaluations.gamePerformanceScore})`,
  })
  .from(evaluations)
  .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
  .where(
    and(
      gte(evaluations.evaluationDate, startDate),
      lte(evaluations.evaluationDate, endDate)
    )
  )
  .groupBy(gamePresenters.id, gamePresenters.name, gamePresenters.teamName);

  return result;
}
