import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { MONTH_NAMES, COMPANY_NAME, COMPANY_REPORT_LABEL } from "@shared/const";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import { exportToGoogleSheets, isGoogleSheetsAvailable } from "../services/googleSheetsService";
import { generateExcelAndEmail, resolveReportRecipient } from "./_shared";
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
 * `buildCompanyReportContext` aggregates the month's evaluation,
 * error, attitude and attendance data into both a numeric summary and a
 * single text block the LLM narrative generators consume. It is the
 * single source of truth shared by `autoFillFields` (preview) and
 * `generate` (persist), which previously duplicated ~150 lines each.
 */

type GpDetail = {
  name: string;
  avgScore: string;
  appearanceScore: string;
  gamePerformanceScore: string;
  evaluationCount: number;
  errorCount: number;
  attitudePositive: number;
  attitudeNegative: number;
  attitudeTotal: number;
  lateArrivals: number;
  missedDays: number;
};

const scoreBand = (v: number) =>
  v >= 20 ? "Excellent" : v >= 18 ? "Good" : v >= 16 ? "Needs Improvement" : "Critical";

async function buildCompanyReportContext(month: number, year: number) {
  const monthName = MONTH_NAMES[month - 1];

  // Company-wide aggregates — a null teamId covers every GP.
  const stats = await db.getGPMonthlyStats(null, year, month);
  const attendance = await db.getAttendanceByTeamMonth(null, month, year);
  const errorCounts = await db.getErrorCountByGP(month, year);
  const allGPs = await db.getGamePresentersByTeam(null);

  const attitudeData: { gpName: string; positive: number; negative: number; total: number }[] = [];
  for (const gp of allGPs) {
    const attitudes = await db.getAttitudeScreenshotsForGP(gp.id, month, year);
    const positive = attitudes.filter(a => a.attitudeType === "positive").length;
    const negative = attitudes.filter(a => a.attitudeType === "negative").length;
    if (positive > 0 || negative > 0) {
      attitudeData.push({ gpName: gp.name, positive, negative, total: positive - negative });
    }
  }

  const n = stats.length || 1;
  const avgTotal = stats.reduce((s, gp) => s + Number(gp.avgTotalScore || 0), 0) / n;
  const avgAppearance = stats.reduce((s, gp) => s + Number(gp.avgAppearanceScore || 0), 0) / n;
  const avgGamePerf = stats.reduce((s, gp) => s + Number(gp.avgGamePerfScore || 0), 0) / n;

  const topPerformers = [...stats]
    .sort((a, b) => Number(b.avgTotalScore || 0) - Number(a.avgTotalScore || 0))
    .slice(0, 3);
  const needsImprovement = stats.filter(gp => Number(gp.avgTotalScore || 0) < 18);

  const totalMistakes = attendance.reduce((s, a) => s + (a.monthlyStats?.mistakes || a.attendance?.mistakes || 0), 0);
  const totalExtraShifts = attendance.reduce((s, a) => s + (a.attendance?.extraShifts || 0), 0);
  const totalLate = attendance.reduce((s, a) => s + (a.attendance?.lateToWork || 0), 0);
  const totalMissed = attendance.reduce((s, a) => s + (a.attendance?.missedDays || 0), 0);
  const totalSick = attendance.reduce((s, a) => s + (a.attendance?.sickLeaves || 0), 0);

  const gpDetailedData: GpDetail[] = stats.map(gp => {
    const gpErrors = errorCounts.find(e => e.gpName === gp.gpName);
    const gpAttitude = attitudeData.find(a => a.gpName === gp.gpName);
    const gpAttendance = attendance.find(a => a.gamePresenter.name === gp.gpName);
    return {
      name: gp.gpName,
      avgScore: Number(gp.avgTotalScore || 0).toFixed(1),
      appearanceScore: Number(gp.avgAppearanceScore || 0).toFixed(1),
      gamePerformanceScore: Number(gp.avgGamePerfScore || 0).toFixed(1),
      evaluationCount: gp.evaluationCount,
      errorCount: gpErrors?.errorCount || 0,
      attitudePositive: gpAttitude?.positive || 0,
      attitudeNegative: gpAttitude?.negative || 0,
      attitudeTotal: gpAttitude?.total || 0,
      lateArrivals: gpAttendance?.attendance?.lateToWork || 0,
      missedDays: gpAttendance?.attendance?.missedDays || 0,
    };
  });

  const gpsWithErrors = gpDetailedData.filter(g => g.errorCount > 0).sort((a, b) => b.errorCount - a.errorCount);
  const gpsWithNegativeAttitude = gpDetailedData.filter(g => g.attitudeNegative > 0).sort((a, b) => b.attitudeNegative - a.attitudeNegative);
  const gpsWithPositiveAttitude = gpDetailedData.filter(g => g.attitudePositive > 0).sort((a, b) => b.attitudePositive - a.attitudePositive);

  const totalErrors = gpsWithErrors.reduce((s, g) => s + g.errorCount, 0);
  const totalPositiveAttitude = attitudeData.reduce((s, a) => s + a.positive, 0);
  const totalNegativeAttitude = attitudeData.reduce((s, a) => s + a.negative, 0);

  const formatGpLine = (g: GpDetail) =>
    `${g.name} | Score ${g.avgScore}/22 | Appearance ${g.appearanceScore}/12 | Game ${g.gamePerformanceScore}/10 | ` +
    `Evals ${g.evaluationCount} | Errors ${g.errorCount} | Attitude +${g.attitudePositive}/-${g.attitudeNegative} | ` +
    `Late ${g.lateArrivals} | Missed ${g.missedDays}`;

  const dataContext = `
Company: ${COMPANY_NAME} (${COMPANY_REPORT_LABEL})
Period: ${monthName} ${year}

=== EVALUATION STATISTICS ===
- Total GPs Evaluated: ${stats.length}
- Average Total Score: ${avgTotal.toFixed(1)}/22 (${scoreBand(avgTotal)})
- Average Appearance Score: ${avgAppearance.toFixed(1)}/12
- Average Game Performance Score: ${avgGamePerf.toFixed(1)}/10

=== TOP PERFORMERS (by evaluation score) ===
${topPerformers.map((gp, i) => {
  const d = gpDetailedData.find(x => x.name === gp.gpName);
  return `${i + 1}. ${gp.gpName} - ${Number(gp.avgTotalScore || 0).toFixed(1)}/22 (${d?.evaluationCount || 0} evaluations, ${d?.errorCount || 0} errors, attitude: +${d?.attitudePositive || 0}/-${d?.attitudeNegative || 0})`;
}).join("\n")}

${needsImprovement.length > 0 ? `=== GPs NEEDING IMPROVEMENT (score < 18) ===
${needsImprovement.map(gp => {
  const d = gpDetailedData.find(x => x.name === gp.gpName);
  return `- ${gp.gpName}: ${Number(gp.avgTotalScore || 0).toFixed(1)}/22 (Appearance: ${d?.appearanceScore}/12, Game Perf: ${d?.gamePerformanceScore}/10)`;
}).join("\n")}` : "=== All GPs are performing well (score >= 18) ==="}

=== ERROR ANALYSIS ===
- Total Errors (company-wide): ${totalErrors}
${gpsWithErrors.length > 0 ? `GPs with errors:
${gpsWithErrors.slice(0, 5).map(g => `- ${g.name}: ${g.errorCount} errors`).join("\n")}` : "No errors recorded this month"}

=== ATTITUDE ANALYSIS ===
- Total Positive Feedback: ${totalPositiveAttitude}
- Total Negative Feedback: ${totalNegativeAttitude}
${gpsWithPositiveAttitude.length > 0 ? `GPs with positive attitude feedback:
${gpsWithPositiveAttitude.slice(0, 3).map(g => `- ${g.name}: +${g.attitudePositive}`).join("\n")}` : "No positive attitude feedback recorded"}
${gpsWithNegativeAttitude.length > 0 ? `GPs with negative attitude feedback:
${gpsWithNegativeAttitude.slice(0, 3).map(g => `- ${g.name}: -${g.attitudeNegative}`).join("\n")}` : "No negative attitude feedback recorded"}

=== ATTENDANCE SUMMARY ===
- Total Mistakes/Errors: ${totalMistakes}
- Extra Shifts Worked: ${totalExtraShifts}
- Late Arrivals: ${totalLate}
- Missed Days: ${totalMissed}
- Sick Leaves: ${totalSick}

=== INDIVIDUAL GP BREAKDOWN ===
${gpDetailedData.map(formatGpLine).join("\n")}
`;

  return {
    monthName,
    stats,
    attendance,
    gpDetailedData,
    avgTotal,
    avgAppearance,
    avgGamePerf,
    topPerformers,
    needsImprovement,
    totals: {
      totalMistakes, totalExtraShifts, totalLate, totalMissed, totalSick,
      totalErrors, totalPositiveAttitude, totalNegativeAttitude,
    },
    dataContext,
  };
}

