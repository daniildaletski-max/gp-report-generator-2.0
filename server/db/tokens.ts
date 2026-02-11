/**
 * GP Access Tokens & Invitations Database Operations
 */
import { eq, and, desc, lte } from "drizzle-orm";
import { gpAccessTokens, InsertGpAccessToken, GpAccessToken, gamePresenters, invitations, InsertInvitation, Invitation, fmTeams, users, User, FmTeam } from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================
// GP ACCESS TOKENS
// ============================================

export async function createGpAccessToken(data: InsertGpAccessToken): Promise<GpAccessToken> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(gpAccessTokens).values(data);
  const newToken = await db.select().from(gpAccessTokens).where(eq(gpAccessTokens.id, Number(result[0].insertId))).limit(1);
  return newToken[0];
}

export async function getGpAccessTokenByToken(token: string): Promise<GpAccessToken | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(gpAccessTokens).where(and(eq(gpAccessTokens.token, token), eq(gpAccessTokens.isActive, 1))).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getGpAccessTokenByGpId(gpId: number): Promise<GpAccessToken | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(gpAccessTokens).where(and(eq(gpAccessTokens.gamePresenterId, gpId), eq(gpAccessTokens.isActive, 1))).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getGpAccessTokenById(id: number): Promise<GpAccessToken | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(gpAccessTokens).where(eq(gpAccessTokens.id, id)).limit(1);
  return result[0] || null;
}

export async function getAllGpAccessTokens() {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ token: gpAccessTokens, gp: gamePresenters }).from(gpAccessTokens).leftJoin(gamePresenters, eq(gpAccessTokens.gamePresenterId, gamePresenters.id)).orderBy(desc(gpAccessTokens.createdAt));
}

export async function getGpAccessTokensByTeam(teamId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ token: gpAccessTokens, gp: gamePresenters }).from(gpAccessTokens).leftJoin(gamePresenters, eq(gpAccessTokens.gamePresenterId, gamePresenters.id)).where(eq(gamePresenters.teamId, teamId)).orderBy(desc(gpAccessTokens.createdAt));
}

export async function getGpAccessTokensByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ token: gpAccessTokens, gp: gamePresenters }).from(gpAccessTokens).leftJoin(gamePresenters, eq(gpAccessTokens.gamePresenterId, gamePresenters.id)).where(eq(gamePresenters.userId, userId)).orderBy(desc(gpAccessTokens.createdAt));
}

export async function deactivateGpAccessToken(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.update(gpAccessTokens).set({ isActive: 0 }).where(eq(gpAccessTokens.id, id));
  return true;
}

export async function updateGpAccessTokenLastAccess(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(gpAccessTokens).set({ lastAccessedAt: new Date() }).where(eq(gpAccessTokens.id, id));
}

// ============================================
// INVITATIONS
// ============================================

export async function createInvitation(data: InsertInvitation): Promise<Invitation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invitations).values(data);
  const newInvitation = await db.select().from(invitations).where(eq(invitations.id, Number(result[0].insertId))).limit(1);
  return newInvitation[0];
}

export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getInvitationByEmail(email: string): Promise<Invitation | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(invitations).where(and(eq(invitations.email, email.toLowerCase()), eq(invitations.status, 'pending'))).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllInvitations(): Promise<Array<Invitation & { team?: FmTeam | null; createdBy?: User | null }>> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({ invitation: invitations, team: fmTeams, createdBy: users })
    .from(invitations).leftJoin(fmTeams, eq(invitations.teamId, fmTeams.id)).leftJoin(users, eq(invitations.createdById, users.id)).orderBy(desc(invitations.createdAt));
  return result.map(r => ({ ...r.invitation, team: r.team, createdBy: r.createdBy }));
}

export async function updateInvitationStatus(id: number, status: 'pending' | 'accepted' | 'expired' | 'revoked', usedById?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const updateData: Partial<Invitation> = { status };
  if (usedById) { updateData.usedById = usedById; updateData.usedAt = new Date(); }
  await db.update(invitations).set(updateData).where(eq(invitations.id, id));
}

export async function getInvitationStats() {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 };
  const allInvitations = await db.select().from(invitations);
  const stats = { total: allInvitations.length, pending: 0, accepted: 0, expired: 0, revoked: 0 };
  const now = new Date();
  for (const inv of allInvitations) {
    if (inv.status === 'accepted') stats.accepted++;
    else if (inv.status === 'revoked') stats.revoked++;
    else if (inv.status === 'expired' || (inv.status === 'pending' && inv.expiresAt < now)) stats.expired++;
    else stats.pending++;
  }
  return stats;
}

export async function expireOldInvitations(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.update(invitations).set({ status: 'expired' }).where(and(eq(invitations.status, 'pending'), lte(invitations.expiresAt, new Date())));
  return result[0].affectedRows || 0;
}

export async function deleteInvitation(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(invitations).where(eq(invitations.id, id));
}
