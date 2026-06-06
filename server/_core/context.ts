import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getUserById } from "../db/users";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/**
 * Resolve the authenticated user from a raw Express request, applying the
 * same DB re-fetch + env admin-override rules tRPC uses. Shared by
 * `createContext` and the SSE endpoint so realtime auth and API auth never
 * diverge. Returns null for unauthenticated / failed auth.
 */
export async function authenticateUser(
  req: CreateExpressContextOptions["req"]
): Promise<User | null> {
  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(req);
    // Re-fetch the user from the DB so role/email changes (e.g. an
    // admin promoting another user) take effect immediately instead
    // of waiting for the auth-SDK token cache to expire.
    if (user?.id) {
      try {
        const fresh = await getUserById(user.id);
        if (fresh) user = fresh;
      } catch {
        // Best-effort — fall back to the SDK-cached user on DB error.
      }
    }
    // Env-based admin override — OWNER_OPEN_ID / ADMIN_EMAILS treated as
    // admin without touching the DB (bootstrap + survives DB resets).
    if (user) {
      const isOwnerByOpenId = ENV.ownerOpenId && user.openId === ENV.ownerOpenId;
      const isAdminByEmail = !!user.email && ENV.adminEmails.includes(user.email.trim().toLowerCase());
      if (isOwnerByOpenId || isAdminByEmail) {
        user = { ...user, role: "admin" };
      }
    }
  } catch {
    // Authentication is optional for public procedures.
    user = null;
  }
  return user;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = await authenticateUser(opts.req);
  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
