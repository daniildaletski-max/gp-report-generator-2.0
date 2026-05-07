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

const log = createLogger("Router");

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

  // Write the workbook reference AND a `in-progress` email-delivery
  // sentinel atomically, in a single updateReport call. This closes
  // the window where the row could ever have `excelFileUrl` set
  // without an `emailDelivery` marker — the precondition for the
  // cron's "no marker = legacy" rule (Codex P2 — "Keep markerless
  // new rows retryable"). Even if the process is killed between
  // here and the email-send below, the row will carry an
  // in-progress marker and the safety-net cron will treat it as
  // retry-needed, not as a legacy artefact.
  //
  // The marker is overwritten with the real outcome (success /
  // failure / no-recipient) after sendReportEmail returns.
  const baseReportData = (report.reportData as any) ?? {};
  await db.updateReport(report.id, {
    excelFileUrl: excelUrl,
    excelFileKey: fileKey,
    status: "finalized",
    reportData: {
      ...baseReportData,
      emailDelivery: { sentAt: null, success: false, reason: "in-progress" },
    },
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
    });
    log.info("Report email sent", { to: ctx.user.email, sent: emailSent, hasSheets: !!googleSheetsUrl });

    // Overwrite the in-progress sentinel (written above, atomically
    // with excelFileUrl) with the real email-send outcome. The
    // marker's `success` field is the cron's terminal-vs-retry
    // discriminator:
    //   - success: true   → terminal, skip
    //   - success: false  → new-code failure, retry email
    //   - reason:
    //       "in-progress" → process died before this overwrite,
    //                       cron treats as retry (same as success:false)
    //       "no-recipient"→ terminal, skip
    //       "legacy-backfill" → terminal, skip (set by the cron itself)
    //
    // If this overwrite fails, the row stays in the in-progress
    // state — which is itself a valid retry signal. The next cron
    // tick will re-attempt the email (Resend dedups, harmless even
    // if the email actually landed).
    try {
      await db.updateReport(report.id, {
        reportData: {
          ...baseReportData,
          emailDelivery: { sentAt: new Date().toISOString(), success: emailSent },
        },
      });
    } catch (e) {
      log.warn("Failed to overwrite in-progress marker with final outcome — row stays in-progress, cron will retry", {
        error: e instanceof Error ? e.message : String(e),
        reportId: report.id,
      });
    }
  } else {
    // No recipient on file — terminal state. Overwrite the
    // in-progress sentinel (written above with excelFileUrl) with
    // the no-recipient marker so the retry-day cron doesn't keep
    // rebuilding/uploading this row forever. Admin-config issue,
    // not a transient delivery failure.
    log.info("User has no email configured, skipping email notification");
    try {
      await db.updateReport(report.id, {
        reportData: { ...baseReportData, emailDelivery: { sentAt: null, success: false, reason: "no-recipient" } },
      });
    } catch (e) {
      log.warn("Failed to persist no-recipient flag — row stays in-progress, cron will safely retry once an email is set", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
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