const SHARED_PROMPT_RULES = `Rules:
- Use only facts present in the data context.
- Do NOT invent names, numbers, or events.
- If data is missing, state it is not available rather than guessing.
- Keep the tone professional and concise.`;

async function llmText(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = res.choices[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

const genManagementSummary = (dataContext: string) =>
  llmText(
    `You are the management team writing a brief summary for a company-wide monthly casino operations report covering all teams.

Guidelines:
- Write professionally and concisely, in 3-4 sentences
- Focus on company-wide management achievements, studio operations improvements, and how challenges were handled
- Reference specific metrics from the data (scores, error reduction, attitude improvements)
- Do NOT use bullet points

${SHARED_PROMPT_RULES}`,
    `Based on this company-wide data, write a brief management summary highlighting achievements across all teams:\n${dataContext}`,
  );

const genGoals = (dataContext: string) =>
  llmText(
    `You are the management team creating SMART goals for a company-wide monthly casino operations report covering all teams.

Guidelines for writing optimal Goals:
1. Analyze the data to identify the TOP 3 priority areas:
 - GPs with low evaluation scores (< 18/22) need improvement plans
 - GPs with high error counts need error reduction targets
 - GPs with negative attitude feedback need behavior coaching
 - Attendance issues (late arrivals, missed days) need addressing

2. For each goal, be SPECIFIC:
 - Name the GPs who need improvement (if applicable)
 - Set measurable targets (e.g., "reduce errors by 50%", "improve score to 19+")
 - Focus on actionable improvements

3. Balance the goals:
 - 1 goal for maintaining/rewarding top performers
 - 1-2 goals for addressing weaknesses (errors, scores, attitude)
 - Consider company-wide improvements if no individual issues

4. Format: Write 3-4 concise sentences. Do NOT use bullet points.

IMPORTANT: Be specific with names and numbers from the data. Generic goals are not acceptable.

${SHARED_PROMPT_RULES}`,
    `Based on this company-wide performance data, create specific, actionable Goals for next month:\n${dataContext}`,
  );

const genOverview = (dataContext: string) =>
  llmText(
    `You are the management team writing a comprehensive Company Overview for a monthly casino operations report covering all teams.

Guidelines for writing an optimal Overview:
1. Start with overall company performance assessment:
 - Company average score and what it indicates (Excellent/Good/Needs Work)
 - Compare appearance vs game performance scores

2. Highlight achievements:
 - Name top 2-3 performers with their scores
 - Mention any GPs with positive attitude feedback
 - Note extra shifts or exceptional dedication

3. Address concerns honestly:
 - Name GPs with scores below 18 and their specific issues
 - Mention error counts for GPs with multiple errors
 - Note any negative attitude feedback recipients
 - Address attendance issues (late arrivals, missed days)

4. Provide balanced perspective:
 - Acknowledge both strengths and areas for improvement
 - Be factual and data-driven

5. Format: Write 4-5 concise sentences. Do NOT use bullet points.

IMPORTANT: Use specific names and numbers from the data. A good overview is honest, specific, and actionable.

${SHARED_PROMPT_RULES}`,
    `Based on this company-wide performance data, write a detailed Company Overview that accurately reflects performance across all teams this month:\n${dataContext}`,
  );

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

      const payload = {
        teamId: null,
        reportMonth: input.reportMonth,
        reportYear: input.reportYear,
        fmPerformance,
        goalsThisMonth,
        teamOverview,
        additionalComments: input.additionalComments || null,
        reportData: { stats: context.stats, attendance: context.attendance },
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
