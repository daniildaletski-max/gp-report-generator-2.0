import { eq, and, or, gte, lte, sql, desc, inArray, isNull } from "drizzle-orm";
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

// Levenshtein distance algorithm for fuzzy string matching
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// Calculate similarity score (0-1, where 1 is exact match)
function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - distance / maxLen;
}

// Normalize name for comparison (remove extra spaces, handle common variations)
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Multiple spaces to single
    .replace(/[''`]/g, "'")  // Normalize apostrophes
    .replace(/[–—]/g, '-');  // Normalize dashes
}

export interface FuzzyMatchResult {
  gamePresenter: GamePresenter;
  similarity: number;
  isExactMatch: boolean;
}

// Find best matching GP using fuzzy search
export async function findBestMatchingGP(name: string, threshold: number = 0.7): Promise<FuzzyMatchResult | null> {
  const db = await getDb();
  if (!db) return null;

  const allGPs = await db.select().from(gamePresenters);
  const normalizedInput = normalizeName(name);

  let bestMatch: FuzzyMatchResult | null = null;

  for (const gp of allGPs) {
    const normalizedGPName = normalizeName(gp.name);
    
    // Check for exact match first
    if (normalizedGPName === normalizedInput) {
      return {
        gamePresenter: gp,
        similarity: 1,
        isExactMatch: true,
      };
    }

    // Calculate fuzzy similarity
    const similarity = calculateSimilarity(normalizedInput, normalizedGPName);
    
    // Also check if one name contains the other (for partial matches)
    const containsMatch = normalizedGPName.includes(normalizedInput) || normalizedInput.includes(normalizedGPName);
    const adjustedSimilarity = containsMatch ? Math.max(similarity, 0.85) : similarity;

    if (adjustedSimilarity >= threshold && (!bestMatch || adjustedSimilarity > bestMatch.similarity)) {
      bestMatch = {
        gamePresenter: gp,
        similarity: adjustedSimilarity,
        isExactMatch: false,
      };
    }
  }

  return bestMatch;
}

// Find all potential matches above threshold
export async function findAllMatchingGPs(name: string, threshold: number = 0.5): Promise<FuzzyMatchResult[]> {
  const db = await getDb();
  if (!db) return [];

  const allGPs = await db.select().from(gamePresenters);
  const normalizedInput = normalizeName(name);
  const matches: FuzzyMatchResult[] = [];

  for (const gp of allGPs) {
    const normalizedGPName = normalizeName(gp.name);
    
    // Check for exact match
    if (normalizedGPName === normalizedInput) {
      matches.push({
        gamePresenter: gp,
        similarity: 1,
        isExactMatch: true,
      });
      continue;
    }

    // Calculate fuzzy similarity
    const similarity = calculateSimilarity(normalizedInput, normalizedGPName);
    
    // Also check if one name contains the other
    const containsMatch = normalizedGPName.includes(normalizedInput) || normalizedInput.includes(normalizedGPName);
    const adjustedSimilarity = containsMatch ? Math.max(similarity, 0.85) : similarity;

    if (adjustedSimilarity >= threshold) {
      matches.push({
        gamePresenter: gp,
        similarity: adjustedSimilarity,
        isExactMatch: false,
      });
    }
  }

  // Sort by similarity descending
  return matches.sort((a, b) => b.similarity - a.similarity);
}

export async function findOrCreateGamePresenter(name: string, teamId?: number, userId?: number): Promise<GamePresenter> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // First try exact match within user's data (if userId provided)
  const conditions = [eq(gamePresenters.name, name)];
  if (userId) {
    conditions.push(eq(gamePresenters.userId, userId));
  }
  
  const existing = await db.select().from(gamePresenters)
    .where(and(...conditions))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Try fuzzy match with high threshold (0.85 = very similar)
  const fuzzyMatch = await findBestMatchingGP(name, 0.85);
  if (fuzzyMatch) {
    console.log(`[Fuzzy Match] "${name}" matched to "${fuzzyMatch.gamePresenter.name}" (similarity: ${(fuzzyMatch.similarity * 100).toFixed(1)}%)`);
    return fuzzyMatch.gamePresenter;
  }

  // No match found, create new GP
  const result = await db.insert(gamePresenters).values({
    name,
    teamId: teamId || null,
    userId: userId || null,
  });

  const newGP = await db.select().from(gamePresenters)
    .where(eq(gamePresenters.id, Number(result[0].insertId)))
    .limit(1);

  console.log(`[New GP] Created new Game Presenter: "${name}"`);
  return newGP[0];
}

export async function getAllGamePresenters(): Promise<GamePresenter[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(gamePresenters).orderBy(gamePresenters.name);
}

export async function getAllGamePresentersByUser(userId: number): Promise<GamePresenter[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(gamePresenters)
    .where(eq(gamePresenters.userId, userId))
    .orderBy(gamePresenters.name);
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

export async function getAllEvaluationsByUser(userId: number): Promise<Evaluation[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(evaluations)
    .where(eq(evaluations.userId, userId))
    .orderBy(desc(evaluations.createdAt));
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

export async function getEvaluationsWithGPByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Filter by uploadedById OR userId for backwards compatibility
  // uploadedById is set during upload, userId is for explicit ownership
  return await db.select({
    evaluation: evaluations,
    gamePresenter: gamePresenters,
  })
  .from(evaluations)
  .leftJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
  .where(
    or(
      eq(evaluations.uploadedById, userId),
      eq(evaluations.userId, userId)
    )
  )
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

  // Get ALL GPs in the team (not just those with attendance records)
  const teamGPs = await db.select().from(gamePresenters)
    .where(eq(gamePresenters.teamId, teamId))
    .orderBy(gamePresenters.name);

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

  // Build result for ALL GPs in team, merging attendance and stats data
  return teamGPs.map(gp => {
    const gpAttendance = attendanceData.find(a => a.gamePresenter.id === gp.id);
    const gpStats = statsData.find(s => s.gamePresenter.id === gp.id);
    
    return {
      gamePresenter: gp,
      attendance: gpAttendance?.attendance || null,
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

export async function getAllReportsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    report: reports,
    team: fmTeams,
  })
    .from(reports)
    .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.createdAt));
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

export async function getReportsWithTeamsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    report: reports,
    team: fmTeams,
  })
  .from(reports)
  .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
  .where(eq(reports.userId, userId))
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

export async function getDashboardStats(month?: number, year?: number, teamId?: number) {
  const db = await getDb();
  if (!db) return { 
    totalGPs: 0, 
    totalEvaluations: 0, 
    totalReports: 0, 
    thisMonthGPs: 0,
    gpStats: [],
    recentEvaluations: [] 
  };

  // Build team filter condition
  const teamCondition = teamId ? eq(gamePresenters.teamId, teamId) : undefined;

  // Count GPs (filtered by team if specified)
  const gpCountQuery = teamId 
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters).where(eq(gamePresenters.teamId, teamId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters);
  const [gpCount] = gpCountQuery;

  // Count evaluations (filtered by team if specified)
  const evalCountQuery = teamId
    ? await db.select({ count: sql<number>`COUNT(*)` })
        .from(evaluations)
        .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
        .where(eq(gamePresenters.teamId, teamId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(evaluations);
  const [evalCount] = evalCountQuery;

  // Count reports (filtered by team if specified)
  const reportCountQuery = teamId
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(reports).where(eq(reports.teamId, teamId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(reports);
  const [reportCount] = reportCountQuery;

  // Use current month/year if not provided
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  // Count unique GPs evaluated this month (filtered by team if specified)
  const thisMonthConditions = [
    sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`,
    sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`
  ];
  if (teamId) {
    thisMonthConditions.push(eq(gamePresenters.teamId, teamId));
  }
  
  const thisMonthGPsQuery = db.select({
    count: sql<number>`COUNT(DISTINCT ${evaluations.gamePresenterId})`,
  })
  .from(evaluations)
  .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
  .where(and(...thisMonthConditions));
  
  const thisMonthGPsResult = await thisMonthGPsQuery;
  const thisMonthGPs = thisMonthGPsResult[0]?.count || 0;

  // Get detailed stats per GP for the selected month (filtered by team if specified)
  const gpStatsConditions = [
    sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`,
    sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`
  ];
  if (teamId) {
    gpStatsConditions.push(eq(gamePresenters.teamId, teamId));
  }
  
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
  .where(and(...gpStatsConditions))
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

// Get dashboard stats filtered by teamId (team-based data isolation)
export async function getDashboardStatsByTeam(month?: number, year?: number, teamId?: number) {
  const db = await getDb();
  if (!db) return { 
    totalGPs: 0, 
    totalEvaluations: 0, 
    totalReports: 0, 
    thisMonthGPs: 0,
    gpStats: [],
    recentEvaluations: [] 
  };

  // Count GPs (filtered by teamId)
  const gpCountQuery = teamId 
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters).where(eq(gamePresenters.teamId, teamId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters);
  const [gpCount] = gpCountQuery;

  // Count evaluations (filtered by teamId via GP)
  const evalCountQuery = teamId
    ? await db.select({ count: sql<number>`COUNT(*)` })
        .from(evaluations)
        .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
        .where(eq(gamePresenters.teamId, teamId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(evaluations);
  const [evalCount] = evalCountQuery;

  // Count reports (filtered by teamId)
  const reportCountQuery = teamId
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(reports).where(eq(reports.teamId, teamId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(reports);
  const [reportCount] = reportCountQuery;

  // Use current month/year if not provided
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  // Count unique GPs evaluated this month (filtered by teamId)
  const thisMonthConditions = [
    sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`,
    sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`
  ];
  
  let thisMonthGPsQuery;
  if (teamId) {
    thisMonthGPsQuery = db.select({
      count: sql<number>`COUNT(DISTINCT ${evaluations.gamePresenterId})`,
    })
    .from(evaluations)
    .innerJoin(gamePresenters, eq(evaluations.gamePresenterId, gamePresenters.id))
    .where(and(...thisMonthConditions, eq(gamePresenters.teamId, teamId)));
  } else {
    thisMonthGPsQuery = db.select({
      count: sql<number>`COUNT(DISTINCT ${evaluations.gamePresenterId})`,
    })
    .from(evaluations)
    .where(and(...thisMonthConditions));
  }
  
  const thisMonthGPsResult = await thisMonthGPsQuery;
  const thisMonthGPs = thisMonthGPsResult[0]?.count || 0;

  // Get detailed stats per GP for the selected month (filtered by teamId)
  const gpStatsConditions = [
    sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`,
    sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`
  ];
  if (teamId) {
    gpStatsConditions.push(eq(gamePresenters.teamId, teamId));
  }
  
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
  .where(and(...gpStatsConditions))
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
    avgAppearance: gp.avgHair && gp.avgMakeup && gp.avgOutfit && gp.avgPosture 
      ? ((Number(gp.avgHair) + Number(gp.avgMakeup) + Number(gp.avgOutfit) + Number(gp.avgPosture))).toFixed(1)
      : "0.0",
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

// Get dashboard stats filtered by userId (user-based data isolation)
export async function getDashboardStatsByUser(month?: number, year?: number, userId?: number) {
  const db = await getDb();
  if (!db) return { 
    totalGPs: 0, 
    totalEvaluations: 0, 
    totalReports: 0, 
    thisMonthGPs: 0,
    gpStats: [],
    recentEvaluations: [] 
  };

  // Count GPs (filtered by userId)
  const gpCountQuery = userId 
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters).where(eq(gamePresenters.userId, userId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters);
  const [gpCount] = gpCountQuery;

  // Count evaluations (filtered by userId)
  const evalCountQuery = userId
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(evaluations).where(eq(evaluations.userId, userId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(evaluations);
  const [evalCount] = evalCountQuery;

  // Count reports (filtered by userId)
  const reportCountQuery = userId
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(reports).where(eq(reports.userId, userId))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(reports);
  const [reportCount] = reportCountQuery;

  // Use current month/year if not provided
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  // Count unique GPs evaluated this month (filtered by userId)
  const thisMonthConditions = [
    sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`,
    sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`
  ];
  if (userId) {
    thisMonthConditions.push(eq(evaluations.userId, userId));
  }
  
  const thisMonthGPsQuery = db.select({
    count: sql<number>`COUNT(DISTINCT ${evaluations.gamePresenterId})`,
  })
  .from(evaluations)
  .where(and(...thisMonthConditions));
  
  const thisMonthGPsResult = await thisMonthGPsQuery;
  const thisMonthGPs = thisMonthGPsResult[0]?.count || 0;

  // Get detailed stats per GP for the selected month (filtered by userId)
  const gpStatsConditions = [
    sql`MONTH(${evaluations.evaluationDate}) = ${targetMonth}`,
    sql`YEAR(${evaluations.evaluationDate}) = ${targetYear}`
  ];
  if (userId) {
    gpStatsConditions.push(eq(evaluations.userId, userId));
  }
  
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
  .where(and(...gpStatsConditions))
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
    avgAppearance: gp.avgHair && gp.avgMakeup && gp.avgOutfit && gp.avgPosture 
      ? ((Number(gp.avgHair) + Number(gp.avgMakeup) + Number(gp.avgOutfit) + Number(gp.avgPosture))).toFixed(1)
      : "0.0",
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
  console.log(`[getGPEvaluationsForDataSheet] teamId=${teamId}, year=${year}, month=${month}`);
  const db = await getDb();
  if (!db) {
    console.log(`[getGPEvaluationsForDataSheet] No database connection`);
    return [];
  }

  // Use UTC dates to avoid timezone issues
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  console.log(`[getGPEvaluationsForDataSheet] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

  // Get all GPs in the team with their evaluations for the month
  const gps = await db.select({
    gpId: gamePresenters.id,
    gpName: gamePresenters.name,
  })
  .from(gamePresenters)
  .where(eq(gamePresenters.teamId, teamId));

  const result = [];

  // Debug: check first GP's evaluations without date filter
  if (gps.length > 0) {
    const debugEvals = await db.select({
      id: evaluations.id,
      gpId: evaluations.gamePresenterId,
      date: evaluations.evaluationDate,
    })
    .from(evaluations)
    .where(eq(evaluations.gamePresenterId, gps[0].gpId))
    .limit(5);
    console.log(`[getGPEvaluationsForDataSheet] Debug - First GP (${gps[0].gpId}) evaluations without date filter:`, debugEvals);
  }

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

  console.log(`[getGPEvaluationsForDataSheet] Found ${gps.length} GPs, ${result.filter(r => r.evaluations.length > 0).length} with evaluations`);
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

export async function getGpAccessTokensByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    token: gpAccessTokens,
    gp: gamePresenters,
  })
  .from(gpAccessTokens)
  .leftJoin(gamePresenters, eq(gpAccessTokens.gamePresenterId, gamePresenters.id))
  .where(eq(gamePresenters.userId, userId))
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
    // evaluatorName removed for privacy - GP should not see who evaluated them
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
  data: { attitude?: number | null; mistakes?: number; notes?: string | null; updatedById?: number; userId?: number }
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


