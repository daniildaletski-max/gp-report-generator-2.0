import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, User,
  gamePresenters, InsertGamePresenter, GamePresenter,
  evaluations, InsertEvaluation, Evaluation,
  reports, InsertReport, Report,
  uploadBatches, InsertUploadBatch, UploadBatch,
  fmTeams, InsertFmTeam, FmTeam,
  gpMonthlyAttendance, InsertGpMonthlyAttendance, GpMonthlyAttendance,
  errorFiles, InsertErrorFile, ErrorFile,
  gpErrors, InsertGpError, GpError,
  gpAccessTokens, InsertGpAccessToken, GpAccessToken,
  monthlyGpStats, InsertMonthlyGpStats, MonthlyGpStats
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

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    user: users,
    team: fmTeams,
  })
  .from(users)
  .leftJoin(fmTeams, eq(users.teamId, fmTeams.id))
  .orderBy(users.name);
}

// ============================================
// FM TEAMS FUNCTIONS
// ============================================

export async function getAllFmTeams(): Promise<FmTeam[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(fmTeams).orderBy(fmTeams.teamName);
}

export async function getFmTeamById(id: number): Promise<FmTeam | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(fmTeams).where(eq(fmTeams.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createFmTeam(data: InsertFmTeam): Promise<FmTeam> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(fmTeams).values(data);
  const newTeam = await db.select().from(fmTeams).where(eq(fmTeams.id, Number(result[0].insertId))).limit(1);
  return newTeam[0];
}

export async function initializeDefaultTeams(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const defaultTeams = [
    { teamName: "Team Omnicron", floorManagerName: "Andri Saaret" },
    { teamName: "Team Alpha", floorManagerName: "Kristina Bobrovskaja" },
    { teamName: "Team Zeta", floorManagerName: "Alissa Gujevskaja" },
  ];

  for (const team of defaultTeams) {
    const existing = await db.select().from(fmTeams).where(eq(fmTeams.teamName, team.teamName)).limit(1);
    if (existing.length === 0) {
      await db.insert(fmTeams).values(team);
    }
  }
}

// ============================================
// GAME PRESENTER FUNCTIONS
// ============================================

export async function findOrCreateGamePresenter(name: string, teamId?: number): Promise<GamePresenter> {
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
    teamId: teamId || null,
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

export async function getGamePresentersByTeam(teamId: number): Promise<GamePresenter[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(gamePresenters).where(eq(gamePresenters.teamId, teamId)).orderBy(gamePresenters.name);
}

export async function getGamePresenterById(id: number): Promise<GamePresenter | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(gamePresenters).where(eq(gamePresenters.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateGamePresenterTeam(gpId: number, teamId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(gamePresenters).set({ teamId }).where(eq(gamePresenters.id, gpId));
}

export async function deleteGamePresenter(gpId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Delete related records first (cascade)
  await db.delete(evaluations).where(eq(evaluations.gamePresenterId, gpId));
  await db.delete(gpAccessTokens).where(eq(gpAccessTokens.gamePresenterId, gpId));
  
  // Delete the GP
  await db.delete(gamePresenters).where(eq(gamePresenters.id, gpId));
  
  return true;
}

// ============================================
// EVALUATION FUNCTIONS
// ============================================

export async function createEvaluation(data: InsertEvaluation): Promise<Evaluation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Calculate composite scores
  const appearanceScore = (data.hairScore || 0) + (data.makeupScore || 0) + (data.outfitScore || 0) + (data.postureScore || 0);
  const gamePerformanceTotalScore = (data.dealingStyleScore || 0) + (data.gamePerformanceScore || 0);

  const result = await db.insert(evaluations).values({
    ...data,
    appearanceScore,
    gamePerformanceTotalScore,
  });
  
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

export async function getEvaluationsByTeam(teamId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    evaluation: evaluations,
    gamePresenter: gamePresenters,
  })
  .from(evaluations)
  .leftJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
  .where(eq(gamePresenters.teamId, teamId))
  .orderBy(desc(evaluations.createdAt));
}

// ============================================
// GP MONTHLY ATTENDANCE FUNCTIONS
// ============================================

export async function getOrCreateAttendance(gpId: number, month: number, year: number): Promise<GpMonthlyAttendance> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(gpMonthlyAttendance)
    .where(and(
      eq(gpMonthlyAttendance.gamePresenterId, gpId),
      eq(gpMonthlyAttendance.month, month),
      eq(gpMonthlyAttendance.year, year)
    ))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const result = await db.insert(gpMonthlyAttendance).values({
    gamePresenterId: gpId,
    month,
    year,
    mistakes: 0,
    extraShifts: 0,
    lateToWork: 0,
    missedDays: 0,
    sickLeaves: 0,
  });

  const newRecord = await db.select().from(gpMonthlyAttendance)
    .where(eq(gpMonthlyAttendance.id, Number(result[0].insertId)))
    .limit(1);

  return newRecord[0];
}

export async function updateAttendance(id: number, data: Partial<InsertGpMonthlyAttendance>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(gpMonthlyAttendance).set(data).where(eq(gpMonthlyAttendance.id, id));
}

export async function getAttendanceByTeamMonth(teamId: number, month: number, year: number) {
  const db = await getDb();
  if (!db) return [];

  // Get attendance data
  const attendanceData = await db.select({
    attendance: gpMonthlyAttendance,
    gamePresenter: gamePresenters,
  })
  .from(gpMonthlyAttendance)
  .innerJoin(gamePresenters, eq(gpMonthlyAttendance.gamePresenterId, gamePresenters.id))
  .where(and(
    eq(gamePresenters.teamId, teamId),
    eq(gpMonthlyAttendance.month, month),
    eq(gpMonthlyAttendance.year, year)
  ));

  // Get monthly stats (attitude, mistakes from monthly_gp_stats)
  const statsData = await db.select({
    stats: monthlyGpStats,
    gamePresenter: gamePresenters,
  })
  .from(monthlyGpStats)
  .innerJoin(gamePresenters, eq(monthlyGpStats.gamePresenterId, gamePresenters.id))
  .where(and(
    eq(gamePresenters.teamId, teamId),
    eq(monthlyGpStats.month, month),
    eq(monthlyGpStats.year, year)
  ));

  // Merge stats into attendance data
  return attendanceData.map(item => {
    const gpStats = statsData.find(s => s.gamePresenter.id === item.gamePresenter.id);
    return {
      ...item,
      monthlyStats: gpStats?.stats || null,
    };
  });
}

// ============================================
// ERROR FILES FUNCTIONS
// ============================================

export async function createErrorFile(data: InsertErrorFile): Promise<ErrorFile> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(errorFiles).values(data);
  const newFile = await db.select().from(errorFiles)
    .where(eq(errorFiles.id, Number(result[0].insertId)))
    .limit(1);

  return newFile[0];
}

