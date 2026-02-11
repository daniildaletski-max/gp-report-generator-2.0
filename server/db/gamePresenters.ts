/**
 * Game Presenter Database Operations
 * Handles GP CRUD, fuzzy matching, and ownership verification
 */
import { eq, and, inArray, isNull, isNotNull } from "drizzle-orm";
import { gamePresenters, InsertGamePresenter, GamePresenter, evaluations, gpAccessTokens } from "../../drizzle/schema";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";

const log = createLogger("DB:GP");

// ============================================
// FUZZY MATCHING UTILITIES
// ============================================

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

function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - distance / maxLen;
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/[''`]/g, "'")
    .replace(/[–—]/g, '-');
}

export interface FuzzyMatchResult {
  gamePresenter: GamePresenter;
  similarity: number;
  isExactMatch: boolean;
}

// ============================================
// FUZZY SEARCH
// ============================================

export async function findBestMatchingGP(name: string, threshold: number = 0.7): Promise<FuzzyMatchResult | null> {
  const db = await getDb();
  if (!db) return null;
  const allGPs = await db.select().from(gamePresenters);
  const normalizedInput = normalizeName(name);
  let bestMatch: FuzzyMatchResult | null = null;
  for (const gp of allGPs) {
    const normalizedGPName = normalizeName(gp.name);
    if (normalizedGPName === normalizedInput) {
      return { gamePresenter: gp, similarity: 1, isExactMatch: true };
    }
    const similarity = calculateSimilarity(normalizedInput, normalizedGPName);
    const containsMatch = normalizedGPName.includes(normalizedInput) || normalizedInput.includes(normalizedGPName);
    const adjustedSimilarity = containsMatch ? Math.max(similarity, 0.85) : similarity;
    if (adjustedSimilarity >= threshold && (!bestMatch || adjustedSimilarity > bestMatch.similarity)) {
      bestMatch = { gamePresenter: gp, similarity: adjustedSimilarity, isExactMatch: false };
    }
  }
  return bestMatch;
}

export async function findAllMatchingGPs(name: string, threshold: number = 0.5): Promise<FuzzyMatchResult[]> {
  const db = await getDb();
  if (!db) return [];
  const allGPs = await db.select().from(gamePresenters);
  const normalizedInput = normalizeName(name);
  const matches: FuzzyMatchResult[] = [];
  for (const gp of allGPs) {
    const normalizedGPName = normalizeName(gp.name);
    if (normalizedGPName === normalizedInput) {
      matches.push({ gamePresenter: gp, similarity: 1, isExactMatch: true });
      continue;
    }
    const similarity = calculateSimilarity(normalizedInput, normalizedGPName);
    const containsMatch = normalizedGPName.includes(normalizedInput) || normalizedInput.includes(normalizedGPName);
    const adjustedSimilarity = containsMatch ? Math.max(similarity, 0.85) : similarity;
    if (adjustedSimilarity >= threshold) {
      matches.push({ gamePresenter: gp, similarity: adjustedSimilarity, isExactMatch: false });
    }
  }
  return matches.sort((a, b) => b.similarity - a.similarity);
}

export async function findAllMatchingGPsByUser(name: string, threshold: number = 0.5, userId: number): Promise<FuzzyMatchResult[]> {
  const db = await getDb();
  if (!db) return [];
  const allGPs = await db.select().from(gamePresenters).where(eq(gamePresenters.userId, userId));
  const normalizedInput = normalizeName(name);
  const matches: FuzzyMatchResult[] = [];
  for (const gp of allGPs) {
    const normalizedGPName = normalizeName(gp.name);
    const similarity = calculateSimilarity(normalizedInput, normalizedGPName);
    const isExactMatch = normalizedInput === normalizedGPName;
    if (similarity >= threshold || isExactMatch) {
      matches.push({ gamePresenter: gp, similarity, isExactMatch });
    }
  }
  return matches.sort((a, b) => b.similarity - a.similarity);
}

export async function findBestMatchingGPByUser(name: string, threshold: number = 0.7, userId: number): Promise<FuzzyMatchResult | null> {
  const db = await getDb();
  if (!db) return null;
  const allGPs = await db.select().from(gamePresenters).where(eq(gamePresenters.userId, userId));
  const normalizedInput = normalizeName(name);
  let bestMatch: FuzzyMatchResult | null = null;
  for (const gp of allGPs) {
    const normalizedGPName = normalizeName(gp.name);
    const similarity = calculateSimilarity(normalizedInput, normalizedGPName);
    const isExactMatch = normalizedInput === normalizedGPName;
    if (isExactMatch) return { gamePresenter: gp, similarity: 1.0, isExactMatch: true };
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { gamePresenter: gp, similarity, isExactMatch: false };
    }
  }
  return bestMatch;
}

// ============================================
// CRUD
// ============================================

export async function findOrCreateGamePresenter(name: string, teamId?: number, userId?: number): Promise<GamePresenter> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existingWithTeam = await db.select().from(gamePresenters)
    .where(and(eq(gamePresenters.name, name), isNotNull(gamePresenters.teamId)))
    .limit(1);
  if (existingWithTeam.length > 0) {
    if (userId && !existingWithTeam[0].userId) {
      await db.update(gamePresenters).set({ userId }).where(eq(gamePresenters.id, existingWithTeam[0].id));
    }
    return existingWithTeam[0];
  }

  const conditions = [eq(gamePresenters.name, name)];
  if (userId) conditions.push(eq(gamePresenters.userId, userId));
  const existing = await db.select().from(gamePresenters).where(and(...conditions)).limit(1);
  if (existing.length > 0) return existing[0];

  const fuzzyMatchAll = await findBestMatchingGP(name, 0.85);
  if (fuzzyMatchAll && fuzzyMatchAll.gamePresenter.teamId) {
    log.info(`Fuzzy match: "${name}" -> "${fuzzyMatchAll.gamePresenter.name}" (${(fuzzyMatchAll.similarity * 100).toFixed(1)}%)`);
    if (userId && !fuzzyMatchAll.gamePresenter.userId) {
      await db.update(gamePresenters).set({ userId }).where(eq(gamePresenters.id, fuzzyMatchAll.gamePresenter.id));
    }
    return fuzzyMatchAll.gamePresenter;
  }

  const fuzzyMatch = userId ? await findBestMatchingGPByUser(name, 0.85, userId) : await findBestMatchingGP(name, 0.85);
  if (fuzzyMatch) {
    log.info(`Fuzzy match: "${name}" -> "${fuzzyMatch.gamePresenter.name}" (${(fuzzyMatch.similarity * 100).toFixed(1)}%)`);
    return fuzzyMatch.gamePresenter;
  }

  const result = await db.insert(gamePresenters).values({ name, teamId: teamId || null, userId: userId || null });
  const newGP = await db.select().from(gamePresenters).where(eq(gamePresenters.id, Number(result[0].insertId))).limit(1);
  log.info(`Created new Game Presenter: "${name}"`);
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
  return await db.select().from(gamePresenters).where(eq(gamePresenters.userId, userId)).orderBy(gamePresenters.name);
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
  await db.delete(evaluations).where(eq(evaluations.gamePresenterId, gpId));
  await db.delete(gpAccessTokens).where(eq(gpAccessTokens.gamePresenterId, gpId));
  await db.delete(gamePresenters).where(eq(gamePresenters.id, gpId));
  return true;
}

// ============================================
// OWNERSHIP VERIFICATION
// ============================================

export async function verifyGpOwnership(gpIds: number[], teamId: number): Promise<{ valid: boolean; invalidGpIds: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const gps = await db.select({ id: gamePresenters.id, teamId: gamePresenters.teamId }).from(gamePresenters).where(inArray(gamePresenters.id, gpIds));
  const invalidGpIds = gps.filter(gp => gp.teamId !== teamId).map(gp => gp.id);
  const foundIds = gps.map(gp => gp.id);
  const notFoundIds = gpIds.filter(id => !foundIds.includes(id));
  return { valid: invalidGpIds.length === 0 && notFoundIds.length === 0, invalidGpIds: [...invalidGpIds, ...notFoundIds] };
}

export async function verifyGpOwnershipByUser(gpIds: number[], userId: number): Promise<{ valid: boolean; invalidGpIds: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const gps = await db.select({ id: gamePresenters.id, userId: gamePresenters.userId }).from(gamePresenters).where(inArray(gamePresenters.id, gpIds));
  const invalidGpIds = gps.filter(gp => gp.userId !== userId).map(gp => gp.id);
  const foundIds = gps.map(gp => gp.id);
  const notFoundIds = gpIds.filter(id => !foundIds.includes(id));
  return { valid: invalidGpIds.length === 0 && notFoundIds.length === 0, invalidGpIds: [...invalidGpIds, ...notFoundIds] };
}

export async function verifyGpOwnershipByTeam(gpIds: number[], teamId: number | null): Promise<{ valid: boolean; invalidGpIds: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!teamId) return { valid: false, invalidGpIds: gpIds };
  const gps = await db.select({ id: gamePresenters.id, teamId: gamePresenters.teamId }).from(gamePresenters).where(inArray(gamePresenters.id, gpIds));
  const invalidGpIds = gps.filter(gp => gp.teamId !== teamId).map(gp => gp.id);
  const foundIds = gps.map(gp => gp.id);
  const notFoundIds = gpIds.filter(id => !foundIds.includes(id));
  return { valid: invalidGpIds.length === 0 && notFoundIds.length === 0, invalidGpIds: [...invalidGpIds, ...notFoundIds] };
}