// ============================================
// ADMIN FUNCTIONS
// ============================================

export async function updateUserRole(userId: number, role: 'user' | 'admin'): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(users)
    .set({ role })
    .where(eq(users.id, userId));
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function deleteUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(users).where(eq(users.id, userId));
}

// Get all reports with team info (admin only)
export async function getAllReportsWithTeam() {
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

// Get system stats for admin dashboard
export async function getAdminDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  const [
    totalUsers,
    totalTeams,
    totalGPs,
    totalEvaluations,
    totalReports,
  ] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(users),
    db.select({ count: sql<number>`COUNT(*)` }).from(fmTeams),
    db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters),
    db.select({ count: sql<number>`COUNT(*)` }).from(evaluations),
    db.select({ count: sql<number>`COUNT(*)` }).from(reports),
  ]);

  // Get recent activity
  const recentReports = await db.select({
    report: reports,
    team: fmTeams,
  })
  .from(reports)
  .leftJoin(fmTeams, eq(reports.teamId, fmTeams.id))
  .orderBy(desc(reports.createdAt))
  .limit(5);

  const recentUsers = await db.select()
    .from(users)
    .orderBy(desc(users.lastSignedIn))
    .limit(5);

  return {
    totalUsers: totalUsers[0]?.count || 0,
    totalTeams: totalTeams[0]?.count || 0,
    totalGPs: totalGPs[0]?.count || 0,
    totalEvaluations: totalEvaluations[0]?.count || 0,
    totalReports: totalReports[0]?.count || 0,
    recentReports,
    recentUsers,
  };
}

