import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db module with attendance and health-related functions
vi.mock(import("./db"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getOrCreateAttendance: vi.fn().mockResolvedValue({
      id: 1,
      gamePresenterId: 10,
      month: 1,
      year: 2026,
      mistakes: 3,
      extraShifts: 1,
      lateToWork: 0,
      missedDays: 0,
      sickLeaves: 0,
      remarks: "",
    }),
    updateAttendance: vi.fn().mockResolvedValue({
      id: 1,
      gamePresenterId: 10,
      month: 1,
      year: 2026,
      mistakes: 3,
      extraShifts: 2,
      lateToWork: 1,
      missedDays: 0,
      sickLeaves: 0,
      remarks: "Good performance",
    }),
    bulkUpdateAttendance: vi.fn().mockResolvedValue({ updated: 3 }),
    getTeamAttendanceSummary: vi.fn().mockResolvedValue({
      items: [
        {
          gamePresenter: { id: 10, name: "John Doe" },
          attendance: { mistakes: 3, extraShifts: 1, lateToWork: 0, missedDays: 0, sickLeaves: 0, remarks: "" },
          monthlyStats: { mistakes: 3, attitude: 4, totalGames: 500 },
        },
        {
          gamePresenter: { id: 11, name: "Jane Smith" },
          attendance: null,
          monthlyStats: { mistakes: 1, attitude: 5, totalGames: 600 },
        },
      ],
      totals: { mistakes: 4, extraShifts: 1, lateToWork: 0, missedDays: 0, sickLeaves: 0 },
    }),
    getAdminDashboardStats: vi.fn().mockResolvedValue({
      totalUsers: 5,
      totalTeams: 3,
      totalGPs: 36,
      totalEvaluations: 150,
      totalReports: 10,
      recentReports: [],
      recentUsers: [],
    }),
    getFmTeamById: vi.fn().mockResolvedValue({ id: 1, teamName: "Team Alpha", floorManagerName: "John", userId: 1 }),
    getAllFmTeams: vi.fn().mockResolvedValue([
      { id: 1, teamName: "Team Alpha", floorManagerName: "John" },
    ]),
    getFmTeamsByUserId: vi.fn().mockResolvedValue([
      { id: 1, teamName: "Team Alpha", floorManagerName: "John" },
    ]),
    getGamePresenterById: vi.fn().mockResolvedValue({
      id: 10,
      name: "John Doe",
      userId: 1,
      teamId: 1,
    }),
    getAttendanceByTeamMonth: vi.fn().mockResolvedValue([
      {
        gamePresenter: { id: 10, name: "John Doe" },
        attendance: { id: 1, mistakes: 3, extraShifts: 1, lateToWork: 0, missedDays: 0, sickLeaves: 0, remarks: "" },
        monthlyStats: { mistakes: 3, attitude: 4, totalGames: 500 },
      },
      {
        gamePresenter: { id: 11, name: "Jane Smith" },
        attendance: null,
        monthlyStats: { mistakes: 1, attitude: 5, totalGames: 600 },
      },
    ]),
  };
});