export async function getAllErrorFiles(): Promise<ErrorFile[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(errorFiles).orderBy(desc(errorFiles.createdAt));
}

export async function deleteErrorFile(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(errorFiles).where(eq(errorFiles.id, id));
}

// ============================================
// GP ERRORS FUNCTIONS
// ============================================

export async function createGpError(data: InsertGpError): Promise<GpError> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(gpErrors).values(data);
  const newError = await db.select().from(gpErrors)
    .where(eq(gpErrors.id, Number(result[0].insertId)))
    .limit(1);

  return newError[0];
}

export async function getErrorCountByGP(month: number, year: number) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  return await db.select({
    gpName: gpErrors.gpName,
    errorCount: sql<number>`COUNT(${gpErrors.id})`,
  })
  .from(gpErrors)
  .where(and(
    gte(gpErrors.errorDate, startDate),
    lte(gpErrors.errorDate, endDate)
  ))
  .groupBy(gpErrors.gpName);
}

export async function updateGPMistakesFromErrors(month: number, year: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const errorCounts = await getErrorCountByGP(month, year);
  
  for (const { gpName, errorCount } of errorCounts) {
    // Find GP by name
    const gp = await db.select().from(gamePresenters).where(eq(gamePresenters.name, gpName)).limit(1);
    if (gp.length > 0) {
      // Update attendance table (legacy)
      const attendance = await getOrCreateAttendance(gp[0].id, month, year);
      await updateAttendance(attendance.id, { mistakes: errorCount });
      
      // Also update monthly_gp_stats table (new)
      const stats = await getOrCreateMonthlyGpStats(gp[0].id, month, year);
      await db.update(monthlyGpStats)
        .set({ mistakes: errorCount })
        .where(eq(monthlyGpStats.id, stats.id));
    }
  }
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

export async function getReportWithTeam(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select({
    report: reports,
    team: fmTeams,
  })
  .from(reports)
  .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
  .where(eq(reports.id, id))
  .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getAllReports(): Promise<Report[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(reports).orderBy(desc(reports.createdAt));
}

export async function getReportsWithTeams() {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    report: reports,
    team: fmTeams,
  })
  .from(reports)
  .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
  .orderBy(desc(reports.createdAt));
}