// Update FM team details
export async function updateFmTeam(teamId: number, data: Partial<InsertFmTeam>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(fmTeams)
    .set(data)
    .where(eq(fmTeams.id, teamId));
}

// Delete FM team
export async function deleteFmTeam(teamId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // First, unassign all users from this team
  await db.update(users)
    .set({ teamId: null })
    .where(eq(users.teamId, teamId));

  // Then delete the team
  await db.delete(fmTeams).where(eq(fmTeams.id, teamId));
}

// Get team with assigned users
export async function getTeamWithUsers(teamId: number) {
  const db = await getDb();
  if (!db) return null;

  const team = await db.select().from(fmTeams).where(eq(fmTeams.id, teamId)).limit(1);
  if (team.length === 0) return null;

  const assignedUsers = await db.select()
    .from(users)
    .where(eq(users.teamId, teamId));

  const gpCount = await db.select({ count: sql<number>`COUNT(*)` })
    .from(gamePresenters)
    .where(eq(gamePresenters.teamId, teamId));

  return {
    ...team[0],
    assignedUsers,
    gpCount: gpCount[0]?.count || 0,
  };
}

// Get all teams with stats for admin
export async function getAllTeamsWithStats() {
  const db = await getDb();
  if (!db) return [];

  const teams = await db.select().from(fmTeams).orderBy(fmTeams.teamName);

  return await Promise.all(teams.map(async (team) => {
    const [assignedUsers, gpCount, reportCount] = await Promise.all([
      db.select().from(users).where(eq(users.teamId, team.id)),
      db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters).where(eq(gamePresenters.teamId, team.id)),
      db.select({ count: sql<number>`COUNT(*)` }).from(reports).where(eq(reports.teamId, team.id)),
    ]);

    return {
      ...team,
      assignedUsers,
      gpCount: gpCount[0]?.count || 0,
      reportCount: reportCount[0]?.count || 0,
    };
  }));
}


