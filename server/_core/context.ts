import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getUserById } from "../db/users";

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
