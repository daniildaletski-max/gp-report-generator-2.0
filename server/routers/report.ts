import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { COMPANY_NAME, COMPANY_REPORT_LABEL } from "@shared/const";
import { notifyOwner } from "../_core/notification";
import { exportToGoogleSheets, isGoogleSheetsAvailable } from "../services/googleSheetsService";
import {
  generateExcelAndEmail,
  resolveReportRecipient,
  buildCompanyReportContext,
  genManagementSummary,
  genGoals,
  genOverview,
} from "./_shared";
import { generateExecutiveSummary } from "../services/executiveSummary";
import { createLogger } from "../services/logger";
const log = createLogger("Router");

/**
 * Company-wide monthly reporting.
 *
 * One shared database → one report per (month, year), covering every GP
 * across all teams (reports.teamId = NULL). This replaced the old
 * per-team report model: there is no team selector and no per-FM email
 * routing — the report goes to whoever generates it.
 *
 * The data aggregation + AI narrative generators live in `./_shared`
 * (buildCompanyReportContext / genManagementSummary / genGoals /
 * genOverview) so the on-demand path here and the monthly cron share a
 * single source of truth.
 */
export const reportRouter = router({
  /**
   * Preview the AI-written narrative fields for the company report
   * without persisting anything. The Reports page calls this to fill
   * the Management Summary / Goals / Overview textareas before the
   * operator reviews and generates.
   */
  autoFillFields: protectedProcedure
    .input(z.object({
      reportMonth: z.number().min(1).max(12),
      reportYear: z.number().min(2020).max(2100),
    }))
    .mutation(async ({ input }) => {
      const context = await buildCompanyReportContext(input.reportMonth, input.reportYear);
      if (context.stats.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No evaluation data available for this month" });
      }

      // Run the three narrative generations concurrently — independent
      // LLM calls, ~3x faster than the old sequential path.
      const [fmPerformance, goalsThisMonth, teamOverview] = await Promise.all([
        genManagementSummary(context.dataContext),
        genGoals(context.dataContext),
        genOverview(context.dataContext),
      ]);

      return {
        fmPerformance,
        goalsThisMonth,
        teamOverview,
        stats: {
          totalGPs: context.stats.length,
          avgTotal: context.avgTotal.toFixed(1),
          avgAppearance: context.avgAppearance.toFixed(1),
          avgGamePerf: context.avgGamePerf.toFixed(1),
          topPerformers: context.topPerformers.map(gp => ({
            name: gp.gpName,
            score: Number(gp.avgTotalScore || 0).toFixed(1),
          })),
          needsImprovement: context.needsImprovement.map(gp => ({
            name: gp.gpName,
            score: Number(gp.avgTotalScore || 0).toFixed(1),
          })),
          attendance: {
            totalMistakes: context.totals.totalMistakes,
            totalExtraShifts: context.totals.totalExtraShifts,
            totalLate: context.totals.totalLate,
            totalMissed: context.totals.totalMissed,
            totalSick: context.totals.totalSick,
          },
        },
      };
    }),

  /**
   * Generate (or regenerate) the company-wide report for a month.
   *
   * Upsert by (month, year): there is exactly one company report per
   * month, so a regenerate updates the existing row in place instead of
   * piling up duplicates. Empty narrative fields are auto-filled by the
   * LLM when `autoFill` is on (the default), then the report is built
   * into an Excel workbook + emailed to the caller.
   */
  generate: protectedProcedure
    .input(z.object({
      reportMonth: z.number().min(1).max(12),
      reportYear: z.number().min(2020).max(2100),
      fmPerformance: z.string().optional(),
      goalsThisMonth: z.string().optional(),
      teamOverview: z.string().optional(),
      additionalComments: z.string().optional(),
      autoFill: z.boolean().optional().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const context = await buildCompanyReportContext(input.reportMonth, input.reportYear);

      let fmPerformance = input.fmPerformance || null;
      let goalsThisMonth = input.goalsThisMonth || null;
      let teamOverview = input.teamOverview || null;

      if (input.autoFill && context.stats.length > 0) {
        // Only generate the fields the caller left blank; run them
        // concurrently. Best-effort — a failed generation leaves the
        // field null rather than aborting the whole report.
        const [a, b, c] = await Promise.all([
          fmPerformance ? Promise.resolve(fmPerformance) : genManagementSummary(context.dataContext).catch(e => {
            log.error("Failed to auto-generate fmPerformance", e instanceof Error ? e : new Error(String(e)));
            return null;
          }),
          goalsThisMonth ? Promise.resolve(goalsThisMonth) : genGoals(context.dataContext).catch(e => {
            log.error("Failed to auto-generate goalsThisMonth", e instanceof Error ? e : new Error(String(e)));
            return null;
          }),
          teamOverview ? Promise.resolve(teamOverview) : genOverview(context.dataContext).catch(e => {
            log.error("Failed to auto-generate teamOverview", e instanceof Error ? e : new Error(String(e)));
            return null;
          }),
        ]);
        fmPerformance = a;
        goalsThisMonth = b;
        teamOverview = c;
      }

      // Pull the deep analytics overview AND ask the LLM to synthesize it
      // into an executive summary. Both are persisted with the report so
      // the saved artifact carries the deep numbers + narrative — the
      // historical view doesn't have to re-derive them.
      const analyticsOverview = await db.getAnalyticsOverview(input.reportMonth, input.reportYear);
      const gpListForNames = await db.getGamePresentersByTeam(null);
      const gpNamesById = new Map<number, string>(
        (gpListForNames as Array<{ id: number; name: string }>).map(g => [g.id, g.name]),
      );
      const executiveSummary = await generateExecutiveSummary(analyticsOverview, gpNamesById).catch(err => {
        log.error("Failed to auto-generate executive summary", err instanceof Error ? err : new Error(String(err)));
        return null;
      });

      const payload = {
        teamId: null,
        reportMonth: input.reportMonth,
        reportYear: input.reportYear,
        fmPerformance,
        goalsThisMonth,
        teamOverview,
        additionalComments: input.additionalComments || null,
        reportData: {
          stats: context.stats,
          attendance: context.attendance,
          analyticsOverview,
          executiveSummary,
        },
        status: "generated" as const,
        generatedById: ctx.user.id,
        userId: ctx.user.id,
      };

      // One company report per (month, year): update in place if it
      // already exists, otherwise create.
      const existing = await db.getCompanyReportByMonthYear(input.reportMonth, input.reportYear);
      const report = existing
        ? await db.updateReport(existing.id, payload)
        : await db.createReport(payload);
      if (!report) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to persist report" });
      }

      await notifyOwner({
        title: "Company report generated",
        content: `The company-wide monthly report for ${context.monthName} ${input.reportYear} has been generated.`,
      });

      // No per-team FM anymore — the company report goes to the caller.
      const recipient = await resolveReportRecipient(ctx, { userId: null });
      const result = await generateExcelAndEmail(recipient, report.id);

      return {
        ...report,
        emailSent: result.emailSent,
        recipientEmail: recipient.user.email ?? null,
        fallbackToCaller: recipient.fallbackToCaller,
      };
    }),

  exportToExcel: protectedProcedure
    .input(z.object({
      reportId: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Manual re-export — the operator intends to re-send the email
      // (typically after editing the narrative text in the Reports UI).
      // Opt out of the Resend idempotency key so the second send
      // actually goes through instead of being silently dedup'd.
      const reportWithTeam = await db.getReportWithTeam(input.reportId);
      if (!reportWithTeam) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      const recipient = await resolveReportRecipient(ctx, reportWithTeam.team ?? { userId: null });
      return generateExcelAndEmail(recipient, input.reportId, { idempotent: false });
    }),

  exportToGoogleSheets: protectedProcedure
    .input(z.object({
      reportId: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      log.info("exportToGoogleSheets START", { reportId: input.reportId });

      if (!isGoogleSheetsAvailable()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google Sheets export is not configured. Please add Google service account credentials." });
      }

      const reportWithTeam = await db.getReportWithTeam(input.reportId);
      if (!reportWithTeam) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });

      const { report, team } = reportWithTeam;
      // Company report (teamId NULL) → label as the whole studio; legacy
      // per-team reports keep their team name.
      const isCompany = report.teamId == null;
      const teamName = isCompany ? COMPANY_REPORT_LABEL : (team?.teamName || "Unknown Team");
      const fmName = isCompany ? COMPANY_NAME : (team?.floorManagerName || "Unknown FM");

      const freshAttendance = await db.getAttendanceByTeamMonth(report.teamId, report.reportMonth, report.reportYear);

      const attitudeByGp: Record<number, { positive: number; negative: number; entries: Array<{ date: string; type: string; comment: string; score: number }> }> = {};
      for (const item of freshAttendance) {
        if (item.gamePresenter?.id) {
          const gpAttitudeEntries = await db.getAttitudeScreenshotsForGP(item.gamePresenter.id, report.reportMonth, report.reportYear);
          const positive = gpAttitudeEntries.filter(e => (e.attitudeScore || 0) > 0).length;
          const negative = gpAttitudeEntries.filter(e => (e.attitudeScore || 0) < 0).length;
          const entries = gpAttitudeEntries.map(e => ({
            date: e.evaluationDate ? new Date(e.evaluationDate).toLocaleDateString() : new Date(e.createdAt).toLocaleDateString(),
            type: (e.attitudeScore || 0) > 0 ? "POSITIVE" : "NEGATIVE",
            comment: e.comment || "",
            score: e.attitudeScore || 0,
          }));
          attitudeByGp[item.gamePresenter.id] = { positive, negative, entries };
        }
      }

      const gpEvaluationsData = await db.getGPEvaluationsForDataSheet(report.teamId, report.reportYear, report.reportMonth);
      const prevMonth = report.reportMonth === 1 ? 12 : report.reportMonth - 1;
      const prevYear = report.reportMonth === 1 ? report.reportYear - 1 : report.reportYear;
      const prevMonthEvaluations = await db.getGPEvaluationsForDataSheet(report.teamId, prevYear, prevMonth);

      const result = await exportToGoogleSheets({
        report: {
          id: report.id,
          teamId: report.teamId,
          reportMonth: report.reportMonth,
          reportYear: report.reportYear,
          fmPerformance: report.fmPerformance,
          goalsThisMonth: report.goalsThisMonth,
          teamOverview: report.teamOverview,
          additionalComments: report.additionalComments,
        },
        teamName,
        fmName,
        attendanceData: freshAttendance,
        attitudeByGp,
        gpEvaluationsData,
        prevMonthEvaluations,
      }, ctx.user.email);

      await db.updateReport(report.id, {
        googleSheetsUrl: result.spreadsheetUrl,
      });

      log.info("exportToGoogleSheets DONE", { spreadsheetUrl: result.spreadsheetUrl });
      return {
        success: true,
        spreadsheetUrl: result.spreadsheetUrl,
        spreadsheetId: result.spreadsheetId,
      };
    }),

  googleSheetsAvailable: protectedProcedure.query(() => {
    return { available: isGoogleSheetsAvailable() };
  }),

  /**
   * Executive summary preview — pulls the deep analytics overview for the
   * period and asks the LLM to synthesize it into a 5-7 sentence narrative.
   * Returns the narrative AND the analytics overview so the Reports page
   * can show both the prose and the underlying numbers side-by-side.
   *
   * Read-only: doesn't persist. The `generate` mutation calls the same
   * helper and stores the result in `reportData.analyticsOverview` so the
   * historical report carries it.
   */
  executiveSummary: protectedProcedure
    .input(z.object({
      reportMonth: z.number().min(1).max(12),
      reportYear: z.number().min(2020).max(2100),
    }))
    .query(async ({ input }) => {
      const overview = await db.getAnalyticsOverview(input.reportMonth, input.reportYear);
      const gps = await db.getGamePresentersByTeam(null);
      const gpNames = new Map<number, string>(
        (gps as Array<{ id: number; name: string }>).map(g => [g.id, g.name]),
      );
      const summary = await generateExecutiveSummary(overview, gpNames);
      return { summary, overview };
    }),

  // One shared database — everyone sees every report.
  list: protectedProcedure.query(async () => {
    return await db.getReportsWithTeams();
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.getReportWithTeam(input.id);
    }),

  // Admin: list all reports with team info
  listAll: adminProcedure.query(async () => {
    return await db.getAllReportsWithTeam();
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === "admin";
      const success = await db.deleteReportWithCheckByUser(input.id, ctx.user.id, isAdmin);
      if (!success) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found or access denied" });
      }
      return { success: true };
    }),

  /**
   * Where will the report email go? With company-wide reports there is
   * no per-team FM routing — the report is emailed to whoever generates
   * it. The Reports page shows this so an operator knows the email lands
   * in their own inbox (and warns if they have no email on file).
   */
  deliveryReadiness: protectedProcedure.query(({ ctx }) => {
    return {
      recipientEmail: ctx.user.email ?? null,
      recipientName: ctx.user.name ?? null,
      hasEmail: !!ctx.user.email,
    };
  }),
});