export async function getReportsByTeam(teamId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    report: reports,
    team: fmTeams,
  })
  .from(reports)
  .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
  .where(eq(reports.teamId, teamId))
  .orderBy(desc(reports.createdAt));
}

export async function getReportByTeamMonthYear(teamId: number, month: number, year: number): Promise<Report | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(reports)
    .where(
      and(
        eq(reports.teamId, teamId),
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

export async function getGPMonthlyStats(teamId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const result = await db.select({
    gpId: gamePresenters.id,
    gpName: gamePresenters.name,
    evaluationCount: sql<number>`COUNT(${evaluations.id})`,
    avgAppearanceScore: sql<number>`AVG(${evaluations.appearanceScore})`,
    avgGamePerfScore: sql<number>`AVG(${evaluations.gamePerformanceTotalScore})`,
    avgTotalScore: sql<number>`AVG(${evaluations.totalScore})`,
  })
  .from(evaluations)
  .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
  .where(
    and(
      eq(gamePresenters.teamId, teamId),
      gte(evaluations.evaluationDate, startDate),
      lte(evaluations.evaluationDate, endDate)
    )
  )
  .groupBy(gamePresenters.id, gamePresenters.name);

  return result;
}

export async function getDashboardStats(month?: number, year?: number) {
  const db = await getDb();
  if (!db) return { 
    totalGPs: 0, 
    totalEvaluations: 0, 
    totalReports: 0, 
    thisMonthGPs: 0,
    gpStats: [],
    recentEvaluations: [] 
  };

  const [gpCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters);
  const [evalCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(evaluations);
  const [reportCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(reports);

  // Use current month/year if not provided
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  // Count unique GPs evaluated this month
  const thisMonthGPsResult = await db.select({
    count: sql<number>`COUNT(DISTINCT gamePresenterId)`,
  })
  .from(evaluations)
  .where(and(
    sql`MONTH(evaluationDate) = ${targetMonth}`,
    sql`YEAR(evaluationDate) = ${targetYear}`
  ));
  const thisMonthGPs = thisMonthGPsResult[0]?.count || 0;

  // Get detailed stats per GP for the selected month
  const gpStatsRaw = await db.select({
    gpId: gamePresenters.id,
    gpName: gamePresenters.name,
    evalCount: sql<number>`COUNT(*)`,
    avgTotal: sql<number>`AVG(${evaluations.totalScore})`,
    avgHair: sql<number>`AVG(${evaluations.hairScore})`,
    avgMakeup: sql<number>`AVG(${evaluations.makeupScore})`,
    avgOutfit: sql<number>`AVG(${evaluations.outfitScore})`,
    avgPosture: sql<number>`AVG(${evaluations.postureScore})`,
    avgDealing: sql<number>`AVG(${evaluations.dealingStyleScore})`,
    avgGamePerf: sql<number>`AVG(${evaluations.gamePerformanceScore})`,
  })
  .from(evaluations)
  .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
  .where(and(
    sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`,
    sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`
  ))
  .groupBy(gamePresenters.id, gamePresenters.name)
  .orderBy(gamePresenters.name);

  const gpStats = gpStatsRaw.map(gp => ({
    gpId: gp.gpId,
    gpName: gp.gpName,
    evalCount: gp.evalCount,
    avgTotal: gp.avgTotal ? Number(gp.avgTotal).toFixed(1) : "0.0",
    avgHair: gp.avgHair ? Number(gp.avgHair).toFixed(1) : "0.0",
    avgMakeup: gp.avgMakeup ? Number(gp.avgMakeup).toFixed(1) : "0.0",
    avgOutfit: gp.avgOutfit ? Number(gp.avgOutfit).toFixed(1) : "0.0",
    avgPosture: gp.avgPosture ? Number(gp.avgPosture).toFixed(1) : "0.0",
    avgDealing: gp.avgDealing ? Number(gp.avgDealing).toFixed(1) : "0.0",
    avgGamePerf: gp.avgGamePerf ? Number(gp.avgGamePerf).toFixed(1) : "0.0",
    // Calculate appearance (Hair + Makeup + Outfit + Posture) / 4 * 3 to normalize to ~12 max
    avgAppearance: gp.avgHair && gp.avgMakeup && gp.avgOutfit && gp.avgPosture 
      ? ((Number(gp.avgHair) + Number(gp.avgMakeup) + Number(gp.avgOutfit) + Number(gp.avgPosture))).toFixed(1)
      : "0.0",
    // Performance is Dealing + Game Perf
    avgPerformance: gp.avgDealing && gp.avgGamePerf
      ? (Number(gp.avgDealing) + Number(gp.avgGamePerf)).toFixed(1)
      : "0.0",
  }));

  return {
    totalGPs: gpCount.count,
    totalEvaluations: evalCount.count,
    totalReports: reportCount.count,
    thisMonthGPs,
    gpStats,
    recentEvaluations: [],
    selectedMonth: targetMonth,
    selectedYear: targetYear,
  };
}


// ============================================
// EVALUATION CRUD FUNCTIONS
// ============================================

export async function updateEvaluation(id: number, data: Partial<InsertEvaluation>): Promise<Evaluation | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Recalculate composite scores if individual scores are updated
  const updateData: Record<string, unknown> = { ...data };
  
  if (data.hairScore !== undefined || data.makeupScore !== undefined || 
      data.outfitScore !== undefined || data.postureScore !== undefined) {
    // Get current values to calculate new appearance score
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

  // Recalculate total score
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

  const result = await db.delete(evaluations).where(
    and(
      gte(evaluations.evaluationDate, startDate),
      lte(evaluations.evaluationDate, endDate)
    )
  );
  
  return (result as any)[0]?.affectedRows || 0;
}

export async function deleteEvaluationsByMonth(year: number, month: number): Promise<number> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return await deleteEvaluationsByDateRange(startDate, endDate);
}

export async function getEvaluationById(id: number): Promise<Evaluation | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}


// ============================================
// DATA SHEET FUNCTIONS
// ============================================

export async function getGPEvaluationsForDataSheet(teamId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  // Get all GPs in the team with their evaluations for the month
  const gps = await db.select({
    gpId: gamePresenters.id,
    gpName: gamePresenters.name,
  })
  .from(gamePresenters)
  .where(eq(gamePresenters.teamId, teamId));

  const result = [];

  for (const gp of gps) {
    // Get all evaluations for this GP in the month
    const gpEvaluations = await db.select({
      gamePerformanceScore: evaluations.gamePerformanceTotalScore,
      appearanceScore: evaluations.appearanceScore,
      evaluationDate: evaluations.evaluationDate,
    })
    .from(evaluations)
    .where(
      and(
        eq(evaluations.gamePresenterId, gp.gpId),
        gte(evaluations.evaluationDate, startDate),
        lte(evaluations.evaluationDate, endDate)
      )
    )
    .orderBy(evaluations.evaluationDate);

    result.push({
      gpId: gp.gpId,
      gpName: gp.gpName,
      evaluations: gpEvaluations,
    });
  }

  return result;
}


// ============================================
// GP ACCESS TOKEN FUNCTIONS
// ============================================

export async function createGpAccessToken(data: InsertGpAccessToken): Promise<GpAccessToken> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(gpAccessTokens).values(data);
  
  const newToken = await db.select().from(gpAccessTokens)
    .where(eq(gpAccessTokens.id, Number(result[0].insertId)))
    .limit(1);

  return newToken[0];
}

export async function getGpAccessTokenByToken(token: string): Promise<GpAccessToken | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(gpAccessTokens)
    .where(and(
      eq(gpAccessTokens.token, token),
      eq(gpAccessTokens.isActive, 1)
    ))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getGpAccessTokenByGpId(gpId: number): Promise<GpAccessToken | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(gpAccessTokens)
    .where(and(
      eq(gpAccessTokens.gamePresenterId, gpId),
      eq(gpAccessTokens.isActive, 1)
    ))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getAllGpAccessTokens() {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    token: gpAccessTokens,
    gp: gamePresenters,
  })
  .from(gpAccessTokens)
  .leftJoin(gamePresenters, eq(gpAccessTokens.gamePresenterId, gamePresenters.id))
  .orderBy(desc(gpAccessTokens.createdAt));
}

