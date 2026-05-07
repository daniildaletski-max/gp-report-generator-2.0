/**
 * Shared helpers used by multiple sub-routers.
 *
 *   - generateExcelAndEmail: builds + uploads + emails a monthly Excel report
 *   - extractEvaluationFromImage: runs an LLM OCR pass over an evaluation screenshot
 *   - EvaluationDataSchema: Zod shape returned by the LLM
 *   - parseEvaluationDate: best-effort date parser for OCR'd dates
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { MONTH_NAMES } from "@shared/const";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { sendReportEmail } from "../_core/email";
import { generateReportWorkbook } from "../services/excelService";
import { exportToGoogleSheets, isGoogleSheetsAvailable } from "../services/googleSheetsService";
import { createLogger } from "../services/logger";
import {
  generateAllNarratives,
  type ReportSnapshot,
  type PerGpRow,
  type MonthDelta,
  type PerGpReview,
} from "../services/reportNarrativesService";

const log = createLogger("Router");

/**
 * Build a `ReportSnapshot` for the given team + month/year (with prior
 * month metrics for delta computation). Shared by the on-demand
 * generation path and the scheduled cron — both pull the same shape
 * before calling `generateAllNarratives`.
 */
export async function buildReportSnapshot(opts: {
  teamId: number;
  reportMonth: number;
  reportYear: number;
  userId: number;
  teamName: string;
  fmName: string;
}): Promise<ReportSnapshot> {
  const monthName = MONTH_NAMES[opts.reportMonth - 1];
  const prevMonth = opts.reportMonth === 1 ? 12 : opts.reportMonth - 1;
  const prevYear = opts.reportMonth === 1 ? opts.reportYear - 1 : opts.reportYear;

  const [
    statsThis, statsPrev, attendanceThis, attendancePrev, errorsThis, errorsPrev, gpsTeam,
  ] = await Promise.all([
    db.getGPMonthlyStats(opts.teamId, opts.reportYear, opts.reportMonth),
    db.getGPMonthlyStats(opts.teamId, prevYear, prevMonth),
    db.getAttendanceByTeamMonth(opts.teamId, opts.reportMonth, opts.reportYear),
    db.getAttendanceByTeamMonth(opts.teamId, prevMonth, prevYear),
    db.getErrorCountByGP(opts.reportMonth, opts.reportYear, opts.userId),
    db.getErrorCountByGP(prevMonth, prevYear, opts.userId),
    db.getGamePresentersByTeam(opts.teamId),
  ]);

  // Attitude per-GP for both months — best-effort, parallel.
  const attitudePerGp = new Map<number, { positive: number; negative: number }>();
  await Promise.all(gpsTeam.map(async gp => {
    try {
      const ats = await db.getAttitudeScreenshotsForGP(gp.id, opts.reportMonth, opts.reportYear);
      const positive = ats.filter(a => (a.attitudeScore ?? 0) > 0).length;
      const negative = ats.filter(a => (a.attitudeScore ?? 0) < 0).length;
      attitudePerGp.set(gp.id, { positive, negative });
    } catch {
      attitudePerGp.set(gp.id, { positive: 0, negative: 0 });
    }
  }));

  const dirOf = (cur: number, prev: number): MonthDelta["direction"] =>
    Math.abs(cur - prev) < 0.05 ? "flat" : cur > prev ? "up" : "down";
  const delta = (cur: number, prev: number): MonthDelta => ({ current: cur, previous: prev, direction: dirOf(cur, prev) });

  const avg = (vals: number[]) => vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  const sum = (vals: number[]) => vals.reduce((s, v) => s + v, 0);

  const avgsThis = {
    total: avg(statsThis.map(s => Number(s.avgTotalScore || 0))),
    appearance: avg(statsThis.map(s => Number(s.avgAppearanceScore || 0))),
    gamePerf: avg(statsThis.map(s => Number(s.avgGamePerfScore || 0))),
  };
  const avgsPrev = {
    total: avg(statsPrev.map(s => Number(s.avgTotalScore || 0))),
    appearance: avg(statsPrev.map(s => Number(s.avgAppearanceScore || 0))),
    gamePerf: avg(statsPrev.map(s => Number(s.avgGamePerfScore || 0))),
  };

  const totalsThis = {
    evaluations: sum(statsThis.map(s => Number(s.evaluationCount || 0))),
    mistakes: sum(attendanceThis.map(a => a.monthlyStats?.mistakes || a.attendance?.mistakes || 0)),
    sickDays: sum(attendanceThis.map(a => a.attendance?.sickLeaves || 0)),
    missedDays: sum(attendanceThis.map(a => a.attendance?.missedDays || 0)),
    lateArrivals: sum(attendanceThis.map(a => a.attendance?.lateToWork || 0)),
    extraShifts: sum(attendanceThis.map(a => a.attendance?.extraShifts || 0)),
  };
  const totalsPrev = {
    evaluations: sum(statsPrev.map(s => Number(s.evaluationCount || 0))),
    mistakes: sum(attendancePrev.map(a => a.monthlyStats?.mistakes || a.attendance?.mistakes || 0)),
    sickDays: sum(attendancePrev.map(a => a.attendance?.sickLeaves || 0)),
    missedDays: sum(attendancePrev.map(a => a.attendance?.missedDays || 0)),
    lateArrivals: sum(attendancePrev.map(a => a.attendance?.lateToWork || 0)),
    extraShifts: sum(attendancePrev.map(a => a.attendance?.extraShifts || 0)),
  };

  // Build per-GP rows. Sort order: most concerning first (low score,
  // high mistakes, high attendance issues) so the LLM and the Excel
  // sheet both lead with the GPs that need attention.
  const perGp: PerGpRow[] = gpsTeam.map(gp => {
    const stat = statsThis.find(s => s.gpName === gp.name);
    const statPrev = statsPrev.find(s => s.gpName === gp.name);
    const att = attendanceThis.find(a => a.gamePresenter?.id === gp.id)?.attendance ?? null;
    const err = errorsThis.find(e => e.gpName === gp.name)?.errorCount ?? 0;
    const at = attitudePerGp.get(gp.id) ?? { positive: 0, negative: 0 };
    return {
      gpId: gp.id,
      gpName: gp.name,
      avgScore: Number(stat?.avgTotalScore ?? 0),
      appearanceScore: Number(stat?.avgAppearanceScore ?? 0),
      gamePerformanceScore: Number(stat?.avgGamePerfScore ?? 0),
      evaluationCount: Number(stat?.evaluationCount ?? 0),
      errorCount: err,
      attitudePositive: at.positive,
      attitudeNegative: at.negative,
      lateArrivals: att?.lateToWork ?? 0,
      missedDays: att?.missedDays ?? 0,
      sickDays: att?.sickLeaves ?? 0,
      prevAvgScore: Number(statPrev?.avgTotalScore ?? 0),
    };
  });
  // Risk-style ordering: lowest scoring + highest mistakes float to the top.
  perGp.sort((a, b) => {
    const ra = (22 - a.avgScore) + a.errorCount + a.lateArrivals + a.attitudeNegative;
    const rb = (22 - b.avgScore) + b.errorCount + b.lateArrivals + b.attitudeNegative;
    return rb - ra;
  });

  // Suppress unused (errorsPrev currently unused in narrative; reserved
  // for a future per-GP error delta).
  void errorsPrev;

  return {
    teamName: opts.teamName,
    fmName: opts.fmName,
    monthName,
    year: opts.reportYear,
    totalGps: gpsTeam.length,
    averages: {
      total: delta(avgsThis.total, avgsPrev.total),
      appearance: delta(avgsThis.appearance, avgsPrev.appearance),
      gamePerf: delta(avgsThis.gamePerf, avgsPrev.gamePerf),
    },
    totals: {
      evaluations: delta(totalsThis.evaluations, totalsPrev.evaluations),
      mistakes: delta(totalsThis.mistakes, totalsPrev.mistakes),
      sickDays: delta(totalsThis.sickDays, totalsPrev.sickDays),
      missedDays: delta(totalsThis.missedDays, totalsPrev.missedDays),
      lateArrivals: delta(totalsThis.lateArrivals, totalsPrev.lateArrivals),
      extraShifts: delta(totalsThis.extraShifts, totalsPrev.extraShifts),
    },
    perGp,
  };
}

