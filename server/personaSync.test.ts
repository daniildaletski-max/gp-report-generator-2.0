/**
 * Tests for personaSync router
 * Tests access control and basic procedure availability.
 * Note: Actual Persona scraping is not tested here (requires live Persona connection).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the personaScraper to avoid real network calls
vi.mock("./services/personaScraper", () => ({
  syncPersonaAttendance: vi.fn().mockResolvedValue({
    success: true,
    workers: [
      { name: "Test Worker", workerId: 1, projectId: 4728, sickLeaves: 2, missedDays: 1, extraShifts: 0 },
    ],
    month: 4,
    year: 2026,
  }),
  closeBrowser: vi.fn(),
}));

// Mock db calls
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getFmTeamById: vi.fn().mockResolvedValue({
      id: 1,
      teamName: "Team Nu",
      floorManagerName: "Test FM",
      userId: 1,
      personaProjectId: 4728,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getTeamWithGPs: vi.fn().mockResolvedValue({
      id: 1,
      teamName: "Team Nu",
      gamePresenters: [
        { id: 10, name: "Test Worker", teamId: 1, userId: 1, createdAt: new Date(), updatedAt: new Date() },
      ],
    }),
    getOrCreateAttendance: vi.fn().mockResolvedValue({ id: 100, gpId: 10, month: 4, year: 2026 }),
    updateAttendance: vi.fn().mockResolvedValue(undefined),
    getFmTeamsByUser: vi.fn().mockResolvedValue([]),
    getAllFmTeams: vi.fn().mockResolvedValue([]),
  };
});

function createUserContext(role: "user" | "admin" = "user", userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      email: `user${userId}@example.com`,
      name: `User ${userId}`,
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      hostname: "example.manus.space",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("personaSync router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTeamsWithProjectIds", () => {
    it("returns teams for authenticated user", async () => {
      const ctx = createUserContext("user", 1);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.personaSync.getTeamsWithProjectIds();
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns all teams for admin", async () => {
      const ctx = createUserContext("admin", 1);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.personaSync.getTeamsWithProjectIds();
      expect(Array.isArray(result)).toBe(true);
    });

    it("throws UNAUTHORIZED when not logged in", async () => {
      const ctx: TrpcContext = {
        user: null,
        req: { protocol: "https", hostname: "example.manus.space", headers: {} } as TrpcContext["req"],
        res: { clearCookie: vi.fn(), setHeader: vi.fn() } as unknown as TrpcContext["res"],
      };
      const caller = appRouter.createCaller(ctx);
      await expect(caller.personaSync.getTeamsWithProjectIds()).rejects.toThrow();
    });
  });

  describe("syncTeam", () => {
    it("syncs team and returns match results for team owner", async () => {
      const ctx = createUserContext("user", 1);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.personaSync.syncTeam({ teamId: 1, month: 4, year: 2026 });
      expect(result.success).toBe(true);
      expect(typeof result.matched).toBe("number");
      expect(typeof result.unmatched).toBe("number");
      expect(Array.isArray(result.matchDetails)).toBe(true);
    });

    it("throws FORBIDDEN for non-owner user", async () => {
      const { getFmTeamById } = await import("./db");
      vi.mocked(getFmTeamById).mockResolvedValueOnce({
        id: 1,
        teamName: "Team Nu",
        floorManagerName: "Other FM",
        userId: 99, // different user
        personaProjectId: 4728,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const ctx = createUserContext("user", 1); // user 1 doesn't own team (userId=99)
      const caller = appRouter.createCaller(ctx);
      await expect(caller.personaSync.syncTeam({ teamId: 1, month: 4, year: 2026 })).rejects.toThrow();
    });

    it("admin can sync any team", async () => {
      const { getFmTeamById } = await import("./db");
      vi.mocked(getFmTeamById).mockResolvedValueOnce({
        id: 1,
        teamName: "Team Nu",
        floorManagerName: "Other FM",
        userId: 99,
        personaProjectId: 4728,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const ctx = createUserContext("admin", 1);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.personaSync.syncTeam({ teamId: 1, month: 4, year: 2026 });
      expect(result.success).toBe(true);
    });
  });

  describe("setProjectId", () => {
    it("allows admin to set project ID", async () => {
      const ctx = createUserContext("admin", 1);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.personaSync.setProjectId({ teamId: 1, personaProjectId: 4728 });
      expect(result.success).toBe(true);
    });

    it("throws FORBIDDEN for non-admin user", async () => {
      const ctx = createUserContext("user", 1);
      const caller = appRouter.createCaller(ctx);
      await expect(caller.personaSync.setProjectId({ teamId: 1, personaProjectId: 4728 })).rejects.toThrow();
    });
  });
});