export async function getGpAccessTokensByTeam(teamId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    token: gpAccessTokens,
    gp: gamePresenters,
  })
  .from(gpAccessTokens)
  .leftJoin(gamePresenters, eq(gpAccessTokens.gamePresenterId, gamePresenters.id))
  .where(eq(gamePresenters.teamId, teamId))
  .orderBy(desc(gpAccessTokens.createdAt));
}

export async function deactivateGpAccessToken(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(gpAccessTokens)
    .set({ isActive: 0 })
    .where(eq(gpAccessTokens.id, id));

  return true;
}

export async function updateGpAccessTokenLastAccess(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(gpAccessTokens)
    .set({ lastAccessedAt: new Date() })
    .where(eq(gpAccessTokens.id, id));
}

export async function getGpEvaluationsForPortal(gpId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    id: evaluations.id,
    evaluationDate: evaluations.evaluationDate,
    evaluatorName: evaluations.evaluatorName,
    game: evaluations.game,
    totalScore: evaluations.totalScore,
    hairScore: evaluations.hairScore,
    hairMaxScore: evaluations.hairMaxScore,
    hairComment: evaluations.hairComment,
    makeupScore: evaluations.makeupScore,
    makeupMaxScore: evaluations.makeupMaxScore,
    makeupComment: evaluations.makeupComment,
    outfitScore: evaluations.outfitScore,
    outfitMaxScore: evaluations.outfitMaxScore,
    outfitComment: evaluations.outfitComment,
    postureScore: evaluations.postureScore,
    postureMaxScore: evaluations.postureMaxScore,
    postureComment: evaluations.postureComment,
    dealingStyleScore: evaluations.dealingStyleScore,
    dealingStyleMaxScore: evaluations.dealingStyleMaxScore,
    dealingStyleComment: evaluations.dealingStyleComment,
    gamePerformanceScore: evaluations.gamePerformanceScore,
    gamePerformanceMaxScore: evaluations.gamePerformanceMaxScore,
    gamePerformanceComment: evaluations.gamePerformanceComment,
    appearanceScore: evaluations.appearanceScore,
    gamePerformanceTotalScore: evaluations.gamePerformanceTotalScore,
    screenshotUrl: evaluations.screenshotUrl,
    createdAt: evaluations.createdAt,
  })
  .from(evaluations)
  .where(eq(evaluations.gamePresenterId, gpId))
  .orderBy(desc(evaluations.evaluationDate));
}