// Delete report by ID
export async function deleteReport(reportId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(reports).where(eq(reports.id, reportId));
}

// Delete report with ownership check
export async function deleteReportWithCheck(reportId: number, teamId: number | null, isAdmin: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the report first
  const report = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (report.length === 0) {
    return false; // Report not found
  }

  // Check ownership: admin can delete any, FM can only delete their team's
  if (!isAdmin && report[0].teamId !== teamId) {
    throw new Error("Access denied: You can only delete your team's reports");
  }

  await db.delete(reports).where(eq(reports.id, reportId));
  return true;
}

// Delete report with user-based ownership check
export async function deleteReportWithCheckByUser(reportId: number, userId: number, isAdmin: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the report first
  const report = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (report.length === 0) {
    return false; // Report not found
  }

  // Check ownership: admin can delete any, user can only delete their own
  if (!isAdmin && report[0].userId !== userId) {
    throw new Error("Access denied: You can only delete your own reports");
  }

  await db.delete(reports).where(eq(reports.id, reportId));
  return true;
}

// Delete report with team-based ownership check
export async function deleteReportWithCheckByTeam(reportId: number, teamId: number | null, isAdmin: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the report first
  const report = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (report.length === 0) {
    return false; // Report not found
  }

  // Check ownership: admin can delete any, user can only delete their team's reports
  if (!isAdmin && report[0].teamId !== teamId) {
    throw new Error("Access denied: You can only delete your team's reports");
  }

  await db.delete(reports).where(eq(reports.id, reportId));
  return true;
}


