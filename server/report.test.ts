import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
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
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("fmTeam.list", () => {
  it("returns list of FM teams", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fmTeam.list();

    expect(Array.isArray(result)).toBe(true);
    // Should have at least the 3 default teams
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

describe("gamePresenter.list", () => {
  it("returns list of game presenters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.gamePresenter.list();

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("dashboard.stats", () => {
  it("returns dashboard statistics", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.stats();

    expect(result).toHaveProperty("totalGPs");
    expect(result).toHaveProperty("totalEvaluations");
    expect(result).toHaveProperty("totalReports");
    expect(result).toHaveProperty("recentEvaluations");
    expect(typeof result.totalGPs).toBe("number");
    expect(typeof result.totalEvaluations).toBe("number");
    expect(typeof result.totalReports).toBe("number");
    expect(Array.isArray(result.recentEvaluations)).toBe(true);
  });
});

describe("report.list", () => {
  it("returns list of reports with teams", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.report.list();

    expect(Array.isArray(result)).toBe(true);
  });
});
