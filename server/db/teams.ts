/**
 * FM Teams Database Operations
 * Handles team CRUD, GP assignment, and team statistics
 */
import { eq, sql, isNull } from "drizzle-orm";
import { fmTeams, InsertFmTeam, FmTeam, users, gamePresenters, reports } from "../../drizzle/schema";
import { getDb } from "./connection";

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

export async function updateFmTeam(teamId: number, data: Partial<InsertFmTeam>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(fmTeams).set(data).where(eq(fmTeams.id, teamId));
}

export async function deleteFmTeam(teamId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ teamId: null }).where(eq(users.teamId, teamId));
  await db.delete(fmTeams).where(eq(fmTeams.id, teamId));
}

export async function getTeamById(teamId: number) {
  const db = await getDb();
  if (!db) return null;
  const team = await db.select().from(fmTeams).where(eq(fmTeams.id, teamId)).limit(1);
  return team.length > 0 ? team[0] : null;
}

export async function getTeamWithUsers(teamId: number) {
  const db = await getDb();
  if (!db) return null;
  const team = await db.select().from(fmTeams).where(eq(fmTeams.id, teamId)).limit(1);
  if (team.length === 0) return null;
  const assignedUsers = await db.select().from(users).where(eq(users.teamId, teamId));
  const gpCount = await db.select({ count: sql<number>`COUNT(*)` }).from(gamePresenters).where(eq(gamePresenters.teamId, teamId));
  return { ...team[0], assignedUsers, gpCount: gpCount[0]?.count || 0 };
}

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
    return { ...team, assignedUsers, gpCount: gpCount[0]?.count || 0, reportCount: reportCount[0]?.count || 0 };
  }));
}

export async function getFmTeamsByUser(userId: number): Promise<FmTeam[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(fmTeams).where(eq(fmTeams.userId, userId)).orderBy(fmTeams.teamName);
}

// Team GP Assignment functions
export async function getGPsByTeam(teamId: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (teamId === null) {
    return await db.select().from(gamePresenters).where(isNull(gamePresenters.teamId)).orderBy(gamePresenters.name);
  }
  return await db.select().from(gamePresenters).where(eq(gamePresenters.teamId, teamId)).orderBy(gamePresenters.name);
}

export async function assignGPsToTeam(gpIds: number[], teamId: number | null): Promise<{ success: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let success = 0, failed = 0;
  for (const gpId of gpIds) {
    try {
      await db.update(gamePresenters).set({ teamId }).where(eq(gamePresenters.id, gpId));
      success++;
    } catch { failed++; }
  }
  return { success, failed };
}

export async function removeGPsFromTeam(gpIds: number[]): Promise<{ success: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let success = 0, failed = 0;
  for (const gpId of gpIds) {
    try {
      await db.update(gamePresenters).set({ teamId: null }).where(eq(gamePresenters.id, gpId));
      success++;
    } catch { failed++; }
  }
  return { success, failed };
}

export async function getUnassignedGPs() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(gamePresenters).where(isNull(gamePresenters.teamId)).orderBy(gamePresenters.name);
}

export async function getTeamWithGPs(teamId: number) {
  const db = await getDb();
  if (!db) return null;
  const team = await db.select().from(fmTeams).where(eq(fmTeams.id, teamId)).limit(1);
  if (team.length === 0) return null;
  const gps = await db.select().from(gamePresenters).where(eq(gamePresenters.teamId, teamId)).orderBy(gamePresenters.name);
  return { ...team[0], gamePresenters: gps };
}

export async function updateTeamWithGPs(teamId: number, data: Partial<InsertFmTeam>, gpIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (Object.keys(data).length > 0) {
    await db.update(fmTeams).set(data).where(eq(fmTeams.id, teamId));
  }
  await db.update(gamePresenters).set({ teamId: null }).where(eq(gamePresenters.teamId, teamId));
  if (gpIds.length > 0) {
    for (const gpId of gpIds) {
      await db.update(gamePresenters).set({ teamId }).where(eq(gamePresenters.id, gpId));
    }
  }
}

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
    return { ...team, assignedUsers, gamePresenters: gps, gpCount: gps.length, reportCount: reportCount[0]?.count || 0 };
  }));
}

export async function getTeamsWithGPsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const teams = await db.select().from(fmTeams).where(eq(fmTeams.userId, userId)).orderBy(fmTeams.teamName);
  return await Promise.all(teams.map(async (team) => {
    const gps = await db.select().from(gamePresenters)
      .where(eq(gamePresenters.teamId, team.id))
      .orderBy(gamePresenters.name);
    const reportCount = await db.select({ count: sql<number>`COUNT(*)` })
      .from(reports)
      .where(eq(reports.teamId, team.id));
    return { ...team, assignedUsers: [], gamePresenters: gps, gpCount: gps.length, reportCount: reportCount[0]?.count || 0 };
  }));
}

export async function getUnassignedGPsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(gamePresenters)
    .where(eq(gamePresenters.userId, userId))
    .orderBy(gamePresenters.name);
}