/**
 * Generate the new narrative bundle (executive summary, top wins/
 * concerns, per-GP reviews) and persist to the report row.
 *
 * Designed to be called from BOTH the on-demand `report.generate`
 * path and the scheduled cron, after the report row has been created
 * but before the Excel/email step. Failures are logged but never
 * thrown — the report should always proceed.
 */
export async function generateAndPersistNarratives(opts: {
  reportId: number;
  teamId: number;
  reportMonth: number;
  reportYear: number;
  userId: number;
  teamName: string;
  fmName: string;
}): Promise<{
  executiveSummary: string;
  topWins: string;
  topConcerns: string;
  perGpReviews: PerGpReview[];
} | null> {
  try {
    const snapshot = await buildReportSnapshot({
      teamId: opts.teamId,
      reportMonth: opts.reportMonth,
      reportYear: opts.reportYear,
      userId: opts.userId,
      teamName: opts.teamName,
      fmName: opts.fmName,
    });
    const bundle = await generateAllNarratives(snapshot);
    await db.updateReport(opts.reportId, {
      executiveSummary: bundle.executiveSummary,
      topWins: bundle.topWins,
      topConcerns: bundle.topConcerns,
      perGpReviews: bundle.perGpReviews as any,
    });
    return bundle;
  } catch (e) {
    log.warn(`Narrative generation failed for report ${opts.reportId}; continuing`, {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function generateExcelAndEmail(
  ctx: { user: { id: number; role: string; email?: string | null; name?: string | null } },
  reportId: number,
) {
  log.info("exportToExcel START", { reportId });
  const reportWithTeam = await db.getReportWithTeam(reportId);
  if (!reportWithTeam) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });

  if (ctx.user.role !== 'admin' && reportWithTeam.report.userId !== ctx.user.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only export your own reports' });
  }

  const { report, team } = reportWithTeam;
  const teamName = team?.teamName || "Unknown Team";
  const fmName = team?.floorManagerName || "Unknown FM";
  const monthName = MONTH_NAMES[report.reportMonth - 1];

  const freshAttendance = await db.getAttendanceByTeamMonth(report.teamId, report.reportMonth, report.reportYear);

  const attitudeByGp: Record<number, { positive: number; negative: number; entries: Array<{ date: string; type: string; comment: string; score: number }> }> = {};
  for (const item of freshAttendance) {
    if (item.gamePresenter?.id) {
      const gpAttitudeEntries = await db.getAttitudeScreenshotsForGP(item.gamePresenter.id, report.reportMonth, report.reportYear);
      const positive = gpAttitudeEntries.filter(e => (e.attitudeScore || 0) > 0).length;
      const negative = gpAttitudeEntries.filter(e => (e.attitudeScore || 0) < 0).length;
      const entries = gpAttitudeEntries.map(e => ({
        date: e.evaluationDate ? new Date(e.evaluationDate).toLocaleDateString() : new Date(e.createdAt).toLocaleDateString(),
        type: (e.attitudeScore || 0) > 0 ? 'POSITIVE' : 'NEGATIVE',
        comment: e.comment || '',
        score: e.attitudeScore || 0,
      }));
      attitudeByGp[item.gamePresenter.id] = { positive, negative, entries };
    }
  }
  log.info("Loaded attitude data", { gpCount: Object.keys(attitudeByGp).length });

  const gpEvaluationsData = await db.getGPEvaluationsForDataSheet(report.teamId, report.reportYear, report.reportMonth);

  const prevMonth = report.reportMonth === 1 ? 12 : report.reportMonth - 1;
  const prevYear = report.reportMonth === 1 ? report.reportYear - 1 : report.reportYear;
  const prevMonthEvaluations = await db.getGPEvaluationsForDataSheet(report.teamId, prevYear, prevMonth);
  log.info("Previous month evaluations", { prevMonth, prevYear, count: prevMonthEvaluations.length });

  // Pull open + in-progress action items for the team — best-effort.
  let actionItemsForReport: Awaited<ReturnType<typeof db.listActionItems>> = [];
  try {
    actionItemsForReport = await db.listActionItems({
      teamId: report.teamId,
      includeAllStatuses: false,
    });
  } catch (e) {
    log.warn("Failed to load action items for report", { error: e instanceof Error ? e.message : String(e) });
  }

  const buffer = await generateReportWorkbook({
    report: {
      id: report.id,
      teamId: report.teamId,
      reportMonth: report.reportMonth,
      reportYear: report.reportYear,
      fmPerformance: report.fmPerformance,
      goalsThisMonth: report.goalsThisMonth,
      teamOverview: report.teamOverview,
      additionalComments: report.additionalComments,
      executiveSummary: (report as any).executiveSummary ?? null,
      topWins: (report as any).topWins ?? null,
      topConcerns: (report as any).topConcerns ?? null,
      perGpReviews: ((report as any).perGpReviews ?? null) as
        | Array<{ gpId: number; gpName: string; narrative: string; focusForNextMonth: string }>
        | null,
    },
    teamName,
    fmName,
    attendanceData: freshAttendance,
    attitudeByGp,
    gpEvaluationsData,
    prevMonthEvaluations,
    actionItems: actionItemsForReport.map(it => ({
      gpName: it.gamePresenter.name,
      title: it.title,
      description: it.description,
      category: it.category,
      priority: it.priority,
      status: it.status,
      source: it.source,
      dueDate: it.dueDate,
      createdAt: it.createdAt,
      completedAt: it.completedAt,
    })),
  });

  const fileKey = `reports/${report.id}/${nanoid()}-TeamOverview_${teamName.replace(/\s+/g, '_')}_${monthName}${report.reportYear}.xlsx`;
  const { url: excelUrl } = await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  // Best-effort Google Sheets export — when service-account creds are
  // configured the report is also pushed to Drive so the email can lead
  // with a Sheets link the FM can edit and share. Failures don't block
  // the Excel/email path.
  let googleSheetsUrl: string | null = report.googleSheetsUrl || null;
  if (isGoogleSheetsAvailable()) {
    try {
      const sheetsResult = await exportToGoogleSheets({
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
      }, ctx.user.email || undefined);
      googleSheetsUrl = sheetsResult.spreadsheetUrl;
      log.info("Google Sheets export succeeded", { url: googleSheetsUrl });
    } catch (e) {
      log.warn("Google Sheets export failed; continuing with Excel only", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  await db.updateReport(report.id, {
    excelFileUrl: excelUrl,
    excelFileKey: fileKey,
    status: "finalized",
    ...(googleSheetsUrl ? { googleSheetsUrl } : {}),
  });

  // Always send the email when a recipient is set. Earlier behaviour
  // de-duped re-exports on `!report.excelFileUrl`, but the user wants
  // the email every time they generate so they have a record in their
  // inbox; cheap, resend handles dedup on its side.
  let emailSent = false;
  if (ctx.user.email) {
    // Compute a quick stats summary for the email body — read-only,
    // best-effort. If anything throws we still send the email without
    // numbers rather than block delivery.
    const summary = (() => {
      try {
        const totalEvals = gpEvaluationsData.reduce((s: number, gp: any) => s + (gp.evaluations?.length || 0), 0);
        const totalScore = gpEvaluationsData.reduce((s: number, gp: any) => {
          return s + (gp.evaluations?.reduce((ss: number, e: any) => ss + (e.totalScore || 0), 0) || 0);
        }, 0);
        const avgScore = totalEvals > 0 ? totalScore / totalEvals : null;
        const totalMistakes = freshAttendance.reduce((s: number, a: any) => s + (a.mistakes || 0), 0);
        const totalAttitude = Object.values(attitudeByGp).reduce((s: number, v: any) => s + (v.positive || 0) - (v.negative || 0), 0);
        return {
          gpCount: freshAttendance.length,
          evaluations: totalEvals,
          mistakes: totalMistakes,
          attitude: totalAttitude,
          avgScore,
        };
      } catch {
        return undefined;
      }
    })();

    emailSent = await sendReportEmail({
      userEmail: ctx.user.email,
      userName: ctx.user.name || 'Floor Manager',
      teamName,
      monthName,
      year: report.reportYear,
      excelUrl,
      googleSheetsUrl,
      summary,
      // Read narratives off the freshly-persisted report row so the
      // email body matches what's in the workbook's Executive Summary
      // sheet. These fields may be null when the LLM call failed AND
      // the heuristic fallback also returned empty strings; in that
      // case the email simply falls back to the legacy stats-only body.
      narrative: {
        executiveSummary: (report as any).executiveSummary ?? null,
        topWins: (report as any).topWins ?? null,
        topConcerns: (report as any).topConcerns ?? null,
      },
    });
    log.info("Report email sent", { to: ctx.user.email, sent: emailSent, hasSheets: !!googleSheetsUrl });
  } else {
    log.info("User has no email configured, skipping email notification");
  }

  return {
    success: true,
    excelUrl,
    googleSheetsUrl,
    emailSent,
    emailAddress: ctx.user.email || null,
  };
}

export const EvaluationDataSchema = z.object({
  presenterName: z.string(),
  evaluatorName: z.string().optional(),
  date: z.string().optional(),
  game: z.string().optional(),
  totalScore: z.number().optional(),
  hair: z.object({
    score: z.number(),
    maxScore: z.number(),
    comment: z.string().optional(),
  }).optional(),
  makeup: z.object({
    score: z.number(),
    maxScore: z.number(),
    comment: z.string().optional(),
  }).optional(),
  outfit: z.object({
    score: z.number(),
    maxScore: z.number(),
    comment: z.string().optional(),
  }).optional(),
  posture: z.object({
    score: z.number(),
    maxScore: z.number(),
    comment: z.string().optional(),
  }).optional(),
  dealingStyle: z.object({
    score: z.number(),
    maxScore: z.number(),
    comment: z.string().optional(),
  }).optional(),
  gamePerformance: z.object({
    score: z.number(),
    maxScore: z.number(),
    comment: z.string().optional(),
  }).optional(),
});

export type EvaluationData = z.infer<typeof EvaluationDataSchema>;

export async function extractEvaluationFromImage(imageUrl: string): Promise<EvaluationData> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a highly accurate OCR assistant specialized in extracting structured data from Game Presenter evaluation screenshots.

IMPORTANT EXTRACTION RULES:
1. PRESENTER NAME: Extract the full name exactly as shown (First Name + Last Name). Look for labels like "Game Presenter", "GP Name", or similar.
2. EVALUATOR NAME: Extract the full name of the person who conducted the evaluation.
3. DATE: Extract the evaluation date. Common formats: "9 Jan 2026", "09/01/2026", "January 9, 2026".
4. GAME TYPE: Look for game names like Baccarat, Roulette, Blackjack, Dragon Tiger, etc.
5. SCORES: Each category shows a score in format "X/Y" where X is achieved score and Y is maximum possible.
   - Hair: Usually /3 max
   - Makeup: Usually /3 max
   - Outfit: Usually /3 max
   - Posture: Usually /3 max
   - Dealing Style: Usually /5 max
   - Game Performance/Game Commenting: Usually /5 max
6. COMMENTS: Extract any feedback text associated with each category.
7. TOTAL SCORE: Sum of all individual scores, typically out of 22.

Be precise and extract exactly what you see. If a field is not visible, use reasonable defaults (empty string for comments, 0 for missing scores).`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Carefully analyze this evaluation screenshot and extract ALL data. Pay special attention to:\n- The presenter's FULL NAME (first + last)\n- All score values (X/Y format)\n- Any comments or feedback for each category\n\nReturn a complete JSON object with: presenterName, evaluatorName, date, game, totalScore, and category objects (hair, makeup, outfit, posture, dealingStyle, gamePerformance) each containing score, maxScore, and comment."
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
              detail: "high"
            }
          }
        ]
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "evaluation_data",
        strict: true,
        schema: {
          type: "object",
          properties: {
            presenterName: { type: "string", description: "Name of the Game Presenter being evaluated" },
            evaluatorName: { type: "string", description: "Name of the evaluator" },
            date: { type: "string", description: "Date of evaluation in format like '9 Jan 2026'" },
            game: { type: "string", description: "Type of game (e.g., Baccarat, Roulette)" },
            totalScore: { type: "integer", description: "Total score number" },
            hair: {
              type: "object",
              properties: {
                score: { type: "integer" },
                maxScore: { type: "integer" },
                comment: { type: "string" }
              },
              required: ["score", "maxScore"],
              additionalProperties: false
            },
            makeup: {
              type: "object",
              properties: {
                score: { type: "integer" },
                maxScore: { type: "integer" },
                comment: { type: "string" }
              },
              required: ["score", "maxScore"],
              additionalProperties: false
            },
            outfit: {
              type: "object",
              properties: {
                score: { type: "integer" },
                maxScore: { type: "integer" },
                comment: { type: "string" }
              },
              required: ["score", "maxScore"],
              additionalProperties: false
            },
            posture: {
              type: "object",
              properties: {
                score: { type: "integer" },
                maxScore: { type: "integer" },
                comment: { type: "string" }
              },
              required: ["score", "maxScore"],
              additionalProperties: false
            },
            dealingStyle: {
              type: "object",
              properties: {
                score: { type: "integer" },
                maxScore: { type: "integer" },
                comment: { type: "string" }
              },
              required: ["score", "maxScore"],
              additionalProperties: false
            },
            gamePerformance: {
              type: "object",
              properties: {
                score: { type: "integer" },
                maxScore: { type: "integer" },
                comment: { type: "string" }
              },
              required: ["score", "maxScore"],
              additionalProperties: false
            }
          },
          required: ["presenterName"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to extract data from image' });
  }

  return JSON.parse(content) as EvaluationData;
}

export function parseEvaluationDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
