import { describe, it, expect, vi } from "vitest";

// Mock node-cron before importing the module. We expose both
// `schedule` (used to register the cron) and `validate` (used inside
// `initScheduledReports` to fall back to a known-good expression when
// MONTHLY_REPORTS_CRON env var holds something invalid). The mock
// validates trivially — that's good enough for unit tests.
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
    validate: vi.fn((expr: string) => typeof expr === "string" && expr.length > 0),
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
  // Used by the partial-row cleanup path on retry days.
  deleteReport: vi.fn().mockResolvedValue(undefined),
  // Used by the legacy-backfill stamp path on retry days.
  updateReport: vi.fn().mockResolvedValue(undefined),
  // Used by the new pre-report Persona sync step
  getAllFmTeams: vi.fn().mockResolvedValue([]),
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

    // Cron fires at 06:00 on each of days 5-10 in Europe/Tallinn.
    // Day-5 is the primary run; days 6-10 are an idempotent safety
    // net that re-runs only for teams whose report didn't make it on
    // day 5 (transient DB / LLM / email failure).
    expect(cron.default.schedule).toHaveBeenCalledWith(
      "0 6 5-10 * *",
      expect.any(Function),
      expect.objectContaining({ timezone: "Europe/Tallinn" }),
    );
  });

  it("should use correct cron expression for days 5-10 of each month at 06:00", async () => {
    const cron = await import("node-cron");
    const { initScheduledReports } = await import("./scheduledReports");

    initScheduledReports();

    const calls = (cron.default.schedule as any).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe("0 6 5-10 * *"); // minute 0, hour 6, days 5 through 10, every month, every weekday
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

  it("should skip teams whose report is FULLY done (excelFileUrl + emailDelivery)", async () => {
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
    // Existing row that's truly done — workbook uploaded AND email
    // delivery was confirmed. The retry must skip these.
    (db.getReportByTeamMonthYear as any).mockResolvedValueOnce({
      id: 999,
      excelFileUrl: "https://example.com/r.xlsx",
      reportData: { emailDelivery: { sentAt: "2026-04-05T06:00:00Z", success: true } },
    });

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    expect(db.createReport).not.toHaveBeenCalled();
  });

  it("should treat no-recipient rows as terminal (don't loop forever)", async () => {
    // Row exists with excelFileUrl set but emailDelivery.reason ===
    // "no-recipient" — the team owner has no email on file. Cron
    // must NOT keep rebuilding this every day 6-10.
    const db = await import("./db");
    (db.getAllUsers as any).mockResolvedValueOnce([
      { user: { id: 1, role: "user", email: null, name: "No-Email User" }, team: null },
    ]);
    (db.getFmTeamsByUser as any).mockResolvedValueOnce([
      { id: 100, teamName: "Test Team", floorManagerName: "Test FM", userId: 1 },
    ]);
    (db.getFmTeamById as any).mockResolvedValueOnce({
      id: 100, teamName: "Test Team", floorManagerName: "Test FM", userId: 1,
    });
    (db.getReportByTeamMonthYear as any).mockResolvedValueOnce({
      id: 997,
      excelFileUrl: "https://example.com/r.xlsx",
      reportData: { emailDelivery: { sentAt: null, success: false, reason: "no-recipient" } },
    });
    (db.createReport as any).mockClear();
    (db.deleteReport as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    // No regeneration, no deletion — fully terminal.
    expect(db.createReport).not.toHaveBeenCalled();
    expect(db.deleteReport).not.toHaveBeenCalled();
  });

  it("should backfill + skip legacy rows (excelFileUrl set, no delivery marker, old updatedAt)", async () => {
    // Pre-merge rows have `excelFileUrl` set (workbook was uploaded
    // and the email was sent BY THE OLD CODE PATH that didn't write
    // a delivery marker). Without this guard, the retry-email branch
    // would re-spam every FM with their prior-month reports on the
    // first day-6+ cron tick.
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
    // Old row, last touched 5 days ago, no delivery marker.
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    (db.getReportByTeamMonthYear as any).mockResolvedValueOnce({
      id: 996,
      excelFileUrl: "https://example.com/legacy.xlsx",
      updatedAt: fiveDaysAgo,
      reportData: {},
    });
    (db.updateReport as any).mockClear();
    (db.createReport as any).mockClear();
    (db.deleteReport as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    // Backfill stamp written.
    expect(db.updateReport).toHaveBeenCalledWith(
      996,
      expect.objectContaining({
        reportData: expect.objectContaining({
          emailDelivery: expect.objectContaining({ reason: "legacy-backfill" }),
        }),
      }),
    );
    // No email re-send, no regeneration.
    expect(db.createReport).not.toHaveBeenCalled();
    expect(db.deleteReport).not.toHaveBeenCalled();
  });

  it("should retry a row with no excelFileUrl (partial workbook)", async () => {
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
    // Partial row — workbook never produced. Cron must delete this
    // and regenerate fresh.
    (db.getReportByTeamMonthYear as any).mockResolvedValueOnce({
      id: 998,
      excelFileUrl: null,
      reportData: {},
    });
    // Empty stats so the test stops short of the LLM/Excel path —
    // we only need to verify the partial-row deletion happened.
    (db.getGPMonthlyStats as any).mockResolvedValueOnce([]);
    (db.deleteReport as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    // The partial row must have been cleaned up. Whether the rest of
    // the path generated a fresh row is irrelevant for this test —
    // the contract is "don't let a partial row block the retry".
    expect(db.deleteReport).toHaveBeenCalledWith(998);
  });

  it("should NOT spam owner notifications on retry-day no-op runs", async () => {
    // After a successful day-5 run, days 6-10 see every team already
    // reported and produce 0 generations. The retry-day code path
    // must stay silent on the no-op notification — otherwise the
    // project owner gets 5 "No Reports Generated" emails per month.
    const db = await import("./db");
    const { notifyOwner } = await import("./_core/notification");

    (db.getAllUsers as any).mockResolvedValueOnce([]);
    (notifyOwner as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration({ isPrimaryRun: false });

    // No "Generated" notification (nothing generated) AND no "No
    // Reports Generated" notification (this is a retry-day no-op).
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("should still notify on day-5 no-op so genuine empty months are visible", async () => {
    const db = await import("./db");
    const { notifyOwner } = await import("./_core/notification");

    (db.getAllUsers as any).mockResolvedValueOnce([]);
    (notifyOwner as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration({ isPrimaryRun: true });

    // Primary run, no reports generated → owner gets the "no data"
    // heads-up. This is the legacy behaviour we're preserving.
    expect(notifyOwner).toHaveBeenCalledTimes(1);
    expect((notifyOwner as any).mock.calls[0][0].title).toMatch(/No Reports Generated/);
  });

  it("should iterate per user and per user's own teams (per-FM routing)", async () => {
    // Two FMs, each owns a different team. The cron must call the
    // per-team report generator with EACH user's id/email — never
    // mix one FM's email with another FM's team.
    const db = await import("./db");

    (db.getAllUsers as any).mockResolvedValueOnce([
      { user: { id: 1, role: "user", email: "fm-a@example.com", name: "FM A" }, team: null },
      { user: { id: 2, role: "user", email: "fm-b@example.com", name: "FM B" }, team: null },
    ]);
    // getFmTeamsByUser is called twice — once per user. Return the
    // appropriate team for each call. (mockResolvedValueOnce queues.)
    (db.getFmTeamsByUser as any)
      .mockResolvedValueOnce([{ id: 10, teamName: "Team A", floorManagerName: "FM A", userId: 1 }])
      .mockResolvedValueOnce([{ id: 20, teamName: "Team B", floorManagerName: "FM B", userId: 2 }]);
    // Both teams have reports already so we can stop short of the
    // Excel + email path (the actual delivery uses Resend which we
    // don't want to hit). What we're verifying here is the iteration
    // shape: each user is queried for their OWN teams only.
    (db.getFmTeamById as any)
      .mockResolvedValueOnce({ id: 10, teamName: "Team A", floorManagerName: "FM A", userId: 1 })
      .mockResolvedValueOnce({ id: 20, teamName: "Team B", floorManagerName: "FM B", userId: 2 });
    (db.getReportByTeamMonthYear as any)
      .mockResolvedValueOnce({ id: 100 })
      .mockResolvedValueOnce({ id: 101 });

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    // getFmTeamsByUser must have been called once per user, scoped to
    // that user's id. This is what guarantees FMs don't see each
    // other's teams in the cron run.
    const teamsByUserCalls = (db.getFmTeamsByUser as any).mock.calls;
    const calledUserIds = teamsByUserCalls.map((c: any[]) => c[0]).sort();
    expect(calledUserIds).toContain(1);
    expect(calledUserIds).toContain(2);
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
