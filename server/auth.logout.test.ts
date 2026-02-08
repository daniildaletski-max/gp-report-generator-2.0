import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[]; setHeaders: [string, unknown][] } {
  const clearedCookies: CookieCall[] = [];
  const setHeaders: [string, unknown][] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      hostname: "example.manus.space",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
      setHeader: (name: string, value: unknown) => {
        setHeaders.push([name, value]);
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies, setHeaders };
}

describe("auth.logout", () => {
  it("clears the session cookie with multiple strategies and reports success", async () => {
    const { ctx, clearedCookies, setHeaders } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    // Should clear cookies multiple times (computed domain, no domain, hostname, .hostname)
    expect(clearedCookies.length).toBeGreaterThanOrEqual(2);
    // All cleared cookies should target the session cookie
    for (const call of clearedCookies) {
      expect(call.name).toBe(COOKIE_NAME);
      expect(call.options.path).toBe("/");
      expect(call.options.maxAge).toBe(0);
    }
    // Should also set expired cookie headers as fallback
    expect(setHeaders.length).toBeGreaterThanOrEqual(1);
    const setCookieHeader = setHeaders.find(([name]) => name === "Set-Cookie");
    expect(setCookieHeader).toBeDefined();
  });
});
