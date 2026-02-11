/**
 * User Database Operations
 * Handles user CRUD, authentication, team assignment, and role management
 */
import { eq, desc } from "drizzle-orm";
import { users, fmTeams, InsertUser, User } from "../../drizzle/schema";
import { ENV } from '../_core/env';
import { getDb } from "./connection";
import { createLogger } from "../services/logger";

const log = createLogger("DB:Users");

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    log.warn("Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    log.error("Failed to upsert user", error instanceof Error ? error : undefined);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    log.warn("Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select({ user: users, team: fmTeams })
    .from(users)
    .leftJoin(fmTeams, eq(users.teamId, fmTeams.id))
    .orderBy(users.name);
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getUserWithTeam(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ user: users, team: fmTeams })
    .from(users)
    .leftJoin(fmTeams, eq(users.teamId, fmTeams.id))
    .where(eq(users.id, userId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateUserTeam(userId: number, teamId: number | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ teamId }).where(eq(users.id, userId));
}

export async function updateUserEmail(userId: number, email: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ email }).where(eq(users.id, userId));
}

export async function updateUserRole(userId: number, role: 'user' | 'admin'): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function deleteUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(users).where(eq(users.id, userId));
}

export async function updateUserFromInvitation(userId: number, teamId: number | null, role: 'user' | 'admin'): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ teamId, role }).where(eq(users.id, userId));
}
