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

type ReportRecipient = {
  user: { id: number; role: string; email?: string | null; name?: string | null };
  fallbackToCaller: boolean;
};

/**
 * Routes the Team Monthly Overview email to the team's Floor Manager.
 *
 * Resolution order (first non-empty wins):
 *   1. `team.managerEmail` — admin-set override on the team itself.
 *      Lets admins direct the email to an FM who doesn't have a
 *      `users` row, which is the normal case in this app (FM names
 *      are free-text strings, not user accounts).
 *   2. `users[team.userId].email` — the legacy user-link path. Used
 *      for FMs that DO have a self-served user account.
 *   3. Caller's own email — fallback only, with `fallbackToCaller`
 *      flagged so the UI can warn ("this report ended up in YOUR
 *      inbox because the FM isn't configured").
 */
export async function resolveReportRecipient(
  ctx: { user: { id: number; role: string; email?: string | null; name?: string | null } },
  team: { userId?: number | null; managerEmail?: string | null; floorManagerName?: string | null },
): Promise<ReportRecipient> {
  if (team.managerEmail) {
    return {
      user: {
        id: 0,
        role: "fm",
        email: team.managerEmail,
        name: team.floorManagerName ?? null,
      },
      fallbackToCaller: false,
    };
  }
  if (team.userId && team.userId !== ctx.user.id) {
    const owner = await db.getUserById(team.userId);
    if (owner?.email) {
      return {
        user: {
          id: owner.id,
          role: owner.role ?? "user",
          email: owner.email,
          name: owner.name ?? null,
        },
        fallbackToCaller: false,
      };
    }
    return { user: ctx.user, fallbackToCaller: true };
  }
  return { user: ctx.user, fallbackToCaller: false };
}

