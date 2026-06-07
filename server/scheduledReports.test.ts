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

// Mock the database module. With company-wide reports the cron keys off
// getCompanyReportByMonthYear (one report per month, teamId NULL) and
// only uses getAllUsers to resolve an email recipient.
vi.mock("./db", () => ({
  getAllUsers: vi.fn().mockResolvedValue([]),
  getCompanyReportByMonthYear: vi.fn().mockResolvedValue(null),
  createReport: vi.fn().mockResolvedValue({ id: 1 }),
  deleteReport: vi.fn().mockResolvedValue(undefined),
  updateReport: vi.fn().mockResolvedValue(undefined),
}));

// Mock the shared report helpers — the cron reuses the on-demand path's
// data aggregation + AI narratives + Excel/email builder. Stubbing them
// keeps these unit tests focused on the cron's retry/terminal state
// machine without hitting the LLM / storage / Resend.
vi.mock("./routers/_shared", () => ({
  buildCompanyReportContext: vi.fn().mockResolvedValue({
    monthName: "April",
    stats: [],
    attendance: [],
    dataContext: "ctx",
    avgTotal: 0,
    avgAppearance: 0,
    avgGamePerf: 0,
    topPerformers: [],
    needsImprovement: [],
    totals: {
      totalMistakes: 0, totalExtraShifts: 0, totalLate: 0, totalMissed: 0,
      totalSick: 0, totalErrors: 0, totalPositiveAttitude: 0, totalNegativeAttitude: 0,
    },
  }),
  genManagementSummary: vi.fn().mockResolvedValue("summary"),
  genGoals: vi.fn().mockResolvedValue("goals"),
  genOverview: vi.fn().mockResolvedValue("overview"),
  generateExcelAndEmail: vi.fn().mockResolvedValue({ emailSent: true }),
}));

// Mock the notification module
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

const ADMIN = { user: { id: 1, role: "admin", email: "admin@example.com", name: "Admin" }, team: null };
const statsWithData = [{ gpName: "GP One", avgTotalScore: 20, avgAppearanceScore: 11, avgGamePerfScore: 9, evaluationCount: 3 }];