// ============================================
// MONTHLY GP STATS FUNCTIONS (Attitude & Mistakes)
// ============================================

export async function getOrCreateMonthlyGpStats(gpId: number, month: number, year: number): Promise<MonthlyGpStats> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(monthlyGpStats)
    .where(and(
      eq(monthlyGpStats.gamePresenterId, gpId),
      eq(monthlyGpStats.month, month),
      eq(monthlyGpStats.year, year)
    ))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const result = await db.insert(monthlyGpStats).values({
    gamePresenterId: gpId,
    month,
    year,
    attitude: null,
    mistakes: 0,
  });

  const newStats = await db.select().from(monthlyGpStats)
    .where(eq(monthlyGpStats.id, Number(result[0].insertId)))
    .limit(1);

  return newStats[0];
}

export async function updateMonthlyGpStats(
  gpId: number, 
  month: number, 
  year: number, 
  data: { attitude?: number | null; mistakes?: number; notes?: string | null; updatedById?: number }
): Promise<MonthlyGpStats | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get or create the stats record
  const stats = await getOrCreateMonthlyGpStats(gpId, month, year);

  await db.update(monthlyGpStats)
    .set(data)
    .where(eq(monthlyGpStats.id, stats.id));

  const updated = await db.select().from(monthlyGpStats)
    .where(eq(monthlyGpStats.id, stats.id))
    .limit(1);

  return updated.length > 0 ? updated[0] : null;
}

