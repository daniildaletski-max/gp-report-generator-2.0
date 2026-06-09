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

/**
 * Exported for tests + the studioworks suggestMatches endpoint: a single
 * 0..1 score between two names that combines all the matcher's heuristics
 * (exact normalized equality, full-string Levenshtein, order-independent
 * token similarity, substring-contains). Higher is more similar.
 */
export function nameMatchScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  const fullStringSim = calculateSimilarity(na, nb);
  const tokenSim = tokenSimilarity(na, nb);
  const containsMatch = nb.includes(na) || na.includes(nb);
  return Math.max(fullStringSim, tokenSim, containsMatch ? 0.85 : 0);
}

/**
 * Token-based name similarity that ignores word order.
 *
 * Why: HR systems (Persona) routinely emit `Lastname Firstname`
 * while we store `Firstname Lastname`. Pure Levenshtein on the
 * full strings rates "Olha Kyrychenko" vs "Kyrychenko Olha" at
 * roughly 0.5 — under the 0.7 default threshold — so every Persona
 * sync ended up at 0/138 matched even though every name was actually
 * present in our DB. Token comparison sidesteps the ordering problem.
 *
 * Strategy:
 *   1. Lower-case + split on whitespace and hyphens.
 *   2. Strip diacritics so "Köhler" matches "Kohler".
 *   3. For each token in the shorter list, take the best Levenshtein
 *      similarity against any token in the longer list.
 *   4. Average those bests.
 *
 * Returns 1.0 when token sets are equal (any order); ~0.85+ when
 * one part differs slightly (typo) and the other matches exactly.
 */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenize(name: string): string[] {
  return stripDiacritics(name)
    .toLowerCase()
    .split(/[\s\-]+/)
    .filter(t => t.length >= 2);
}

function tokenSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  // Identical token set (any order) → exact match.
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === setB.size && Array.from(setA).every(t => setB.has(t))) return 1;

  // Otherwise: average best-match similarity for each token in the
  // SMALLER set against any token in the larger one.
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  let totalBest = 0;
  for (const t of shorter) {
    let best = 0;
    for (const u of longer) {
      const sim = u === t ? 1 : 1 - levenshteinDistance(t, u) / Math.max(t.length, u.length);
      if (sim > best) best = sim;
    }
    totalBest += best;
  }
  return totalBest / shorter.length;
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
    // Compare the input against both `realName` (HR / Persona legal
    // name) when set and `name` (dealer-floor name). Whichever scores
    // higher wins. Both go through the new token-based scorer that
    // ignores word order — Persona returns "Lastname Firstname"
    // while we usually have "Firstname Lastname", and pure Levenshtein
    // on the full strings was bombing the comparison.
    const candidates: string[] = [];
    if (gp.realName && gp.realName.trim()) candidates.push(gp.realName);
    candidates.push(gp.name);

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeName(candidate);
      if (normalizedCandidate === normalizedInput) {
        return { gamePresenter: gp, similarity: 1, isExactMatch: true };
      }
      const fullStringSim = calculateSimilarity(normalizedInput, normalizedCandidate);
      const tokenSim = tokenSimilarity(normalizedInput, normalizedCandidate);
      const containsMatch = normalizedCandidate.includes(normalizedInput) || normalizedInput.includes(normalizedCandidate);
      const similarity = Math.max(fullStringSim, tokenSim, containsMatch ? 0.85 : 0);
      if (tokenSim >= 0.99) {
        // Token sets equal → treat as exact match even if word order differs.
        return { gamePresenter: gp, similarity: 1, isExactMatch: true };
      }
      if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { gamePresenter: gp, similarity, isExactMatch: false };
      }
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
  // One shared database — match against every GP, ignore ownership.
  void userId;
  return findAllMatchingGPs(name, threshold);
}

export async function findBestMatchingGPByUser(name: string, threshold: number = 0.7, userId: number): Promise<FuzzyMatchResult | null> {
  // One shared database — match against every GP, ignore ownership.
  void userId;
  return findBestMatchingGP(name, threshold);
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
  // One shared database: every authenticated user sees every GP. The
  // userId parameter is retained for call-site compatibility but no
  // longer scopes the result.
  void userId;
  return getAllGamePresenters();
}

export async function getGamePresentersByTeam(teamId: number | null): Promise<GamePresenter[]> {
  const db = await getDb();
  if (!db) return [];
  // One shared database — a null teamId returns every GP company-wide.
  if (teamId == null) return await db.select().from(gamePresenters).orderBy(gamePresenters.name);
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
// EXISTENCE VERIFICATION
//
// One shared database: there is no per-team / per-user ownership any more,
// so these only verify that the referenced GPs exist (guards against
// dangling ids) — they no longer gate access by owner.
// ============================================

async function verifyGpsExist(gpIds: number[]): Promise<{ valid: boolean; invalidGpIds: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const gps = await db.select({ id: gamePresenters.id }).from(gamePresenters).where(inArray(gamePresenters.id, gpIds));
  const foundIds = gps.map(gp => gp.id);
  const notFoundIds = gpIds.filter(id => !foundIds.includes(id));
  return { valid: notFoundIds.length === 0, invalidGpIds: notFoundIds };
}

export async function verifyGpOwnership(gpIds: number[], teamId: number): Promise<{ valid: boolean; invalidGpIds: number[] }> {
  void teamId;
  return verifyGpsExist(gpIds);
}

export async function verifyGpOwnershipByUser(gpIds: number[], userId: number): Promise<{ valid: boolean; invalidGpIds: number[] }> {
  void userId;
  return verifyGpsExist(gpIds);
}

export async function verifyGpOwnershipByTeam(gpIds: number[], teamId: number | null): Promise<{ valid: boolean; invalidGpIds: number[] }> {
  void teamId;
  return verifyGpsExist(gpIds);
}