// Get GP access token by ID
export async function getGpAccessTokenById(id: number): Promise<GpAccessToken | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select()
    .from(gpAccessTokens)
    .where(eq(gpAccessTokens.id, id))
    .limit(1);
  return result[0] || null;
}


// ============================================
// BULK OPERATIONS
// ============================================

export interface BulkGpStatsUpdate {
  gpId: number;
  attitude?: number | null;
  mistakes?: number;
  notes?: string | null;
}

export async function bulkUpdateMonthlyGpStats(
  updates: BulkGpStatsUpdate[],
  month: number,
  year: number,
  updatedById: number
): Promise<{ success: number; failed: number; errors: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const update of updates) {
    try {
      const stats = await getOrCreateMonthlyGpStats(update.gpId, month, year);
      
      const updateData: Record<string, any> = { updatedById };
      if (update.attitude !== undefined) updateData.attitude = update.attitude;
      if (update.mistakes !== undefined) updateData.mistakes = update.mistakes;
      if (update.notes !== undefined) updateData.notes = update.notes;

      await db.update(monthlyGpStats)
        .set(updateData)
        .where(eq(monthlyGpStats.id, stats.id));
      
      success++;
    } catch (error: any) {
      failed++;
      errors.push(`GP ${update.gpId}: ${error.message}`);
    }
  }

  return { success, failed, errors };
}