export async function getMonthlyGpStatsByTeam(teamId: number, month: number, year: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    stats: monthlyGpStats,
    gp: gamePresenters,
  })
  .from(monthlyGpStats)
  .innerJoin(gamePresenters, eq(monthlyGpStats.gamePresenterId, gamePresenters.id))
  .where(and(
    eq(gamePresenters.teamId, teamId),
    eq(monthlyGpStats.month, month),
    eq(monthlyGpStats.year, year)
  ));
}

export async function getAllMonthlyGpStats(month: number, year: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    stats: monthlyGpStats,
    gp: gamePresenters,
  })
  .from(monthlyGpStats)
  .innerJoin(gamePresenters, eq(monthlyGpStats.gamePresenterId, gamePresenters.id))
  .where(and(
    eq(monthlyGpStats.month, month),
    eq(monthlyGpStats.year, year)
  ));
}

// ============================================
// USER TEAM FUNCTIONS
// ============================================

export async function updateUserTeam(userId: number, teamId: number | null): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(users)
    .set({ teamId })
    .where(eq(users.id, userId));
}

export async function getUserWithTeam(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select({
    user: users,
    team: fmTeams,
  })
  .from(users)
  .leftJoin(fmTeams, eq(users.teamId, fmTeams.id))
  .where(eq(users.id, userId))
  .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getGamePresentersByTeamWithStats(teamId: number, month: number, year: number) {
  const db = await getDb();
  if (!db) return [];

  const gps = await db.select().from(gamePresenters)
    .where(eq(gamePresenters.teamId, teamId))
    .orderBy(gamePresenters.name);

  // Get stats for each GP
  const result = await Promise.all(gps.map(async (gp) => {
    const statsResult = await db.select().from(monthlyGpStats)
      .where(and(
        eq(monthlyGpStats.gamePresenterId, gp.id),
        eq(monthlyGpStats.month, month),
        eq(monthlyGpStats.year, year)
      ))
      .limit(1);

    return {
      ...gp,
      stats: statsResult.length > 0 ? statsResult[0] : null,
    };
  }));

  return result;
}


// Get monthly stats for a single GP
export async function getMonthlyGpStats(gpId: number, month: number, year: number): Promise<MonthlyGpStats | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(monthlyGpStats)
    .where(and(
      eq(monthlyGpStats.gamePresenterId, gpId),
      eq(monthlyGpStats.month, month),
      eq(monthlyGpStats.year, year)
    ))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}


// ============================================
// GOOGLE SHEETS SYNC FUNCTIONS
// ============================================

export interface GoogleSheetsErrorData {
  gpName: string;
  errorCount: number;
}

export async function syncErrorsFromGoogleSheets(
  errors: GoogleSheetsErrorData[], 
  month: number, 
  year: number
): Promise<{ updated: number; notFound: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let updated = 0;
  const notFound: string[] = [];

  for (const { gpName, errorCount } of errors) {
    // Find GP by name (case-insensitive partial match)
    const gps = await db.select().from(gamePresenters)
      .where(sql`LOWER(${gamePresenters.name}) LIKE LOWER(${'%' + gpName + '%'})`)
      .limit(1);
    
    if (gps.length > 0) {
      const gp = gps[0];
      // Update or create monthly stats
      const stats = await getOrCreateMonthlyGpStats(gp.id, month, year);
      await db.update(monthlyGpStats)
        .set({ mistakes: errorCount })
        .where(eq(monthlyGpStats.id, stats.id));
      updated++;
    } else {
      // Try exact match
      const exactMatch = await db.select().from(gamePresenters)
        .where(eq(gamePresenters.name, gpName))
        .limit(1);
      
      if (exactMatch.length > 0) {
        const gp = exactMatch[0];
        const stats = await getOrCreateMonthlyGpStats(gp.id, month, year);
        await db.update(monthlyGpStats)
          .set({ mistakes: errorCount })
          .where(eq(monthlyGpStats.id, stats.id));
        updated++;
      } else {
        notFound.push(gpName);
      }
    }
  }

  return { updated, notFound };
}