export async function generateExcelAndEmail(
  ctx: { user: { id: number; role: string; email?: string | null; name?: string | null } },
  reportId: number,
  /**
   * `idempotent` — controls whether the Resend `Idempotency-Key`
   * header is sent.
   *
   * Default `true`: a stable key per (reportId, period) is sent,
   * so duplicate calls for the same row (cron retry-email branch
   * after an interrupted day-5, repeated kicks of the same row)
   * are deduplicated by Resend → exactly one email per row.
   *
   * Pass `false` from user-triggered re-exports (`report.exportToExcel`)
   * where the operator INTENDS to re-send the email after editing
   * the report. Without opting out, Resend would cache the prior
   * response and silently swallow the new send (Codex P2 — "Use
   * per-send idempotency keys for manual exports").
   */
  opts?: { idempotent?: boolean },
) {
  log.info("exportToExcel START", { reportId });
  const idempotent = opts?.idempotent ?? true;
  const reportWithTeam = await db.getReportWithTeam(reportId);
  if (!reportWithTeam) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });

  // Allow: admin, the user the report is pinned to, OR the user who
  // owns the team. The team-owner branch matters for legacy reports
  // created before `generate` started setting `report.userId` (the
  // single-team path) — those rows have a NULL userId and would
  // otherwise be exportable only by an admin.
  const reportUserId = reportWithTeam.report.userId;
  const teamUserId = reportWithTeam.team?.userId ?? null;
  const isOwner = reportUserId === ctx.user.id || teamUserId === ctx.user.id;
  if (ctx.user.role !== 'admin' && !isOwner) {
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

  // On the cron retry path (idempotent === true) where a workbook has
  // already been built and uploaded, REUSE the existing excelFileUrl /
  // excelFileKey instead of regenerating. This keeps the email payload
  // (attachment URL) byte-identical to the first attempt's send, so
  // Resend's idempotency check resolves as a cache hit ("same key,
  // same body") rather than a 409 ("same key, different body").
  // Without this, the retry would build a fresh nanoid()-suffixed
  // URL each day, Resend would 409 every retry, and once the 24h
  // cache expired we'd accidentally send a duplicate email
  // (Codex P2 — "Reuse idempotency keys only with identical payloads").
  //
  // Manual `exportToExcel` (idempotent: false) always rebuilds —
  // operator typically clicks re-export AFTER editing the report
  // text, expecting a fresh workbook in the email.
  const shouldReuseWorkbook = idempotent && !!report.excelFileUrl && !!report.excelFileKey;

  let fileKey: string;
  let excelUrl: string;
  if (shouldReuseWorkbook) {
    fileKey = report.excelFileKey!;
    excelUrl = report.excelFileUrl!;
    log.info("Retry path — reusing existing workbook to preserve idempotency-key payload match", {
      reportId, excelUrl,
    });
  } else {
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
    fileKey = `reports/${report.id}/${nanoid()}-TeamOverview_${teamName.replace(/\s+/g, '_')}_${monthName}${report.reportYear}.xlsx`;
    const result = await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    excelUrl = result.url;
  }

  // Best-effort Google Sheets export — when service-account creds are
  // configured the report is also pushed to Drive so the email can lead
  // with a Sheets link the FM can edit and share. Failures don't block
  // the Excel/email path.
  //
  // On the cron retry path we keep the previously-exported Sheets URL
  // (already on the row from the first attempt), for the same reason
  // as the workbook above: the email payload must stay byte-identical
  // for Resend's idempotency cache to resolve cleanly.
  let googleSheetsUrl: string | null = report.googleSheetsUrl || null;
  if (!shouldReuseWorkbook && isGoogleSheetsAvailable()) {
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

  // Write the workbook reference and (on the cron path only) an
  // `in-progress` email-delivery sentinel atomically. Two reasons
  // to gate the marker on `idempotent`:
  //
  // 1. The marker is the cron's retry/legacy discriminator — manual
  //    re-exports shouldn't be touching that state, otherwise a
  //    failed manual click writes `success: false` and the next cron
  //    retry day re-sends a previous-month report on the FM
  //    automatically (Codex P2 — "Keep manual resend failures out
  //    of cron retry state").
  // 2. Skipping the in-progress marker for manual paths also means
  //    a half-finished manual export can't accidentally trigger the
  //    cron's "in-progress = retry me" branch.
  //
  // For idempotent (cron) calls the marker is later overwritten
  // with the real outcome (success / failure / no-recipient) after
  // sendReportEmail returns.
  const baseReportData = (report.reportData as any) ?? {};
  const inProgressMarker = idempotent
    ? { reportData: { ...baseReportData, emailDelivery: { sentAt: null, success: false, reason: "in-progress" } } }
    : {};
  await db.updateReport(report.id, {
    excelFileUrl: excelUrl,
    excelFileKey: fileKey,
    status: "finalized",
    ...inProgressMarker,
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
    //
    // OMITTED on the cron (idempotent) path: those numbers can drift
    // between a successful day-5 send and a day-6+ retry (Persona
    // auto-syncs every 12h, so attendance figures change). Resend
    // would then see the same idempotency key with different body
    // bytes and 409 the retry — and after the 24h cache expiry,
    // duplicate-email the FM (Codex P2 — "Reuse idempotency keys
    // only with a frozen email body"). Manual exports keep the
    // summary panel since they don't use idempotency.
    const summary = idempotent ? undefined : (() => {
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
      // Stable per (reportId, period) — Resend dedups duplicate sends
      // for the same key, so a retry-day re-attempt after a successful
      // send whose marker-write failed will silently no-op instead of
      // double-mailing the FM (Codex P2 — "Avoid retrying after
      // confirmed sends when marker write fails").
      //
      // OFF for manual re-exports (`exportToExcel` calls us with
      // `idempotent: false`) so the operator can deliberately re-send
      // an updated email after editing the report (Codex P2 — "Use
      // per-send idempotency keys for manual exports").
      idempotencyKey: idempotent
        ? `report-${report.id}-${report.reportYear}-${report.reportMonth}`
        : undefined,
      // Derive "generated at" from the report's createdAt on the
      // idempotent path so the body bytes match across retries —
      // Resend's idempotency cache treats different bodies as
      // different requests and 409s when the key matches (Codex P2 —
      // "Reuse idempotency keys only with identical payloads").
      // Manual re-exports get the live timestamp.
      generatedAt: idempotent ? new Date(report.createdAt as any) : new Date(),
    });
    log.info("Report email sent", { to: ctx.user.email, sent: emailSent, hasSheets: !!googleSheetsUrl });

    // Overwrite the in-progress sentinel — but ONLY on the cron
    // (idempotent) path. Manual re-exports must not write
    // `emailDelivery`; otherwise a failed manual click during the
    // 5-10 retry window would write `success: false` onto a
    // previously-delivered row and the next cron tick would re-send
    // it (Codex P2 — "Keep manual resend failures out of cron retry
    // state").
    if (idempotent) {
      let markerOverwriteOk = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await db.updateReport(report.id, {
            reportData: {
              ...baseReportData,
              emailDelivery: { sentAt: new Date().toISOString(), success: emailSent },
            },
          });
          markerOverwriteOk = true;
          break;
        } catch (e) {
          log.warn(`Marker overwrite attempt ${attempt}/3 failed`, {
            error: e instanceof Error ? e.message : String(e),
            reportId: report.id,
          });
          if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 250));
        }
      }
      if (!markerOverwriteOk) {
        log.warn("All marker-overwrite attempts exhausted — row stays in-progress, cron will retry safely (idempotency key prevents duplicate mail)", {
          reportId: report.id,
        });
      }
    }
  } else {
    log.info("User has no email configured, skipping email notification");
    // Cron-path only: persist the no-recipient terminal sentinel so
    // future retry days short-circuit on this row. Manual paths
    // don't touch `emailDelivery`.
    if (idempotent) {
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