// Mock other modules that routers.ts imports
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({ choices: [{ message: { content: "test" } }] }),
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test", url: "https://test.com/file" }),
}));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));
vi.mock("./_core/email", () => ({
  sendReportEmail: vi.fn().mockResolvedValue(true),
  sendEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock("./scheduledReports", () => ({
  runMonthlyReportGeneration: vi.fn().mockResolvedValue(undefined),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@test.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
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

function createFMContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "fm-user",
    email: "fm@test.com",
    name: "FM User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
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

function createUnauthContext(): TrpcContext {
  return {
    user: null,
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

describe("Server Health Endpoint", () => {
  it("returns health data for admin users", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.serverHealth();

    expect(result).toBeDefined();
    expect(result.status).toBe("ok");
    expect(result.timestamp).toBeDefined();
    expect(typeof result.uptime).toBe("number");
    expect(result.uptime).toBeGreaterThan(0);
    expect(result.nodeVersion).toMatch(/^v\d+/);
    expect(typeof result.latency).toBe("number");
    expect(result.memory).toBeDefined();
    expect(typeof result.memory.heapUsed).toBe("number");
    expect(typeof result.memory.heapTotal).toBe("number");
    expect(typeof result.memory.rss).toBe("number");
    expect(result.database).toBeDefined();
    expect(result.database.status).toBe("connected");
    expect(typeof result.database.latency).toBe("number");
    expect(result.environment).toBeDefined();
  });

  it("rejects health check for non-admin users", async () => {
    const ctx = createFMContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.dashboard.serverHealth()).rejects.toThrow();
  });

  it("rejects health check for unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.dashboard.serverHealth()).rejects.toThrow();
  });

  it("returns memory usage in MB", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.serverHealth();

    expect(result.memory.heapUsed).toBeGreaterThan(0);
    expect(result.memory.heapTotal).toBeGreaterThanOrEqual(result.memory.heapUsed);
    expect(result.memory.rss).toBeGreaterThan(0);
  });

  it("returns valid ISO timestamp", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.serverHealth();

    const date = new Date(result.timestamp);
    expect(date.getTime()).not.toBeNaN();
  });
});

describe("Attendance Team Summary", () => {
  it("returns team attendance summary for admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attendance.teamSummary({
      teamId: 1,
      month: 1,
      year: 2026,
    });

    expect(result).toBeDefined();
    expect(result.items).toHaveLength(2);
    expect(result.items[0].gamePresenter.name).toBe("John Doe");
    expect(result.items[0].attendance).toBeDefined();
    expect(result.items[0].attendance?.mistakes).toBe(3);
    expect(result.items[1].gamePresenter.name).toBe("Jane Smith");
    expect(result.items[1].attendance).toBeNull();
    expect(result.totals.mistakes).toBe(4);
  });

  it("rejects attendance data for FM user accessing another team", async () => {
    // FM user (id: 2) tries to access team owned by user id: 1
    const ctx = createFMContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.attendance.teamSummary({
        teamId: 1,
        month: 1,
        year: 2026,
      })
    ).rejects.toThrow();
  });
});

describe("Attendance Bulk Update", () => {
  it("bulk updates attendance for admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attendance.bulkUpdate({
      teamId: 1,
      month: 1,
      year: 2026,
      updates: [
        { gpId: 10, extraShifts: 2, lateToWork: 1, missedDays: 0, sickLeaves: 0, remarks: "Good" },
        { gpId: 11, extraShifts: 0, lateToWork: 0, missedDays: 1, sickLeaves: 0 },
      ],
    });

    expect(result).toBeDefined();
    expect(result.updated).toBe(2); // 2 updates in the input array
  });

  it("rejects bulk update for unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.attendance.bulkUpdate({
        teamId: 1,
        month: 1,
        year: 2026,
        updates: [{ gpId: 10, extraShifts: 1, lateToWork: 0, missedDays: 0, sickLeaves: 0 }],
      })
    ).rejects.toThrow();
  });
});

describe("Attendance Get or Create", () => {
  it("returns existing or new attendance record", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attendance.getOrCreate({
      gpId: 10,
      month: 1,
      year: 2026,
    });

    expect(result).toBeDefined();
    expect(result.gamePresenterId).toBe(10);
    expect(result.month).toBe(1);
    expect(result.year).toBe(2026);
  });
});

describe("Attendance Update", () => {
  it("updates individual attendance record", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.attendance.update({
      gpId: 10,
      month: 1,
      year: 2026,
      extraShifts: 2,
      lateToWork: 1,
      remarks: "Good performance",
    });

    expect(result).toBeDefined();
    // The update procedure returns { success: true }
    expect(result.success).toBe(true);
  });
});