describe("Scheduled Reports", () => {
  it("should initialize cron job with correct schedule", async () => {
    const cron = await import("node-cron");
    const { initScheduledReports } = await import("./scheduledReports");

    initScheduledReports();

    // Cron fires at 06:00 on each of days 5-10 in Europe/Tallinn.
    // Day-5 is the primary run; days 6-10 are an idempotent safety
    // net that re-runs only if the month's report didn't make it on
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

  it("runMonthlyReportGeneration should handle empty data gracefully", async () => {
    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    // No existing report + no stats → returns cleanly, no throw.
    await expect(runMonthlyReportGeneration()).resolves.not.toThrow();
  });

  it("should skip when there is no evaluation data for the month", async () => {
    const db = await import("./db");
    (db.getCompanyReportByMonthYear as any).mockResolvedValueOnce(null); // no existing report
    (db.createReport as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    // buildCompanyReportContext defaults to empty stats → nothing created.
    expect(db.createReport).not.toHaveBeenCalled();
  });

  it("should generate a single company report when data exists", async () => {
    const db = await import("./db");
    const shared = await import("./routers/_shared");

    (db.getAllUsers as any).mockResolvedValueOnce([ADMIN]);
    (db.getCompanyReportByMonthYear as any).mockResolvedValueOnce(null);
    (shared.buildCompanyReportContext as any).mockResolvedValueOnce({
      monthName: "April", stats: statsWithData, attendance: [], dataContext: "ctx",
      avgTotal: 20, avgAppearance: 11, avgGamePerf: 9, topPerformers: [], needsImprovement: [],
      totals: { totalMistakes: 0, totalExtraShifts: 0, totalLate: 0, totalMissed: 0, totalSick: 0, totalErrors: 0, totalPositiveAttitude: 0, totalNegativeAttitude: 0 },
    });
    (db.createReport as any).mockClear();
    (shared.generateExcelAndEmail as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    // Exactly one report, company-wide (teamId NULL), then Excel + email.
    expect(db.createReport).toHaveBeenCalledTimes(1);
    expect((db.createReport as any).mock.calls[0][0]).toMatchObject({ teamId: null });
    expect(shared.generateExcelAndEmail).toHaveBeenCalledTimes(1);
  });

  it("should skip when the company report is FULLY done (excelFileUrl + emailDelivery)", async () => {
    const db = await import("./db");
    (db.getCompanyReportByMonthYear as any).mockResolvedValueOnce({
      id: 999,
      excelFileUrl: "https://example.com/r.xlsx",
      reportData: { emailDelivery: { sentAt: "2026-04-05T06:00:00Z", success: true } },
    });
    (db.createReport as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    expect(db.createReport).not.toHaveBeenCalled();
  });

  it("should treat a no-recipient row as terminal (don't loop forever)", async () => {
    // Row exists with excelFileUrl set but emailDelivery.reason ===
    // "no-recipient" — nobody has an email on file. Cron must NOT keep
    // rebuilding this every day 6-10.
    const db = await import("./db");
    (db.getCompanyReportByMonthYear as any).mockResolvedValueOnce({
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

  it("should re-send the email for a row whose delivery marker says success=false", async () => {
    // Day-5 cron uploaded the workbook but sendReportEmail returned
    // false (Resend down). The marker {success:false} signals the
    // retry path to re-attempt against the same row.
    const db = await import("./db");
    const shared = await import("./routers/_shared");
    (db.getCompanyReportByMonthYear as any).mockResolvedValueOnce({
      id: 995,
      excelFileUrl: "https://example.com/r.xlsx",
      reportData: { emailDelivery: { sentAt: "2026-04-05T06:00:00Z", success: false } },
    });
    (shared.generateExcelAndEmail as any).mockClear();
    (db.createReport as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    // Re-sent against the existing row; no fresh row created.
    expect(shared.generateExcelAndEmail).toHaveBeenCalledWith(expect.anything(), 995);
    expect(db.createReport).not.toHaveBeenCalled();
  });

  it("should bail (not duplicate-create) when deleteReport on a partial row fails", async () => {
    // A transient deleteReport failure followed by createReport would
    // leave both the stale partial row AND a fresh row for the same
    // month. The cron must skip this tick and retry tomorrow instead.
    const db = await import("./db");
    (db.getCompanyReportByMonthYear as any).mockResolvedValueOnce({
      id: 994,
      excelFileUrl: null,
      reportData: {},
    });
    (db.deleteReport as any).mockClear();
    (db.deleteReport as any).mockRejectedValueOnce(new Error("connection reset"));
    (db.createReport as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    expect(db.deleteReport).toHaveBeenCalledWith(994);
    expect(db.createReport).not.toHaveBeenCalled();
  });

  it("should delete + regenerate a partial row (no excelFileUrl)", async () => {
    const db = await import("./db");
    (db.getCompanyReportByMonthYear as any).mockResolvedValueOnce({
      id: 998,
      excelFileUrl: null,
      reportData: {},
    });
    // Empty stats so the test stops short of the Excel/email path — we
    // only need to verify the partial row was cleaned up.
    (db.deleteReport as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration();

    expect(db.deleteReport).toHaveBeenCalledWith(998);
  });

  it("should NOT spam owner notifications on retry-day no-op runs", async () => {
    // After a successful day-5 run, days 6-10 see the report already
    // done and produce no generation. The retry path must stay silent
    // on the no-op notification.
    const { notifyOwner } = await import("./_core/notification");
    const db = await import("./db");
    (db.getCompanyReportByMonthYear as any).mockResolvedValueOnce(null);
    (notifyOwner as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration({ isPrimaryRun: false });

    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("should still notify on day-5 no-op so genuine empty months are visible", async () => {
    const { notifyOwner } = await import("./_core/notification");
    const db = await import("./db");
    (db.getCompanyReportByMonthYear as any).mockResolvedValueOnce(null);
    (notifyOwner as any).mockClear();

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    await runMonthlyReportGeneration({ isPrimaryRun: true });

    // Primary run, nothing generated → owner gets the "no data" heads-up.
    expect(notifyOwner).toHaveBeenCalledTimes(1);
    expect((notifyOwner as any).mock.calls[0][0].title).toMatch(/None Generated/);
  });

  it("should prevent overlapping monthly generation runs", async () => {
    const db = await import("./db");
    (db.getCompanyReportByMonthYear as any).mockClear();

    let resolvePending: ((value: unknown) => void) | null = null;
    const pending = new Promise<unknown>((resolve) => {
      resolvePending = resolve;
    });
    (db.getCompanyReportByMonthYear as any).mockReturnValueOnce(pending);

    const { runMonthlyReportGeneration } = await import("./scheduledReports");
    const firstRun = runMonthlyReportGeneration();
    const secondRun = runMonthlyReportGeneration();

    await secondRun;
    // The second run hit the in-progress guard and returned without
    // starting a fresh generation — so the first await happened once.
    expect(db.getCompanyReportByMonthYear).toHaveBeenCalledTimes(1);

    resolvePending?.(null);
    await firstRun;
  });
});
