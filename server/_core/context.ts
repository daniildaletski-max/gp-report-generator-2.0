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

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
    // Re-fetch the user from the DB so role/email changes (e.g. an
    // admin promoting another user) take effect immediately instead
    // of waiting for the auth-SDK token cache to expire. Without
    // this a freshly-promoted admin keeps hitting "Access denied"
    // until they sign out and sign back in.
    if (user?.id) {
      try {
        const fresh = await getUserById(user.id);
        if (fresh) user = fresh;
      } catch {
        // Best-effort — fall back to the SDK-cached user on DB error.
      }
    }
    // Env-based admin override — any email listed in `ADMIN_EMAILS`
    // is treated as admin without touching the DB. Lets the system
    // creator keep admin access across DB resets and bootstrap
    // a brand-new install before any DB-level admin exists.
    if (user?.email && ENV.adminEmails.includes(user.email.trim().toLowerCase())) {
      user = { ...user, role: "admin" };
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