export async function verifyGpOwnership(gpIds: number[], teamId: number): Promise<{ valid: boolean; invalidGpIds: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const gps = await db.select({ id: gamePresenters.id, teamId: gamePresenters.teamId })
    .from(gamePresenters)
    .where(inArray(gamePresenters.id, gpIds));

  const invalidGpIds = gps
    .filter(gp => gp.teamId !== teamId)
    .map(gp => gp.id);

  const foundIds = gps.map(gp => gp.id);
  const notFoundIds = gpIds.filter(id => !foundIds.includes(id));

  return {
    valid: invalidGpIds.length === 0 && notFoundIds.length === 0,
    invalidGpIds: [...invalidGpIds, ...notFoundIds],
  };
}

export async function verifyGpOwnershipByUser(gpIds: number[], userId: number): Promise<{ valid: boolean; invalidGpIds: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const gps = await db.select({ id: gamePresenters.id, userId: gamePresenters.userId })
    .from(gamePresenters)
    .where(inArray(gamePresenters.id, gpIds));

  const invalidGpIds = gps
    .filter(gp => gp.userId !== userId)
    .map(gp => gp.id);

  const foundIds = gps.map(gp => gp.id);
  const notFoundIds = gpIds.filter(id => !foundIds.includes(id));

  return {
    valid: invalidGpIds.length === 0 && notFoundIds.length === 0,
    invalidGpIds: [...invalidGpIds, ...notFoundIds],
  };
}

export async function verifyGpOwnershipByTeam(gpIds: number[], teamId: number | null): Promise<{ valid: boolean; invalidGpIds: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!teamId) return { valid: false, invalidGpIds: gpIds };

  const gps = await db.select({ id: gamePresenters.id, teamId: gamePresenters.teamId })
    .from(gamePresenters)
    .where(inArray(gamePresenters.id, gpIds));

  const invalidGpIds = gps
    .filter(gp => gp.teamId !== teamId)
    .map(gp => gp.id);

  const foundIds = gps.map(gp => gp.id);
  const notFoundIds = gpIds.filter(id => !foundIds.includes(id));

  return {
    valid: invalidGpIds.length === 0 && notFoundIds.length === 0,
    invalidGpIds: [...invalidGpIds, ...notFoundIds],
  };
}

