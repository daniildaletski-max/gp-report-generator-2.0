import { describe, it, expect, vi } from "vitest";

// Mock node-cron before importing the module
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn((expression: string, callback: () => void, options?: any) => {
      return {
        start: vi.fn(),
        stop: vi.fn(),
        expression,
        options,
        callback,
      };
    }),
  },
}));

// Mock the database module
vi.mock("./db", () => ({
  getAllUsers: vi.fn().mockResolvedValue([]),
  getFmTeamsByUser: vi.fn().mockResolvedValue([]),
  getFmTeamById: vi.fn().mockResolvedValue(null),
  getReportByTeamMonthYear: vi.fn().mockResolvedValue(null),
  getGPMonthlyStats: vi.fn().mockResolvedValue([]),
  getAttendanceByTeamMonth: vi.fn().mockResolvedValue([]),
  getErrorCountByGP: vi.fn().mockResolvedValue([]),
  getGamePresentersByTeam: vi.fn().mockResolvedValue([]),
  getAttitudeScreenshotsForGP: vi.fn().mockResolvedValue([]),
  createReport: vi.fn().mockResolvedValue({ id: 1 }),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Auto-generated content" } }],
  }),
}));

// Mock the notification module
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

describe("Scheduled Reports", () => {
  it("should initialize cron job with correct schedule", async () => {
    const cron = await import("node-cron");
    const { initScheduledReports } = await import("./scheduledReports");

    initScheduledReports();

    expect(cron.default.schedule).toHaveBeenCalledWith(
      "0 6 1 * *",
      expect.any(Function),
      expect.objectContaining({ timezone: "Europe/Tallinn" }),
    );
  });

  it("should use correct cron expression for 1st of each month at 06:00", async () => {
    const cron = await import("node-cron");
    const { initScheduledReports } = await import("./scheduledReports");

    initScheduledReports();

    const calls = (cron.default.schedule as any).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe("0 6 1 * *"); // minute 0, hour 6, day 1, every month, every weekday
  });

  it("should export runMonthlyReportGeneration for manual triggering", async () => {
    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    expect(typeof runMonthlyReportGeneration).toBe("function");
  });

  it("runMonthlyReportGeneration should handle empty user list gracefully", async () => {
    const db = await import("./db");
    (db.getAllUsers as any).mockResolvedValueOnce([]);

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    // Should not throw
    await expect(runMonthlyReportGeneration()).resolves.not.toThrow();
  });

  it("should skip teams with no evaluation data", async () => {
    const db = await import("./db");
    (db.getAllUsers as any).mockResolvedValueOnce([
      { user: { id: 1, role: "user", email: "test@test.com", name: "Test User" }, team: null },
    ]);
    (db.getFmTeamsByUser as any).mockResolvedValueOnce([
      { id: 100, teamName: "Test Team", floorManagerName: "Test FM", userId: 1 },
    ]);
    (db.getFmTeamById as any).mockResolvedValueOnce({
      id: 100, teamName: "Test Team", floorManagerName: "Test FM", userId: 1,
    });
    (db.getReportByTeamMonthYear as any).mockResolvedValueOnce(null); // No existing report
    (db.getGPMonthlyStats as any).mockResolvedValueOnce([]); // No stats = skip

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    // createReport should NOT have been called since there's no data
    expect(db.createReport).not.toHaveBeenCalled();
  });

  it("should skip teams that already have a report", async () => {
    const db = await import("./db");
    (db.getAllUsers as any).mockResolvedValueOnce([
      { user: { id: 1, role: "user", email: "test@test.com", name: "Test User" }, team: null },
    ]);
    (db.getFmTeamsByUser as any).mockResolvedValueOnce([
      { id: 100, teamName: "Test Team", floorManagerName: "Test FM", userId: 1 },
    ]);
    (db.getFmTeamById as any).mockResolvedValueOnce({
      id: 100, teamName: "Test Team", floorManagerName: "Test FM", userId: 1,
    });
    (db.getReportByTeamMonthYear as any).mockResolvedValueOnce({ id: 999 }); // Existing report

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    // createReport should NOT have been called since report already exists
    expect(db.createReport).not.toHaveBeenCalled();
  });

  it("should prevent overlapping monthly generation runs", async () => {
    const db = await import("./db");

    (db.getAllUsers as any).mockClear();

    let resolveGetAllUsers: ((value: unknown[]) => void) | null = null;
    const pendingUsers = new Promise<unknown[]>((resolve) => {
      resolveGetAllUsers = resolve;
    });

    (db.getAllUsers as any).mockReturnValueOnce(pendingUsers);

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    const firstRun = runMonthlyReportGeneration();
    const secondRun = runMonthlyReportGeneration();

    await secondRun;
    expect(db.getAllUsers).toHaveBeenCalledTimes(1);

    resolveGetAllUsers?.([]);
    await firstRun;
  });
});