export async function bulkSetAttitude(
  gpIds: number[],
  attitude: number,
  month: number,
  year: number,
  updatedById: number
): Promise<{ success: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let success = 0;
  let failed = 0;

  for (const gpId of gpIds) {
    try {
      const stats = await getOrCreateMonthlyGpStats(gpId, month, year);
      await db.update(monthlyGpStats)
        .set({ attitude, updatedById })
        .where(eq(monthlyGpStats.id, stats.id));
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
}

export async function bulkResetMistakes(
  gpIds: number[],
  month: number,
  year: number,
  updatedById: number
): Promise<{ success: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let success = 0;
  let failed = 0;

  for (const gpId of gpIds) {
    try {
      const stats = await getOrCreateMonthlyGpStats(gpId, month, year);
      await db.update(monthlyGpStats)
        .set({ mistakes: 0, updatedById })
        .where(eq(monthlyGpStats.id, stats.id));
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
}



// ============================================
// INPUT SANITIZATION HELPERS
// ============================================

export function sanitizeString(input: string | null | undefined, maxLength: number = 1000): string {
  if (!input) return '';
  
  // Remove potentially dangerous characters and trim
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim()
    .substring(0, maxLength);
}

export function sanitizeNumber(input: any, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
  const num = Number(input);
  if (isNaN(num)) return min;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 320;
}

export function validateDateRange(startDate: Date, endDate: Date, maxDays: number = 365): boolean {
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= maxDays;
}


// ============================================
// INVITATION FUNCTIONS
// ============================================

import { invitations, InsertInvitation, Invitation } from "../drizzle/schema";

export async function createInvitation(data: InsertInvitation): Promise<Invitation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(invitations).values(data);
  const newInvitation = await db.select().from(invitations)
    .where(eq(invitations.id, Number(result[0].insertId)))
    .limit(1);
  return newInvitation[0];
}

export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(invitations)
    .where(eq(invitations.token, token))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getInvitationByEmail(email: string): Promise<Invitation | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(invitations)
    .where(and(
      eq(invitations.email, email.toLowerCase()),
      eq(invitations.status, 'pending')
    ))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllInvitations(): Promise<Array<Invitation & { team?: FmTeam | null; createdBy?: User | null }>> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select({
    invitation: invitations,
    team: fmTeams,
    createdBy: users,
  })
  .from(invitations)
  .leftJoin(fmTeams, eq(invitations.teamId, fmTeams.id))
  .leftJoin(users, eq(invitations.createdById, users.id))
  .orderBy(desc(invitations.createdAt));
  
  return result.map(r => ({
    ...r.invitation,
    team: r.team,
    createdBy: r.createdBy,
  }));
}

export async function updateInvitationStatus(
  id: number, 
  status: 'pending' | 'accepted' | 'expired' | 'revoked',
  usedById?: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  const updateData: Partial<Invitation> = { status };
  if (usedById) {
    updateData.usedById = usedById;
    updateData.usedAt = new Date();
  }
  
  await db.update(invitations)
    .set(updateData)
    .where(eq(invitations.id, id));
}

export async function getInvitationStats(): Promise<{
  total: number;
  pending: number;
  accepted: number;
  expired: number;
  revoked: number;
}> {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 };
  
  const allInvitations = await db.select().from(invitations);
  
  const stats = {
    total: allInvitations.length,
    pending: 0,
    accepted: 0,
    expired: 0,
    revoked: 0,
  };
  
  const now = new Date();
  for (const inv of allInvitations) {
    if (inv.status === 'accepted') {
      stats.accepted++;
    } else if (inv.status === 'revoked') {
      stats.revoked++;
    } else if (inv.status === 'expired' || (inv.status === 'pending' && inv.expiresAt < now)) {
      stats.expired++;
    } else {
      stats.pending++;
    }
  }
  
  return stats;
}

export async function expireOldInvitations(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const now = new Date();
  const result = await db.update(invitations)
    .set({ status: 'expired' })
    .where(and(
      eq(invitations.status, 'pending'),
      lte(invitations.expiresAt, now)
    ));
  
  return result[0].affectedRows || 0;
}

export async function deleteInvitation(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(invitations).where(eq(invitations.id, id));
}

// Update user with team and role from invitation
export async function updateUserFromInvitation(userId: number, teamId: number | null, role: 'user' | 'admin'): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.update(users)
    .set({ teamId, role })
    .where(eq(users.id, userId));
}


// ============================================
// TEAM GP ASSIGNMENT FUNCTIONS
// ============================================

// Get all GPs for a specific team
export async function getGPsByTeam(teamId: number | null): Promise<GamePresenter[]> {
  const db = await getDb();
  if (!db) return [];
  
  if (teamId === null) {
    return await db.select().from(gamePresenters).where(isNull(gamePresenters.teamId)).orderBy(gamePresenters.name);
  }
  
  return await db.select().from(gamePresenters).where(eq(gamePresenters.teamId, teamId)).orderBy(gamePresenters.name);
}

// Assign multiple GPs to a team
export async function assignGPsToTeam(gpIds: number[], teamId: number | null): Promise<{ success: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  let success = 0;
  let failed = 0;
  
  for (const gpId of gpIds) {
    try {
      await db.update(gamePresenters)
        .set({ teamId })
        .where(eq(gamePresenters.id, gpId));
      success++;
    } catch {
      failed++;
    }
  }
  
  return { success, failed };
}

// Remove GPs from team (set teamId to null)
export async function removeGPsFromTeam(gpIds: number[]): Promise<{ success: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  let success = 0;
  let failed = 0;
  
  for (const gpId of gpIds) {
    try {
      await db.update(gamePresenters)
        .set({ teamId: null })
        .where(eq(gamePresenters.id, gpId));
      success++;
    } catch {
      failed++;
    }
  }
  
  return { success, failed };
}

// Get all unassigned GPs
export async function getUnassignedGPs(): Promise<GamePresenter[]> {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(gamePresenters).where(isNull(gamePresenters.teamId)).orderBy(gamePresenters.name);
}

// Get team with its GPs
export async function getTeamWithGPs(teamId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const team = await db.select().from(fmTeams).where(eq(fmTeams.id, teamId)).limit(1);
  if (team.length === 0) return null;
  
  const gps = await db.select().from(gamePresenters).where(eq(gamePresenters.teamId, teamId)).orderBy(gamePresenters.name);
  
  return {
    ...team[0],
    gamePresenters: gps
  };
}

// Update team with GP assignments
export async function updateTeamWithGPs(
  teamId: number, 
  data: Partial<InsertFmTeam>, 
  gpIds: number[]
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Update team details if provided
  if (Object.keys(data).length > 0) {
    await db.update(fmTeams)
      .set(data)
      .where(eq(fmTeams.id, teamId));
  }
  
  // First, remove all GPs from this team
  await db.update(gamePresenters)
    .set({ teamId: null })
    .where(eq(gamePresenters.teamId, teamId));
  
  // Then assign the selected GPs to this team
  if (gpIds.length > 0) {
    for (const gpId of gpIds) {
      await db.update(gamePresenters)
        .set({ teamId })
        .where(eq(gamePresenters.id, gpId));
    }
  }
}

// Get all teams with their GPs for admin view
export async function getAllTeamsWithGPs() {
  const db = await getDb();
  if (!db) return [];
  
  const teams = await db.select().from(fmTeams).orderBy(fmTeams.teamName);
  
  return await Promise.all(teams.map(async (team) => {
    const [assignedUsers, gps, reportCount] = await Promise.all([
      db.select().from(users).where(eq(users.teamId, team.id)),
      db.select().from(gamePresenters).where(eq(gamePresenters.teamId, team.id)).orderBy(gamePresenters.name),
      db.select({ count: sql<number>`COUNT(*)` }).from(reports).where(eq(reports.teamId, team.id)),
    ]);
    
    return {
      ...team,
      assignedUsers,
      gamePresenters: gps,
      gpCount: gps.length,
      reportCount: reportCount[0]?.count || 0,
    };
  }));
}
