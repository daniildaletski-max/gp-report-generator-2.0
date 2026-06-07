/**
 * Scheduled Monthly Report Generation
 * 
 * Runs on the 1st of each month at 06:00 UTC.
 * For each user who has teams with evaluation data for the previous month,
 * automatically generates a report and sends it via email.
 */
import cron from "node-cron";
import * as db from "./db";
import { createLogger } from "./services/logger";

const log = createLogger("ScheduledReports");
import { notifyOwner } from "./_core/notification";
import { MONTH_NAMES } from "@shared/const";
import {
  buildCompanyReportContext,
  genManagementSummary,
  genGoals,
  genOverview,
  generateExcelAndEmail,
} from "./routers/_shared";

let isMonthlyGenerationRunning = false;

/**
 * Pick the recipient for the automated company report.
 *
 * With company-wide reports there is no per-team FM to route to, so the
 * report is emailed to an operator — the first admin with an email on
 * file, falling back to any user with an email. Returns null when nobody
 * has an email; the workbook is still built, the email is just skipped
 * (generateExcelAndEmail records a "no-recipient" delivery marker).
 */
async function resolveCompanyReportRecipient(): Promise<
  { id: number; role: string; email?: string | null; name?: string | null } | null
> {
  const rows = await db.getAllUsers();
  const users = rows
    .map(r => r.user)
    .filter((u): u is NonNullable<typeof u> => !!u);
  return (
    users.find(u => u.role === "admin" && u.email) ??
    users.find(u => !!u.email) ??
    null
  );
}

/**
 * Core logic: generate the single company-wide report for a month.
 * Mirrors report.generate but runs without a request context.
 *
 * Retry-aware so the 5-10 cron window can recover from partial / failed
 * prior runs:
 *   row absent                                  → fresh generate
 *   row present, no excelFileUrl                → partial; delete + redo
 *   row present + excelFileUrl, email unconfirmed → re-send (idempotent)
 *   row present + excelFileUrl + delivery ok / no-recipient → skip
 */
async function generateCompanyReport(
  reportMonth: number,
  reportYear: number,
): Promise<{ reportId: number } | null> {
  const monthName = MONTH_NAMES[reportMonth - 1];
  try {
    const existing = await db.getCompanyReportByMonthYear(reportMonth, reportYear);
    const existingDelivery = ((existing?.reportData as any)?.emailDelivery ?? null) as
      | { success?: boolean; reason?: string }
      | null;

    // Terminal rows the retry should leave alone: email landed, or no
    // recipient is configured (nothing more to do until one is).
    const isTerminal = !!(existing && existing.excelFileUrl && (
      existingDelivery?.success === true
      || existingDelivery?.reason === "no-recipient"
    ));
    if (isTerminal) {
      log.info(`[ScheduledReports] Company report already complete for ${monthName} ${reportYear}, skipping`);
      return null;
    }

    // The operator the report (and any email) is attributed to. Always
    // build a ctx — generateExcelAndEmail still produces + uploads the
    // workbook when the email address is null.
    const recipient = await resolveCompanyReportRecipient();
    const recipientCtx = {
      user: recipient ?? { id: 0, role: "admin", email: null, name: null },
    };

    // Workbook uploaded but email never confirmed → re-send against the
    // same row. Only count success when emailSent comes back true.
    if (existing && existing.excelFileUrl && existingDelivery
        && (existingDelivery.success === false || existingDelivery.reason === "in-progress")) {
      log.info(`[ScheduledReports] Re-attempting email for company report #${existing.id} (${monthName} ${reportYear})`);
      try {
        const result = await generateExcelAndEmail(recipientCtx, existing.id);
        if (result?.emailSent) return { reportId: existing.id };
        log.info(`[ScheduledReports] Email retry returned emailSent=false; leaving row for next retry day`);
        return null;
      } catch (e) {
        log.warn(`Email retry failed; leaving row as-is for next retry day`, { error: e instanceof Error ? e.message : String(e) });
        return null;
      }
    }

    // Partial row (workbook never produced) → drop it and rebuild. Bail
    // if the delete fails so we don't end up with two rows for the month.
    if (existing && !existing.excelFileUrl) {
      log.info(`[ScheduledReports] Found partial company report #${existing.id} (${monthName} ${reportYear}), regenerating`);
      try {
        await db.deleteReport(existing.id);
      } catch (e) {
        log.warn(`Failed to delete partial company report #${existing.id} — skipping this run, will retry tomorrow`, {
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      }
    }

    // Aggregate company-wide data + draft the AI narratives, reusing the
    // exact same helpers the on-demand report.generate path uses.
    const context = await buildCompanyReportContext(reportMonth, reportYear);
    if (context.stats.length === 0) {
      log.info(`[ScheduledReports] No evaluation data for ${monthName} ${reportYear}, skipping`);
      return null;
    }

    const [fmPerformance, goalsThisMonth, teamOverview] = await Promise.all([
      genManagementSummary(context.dataContext).catch(e => {
        log.error("Failed to auto-generate fmPerformance", e instanceof Error ? e : new Error(String(e)));
        return null;
      }),
      genGoals(context.dataContext).catch(e => {
        log.error("Failed to auto-generate goalsThisMonth", e instanceof Error ? e : new Error(String(e)));
        return null;
      }),
      genOverview(context.dataContext).catch(e => {
        log.error("Failed to auto-generate teamOverview", e instanceof Error ? e : new Error(String(e)));
        return null;
      }),
    ]);

    const ownerId = recipient?.id ?? null;
    const report = await db.createReport({
      teamId: null,
      reportMonth,
      reportYear,
      fmPerformance,
      goalsThisMonth,
      teamOverview,
      additionalComments: "Auto-generated monthly report",
      reportData: { stats: context.stats, attendance: context.attendance },
      status: "generated",
      generatedById: ownerId,
      userId: ownerId,
    });

    // Build the rich workbook + email it. Shared with the on-demand path
    // so scheduled reports also get the Coaching Plans + Bonus Summary
    // sheets. With a null email this still builds + uploads the workbook.
    await generateExcelAndEmail(recipientCtx, report.id);

    log.info(`[ScheduledReports] Successfully generated company report for ${monthName} ${reportYear}`);
    return { reportId: report.id };
  } catch (error) {
    log.error(`Error generating company report for ${monthName} ${reportYear}`, error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

/**
 * Main scheduled job: generates reports for all teams that have data for the previous month.
 *
 * `isPrimaryRun` defaults to true and gates the "no reports generated"
 * owner notification. The day-5 cron tick is the primary run; days
 * 6-10 are idempotent retries that should stay silent on the no-op
 * path so the owner doesn't get five "No Reports Generated" emails
 * the week after a successful day-5. Retry runs still notify when
 * something IS generated (recovered failure — worth surfacing).
 */
async function runMonthlyReportGeneration(opts?: { isPrimaryRun?: boolean }) {
  const isPrimaryRun = opts?.isPrimaryRun ?? true;
  if (isMonthlyGenerationRunning) {
    log.info("[ScheduledReports] Monthly report generation is already running, skipping duplicate trigger");
    return;
  }

  isMonthlyGenerationRunning = true;
  const now = new Date();
  // Calculate previous month
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const reportMonth = prevDate.getMonth() + 1;
  const reportYear = prevDate.getFullYear();
  const monthName = MONTH_NAMES[reportMonth - 1];

  log.info(`\n========== [ScheduledReports] Starting monthly report generation for ${monthName} ${reportYear} ==========`);

  try {
    // Persona pre-sync was here; the Persona module was removed when the
    // app moved to a single shared database. Reports now generate over
    // whatever attendance/mistakes/etc. already live in the DB.
    // One shared database → a single company-wide report per month.
    const result = await generateCompanyReport(reportMonth, reportYear);

    log.info(`[ScheduledReports] Completed: ${result ? `company report #${result.reportId} generated` : "no new report"} for ${monthName} ${reportYear}`);

    // Notify the project owner about the scheduled run.
    //
    // - a generated report always notifies — worth surfacing regardless
    //   of which day fired (a retry-day success is itself useful: a
    //   recovered failure).
    // - "nothing generated" only notifies on the primary day-5 run. On
    //   retry days (6-10) the report normally already exists, so a "No
    //   Report Generated" owner email would just be noise.
    if (result) {
      await notifyOwner({
        title: `Monthly Report Generated: ${monthName} ${reportYear}`,
        content: `The automated company-wide monthly report for ${monthName} ${reportYear} has been generated (Report #${result.reportId}).`,
      });
    } else if (isPrimaryRun) {
      await notifyOwner({
        title: `Monthly Report: None Generated for ${monthName} ${reportYear}`,
        content: `Automated monthly report generation ran but produced no new report. Either the company report for this month already exists, or no evaluation data was found.`,
      });
    } else {
      log.info(`[ScheduledReports] Retry-day run produced no new report — staying silent (steady state)`);
    }
  } catch (error) {
    log.error("Fatal error during scheduled generation", error instanceof Error ? error : new Error(String(error)));
    await notifyOwner({
      title: "Monthly Report Generation Failed",
      content: `The automated monthly report generation for ${monthName} ${reportYear} encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }).catch(() => {});
  } finally {
    isMonthlyGenerationRunning = false;
  }
}

/**
 * Initialize the cron job.
 *
 * Fires at 06:00 EET on each of days 5, 6, 7, 8, 9, 10 of every month.
 *
 * Why a 6-day window and not just the 5th:
 * - Day 5 is the primary run — late evals / attendance corrections
 *   from the prior month have settled, FM gets the report with their
 *   morning coffee.
 * - Days 6-10 are a safety net. `runMonthlyReportGeneration` is
 *   idempotent: it skips any team that already has a report row for
 *   the previous month. So a day-6 run does almost nothing if day-5
 *   succeeded — it's only there to catch transient failures (a brief
 *   DB blip, LLM rate-limit, Resend outage) that left some teams
 *   unreported. After day 10 we stop trying — at that point the
 *   missing data is more interesting than the missing email.
 *
 * Operators can override the whole expression via MONTHLY_REPORTS_CRON.
 */
export function initScheduledReports() {
  // Cron: minute hour day-of-month month day-of-week
  // "0 6 5-10 * *" = At 06:00 on days 5-10 of every month
  const cronExpr = process.env.MONTHLY_REPORTS_CRON || "0 6 5-10 * *";
  const task = cron.schedule(cron.validate(cronExpr) ? cronExpr : "0 6 5-10 * *", () => {
    // Day of month in Tallinn — same timezone the cron is configured
    // in. We use Intl rather than `new Date().getDate()` so the path
    // works regardless of whether the deploy host runs in UTC, EET,
    // or anywhere else: at 06:00 EET in summer the UTC date is the
    // same, but explicit-tz is safer than betting on it.
    let tallinnDay = 0;
    try {
      tallinnDay = Number(new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Tallinn",
        day: "numeric",
      }).format(new Date()));
    } catch { tallinnDay = new Date().getDate(); }
    const isPrimaryRun = tallinnDay === 5;
    log.info(`[ScheduledReports] Cron triggered (day ${tallinnDay}, ${isPrimaryRun ? "primary" : "retry"}) - starting monthly report generation`);
    runMonthlyReportGeneration({ isPrimaryRun }).catch(err => {
      log.error("Unhandled error in scheduled job", err instanceof Error ? err : new Error(String(err)));
    });
  }, {
    timezone: "Europe/Tallinn", // User's timezone
  });

  log.info(`[ScheduledReports] Monthly report generation scheduled at "${cronExpr}" (default: 5th of each month at 06:00 EET)`);
  return task;
}

// ============================================
// Studioworks auto-sync — runs every 6 hours so FMs never have to
// click "Sync now" manually. Idempotent (existing evaluations are
// skipped) so re-running is safe.
// ============================================

let isStudioworksSyncRunning = false;

async function runStudioworksAutoSync() {
  if (isStudioworksSyncRunning) {
    log.warn("[StudioworksAutoSync] Already running — skipping this tick");
    return;
  }
  if (!process.env.STUDIOWORKS_USERNAME || !process.env.STUDIOWORKS_PASSWORD) {
    log.info("[StudioworksAutoSync] Credentials not configured — auto-sync skipped");
    return;
  }
  isStudioworksSyncRunning = true;
  try {
    const { syncStudioworksEvaluations } = await import("./services/studioworksScraper");
    const { findBestMatchingGP, createEvaluation, getEvaluationsByGP, getDb } = await import("./db");
    const db = await getDb();
    if (!db) {
      log.error("[StudioworksAutoSync] DB not available, aborting", new Error("DB unavailable"));
      return;
    }

    const result = await syncStudioworksEvaluations();
    if (!result.success) {
      log.warn(`[StudioworksAutoSync] Scraper returned failure: ${result.error}`);
      return;
    }
    let inserted = 0;
    let skipped = 0;
    let unmatched = 0;
    for (const raw of result.evaluations) {
      try {
        const date = new Date(raw.date);
        if (isNaN(date.getTime())) continue;
        const match = await findBestMatchingGP(raw.presenterName, 0.7);
        if (!match) { unmatched++; continue; }
        const gpId = match.gamePresenter.id;
        // Idempotency — same (gp, day, evaluator, game) already there?
        const evals = await getEvaluationsByGP(gpId);
        const dayKey = (d: Date) => d.toISOString().slice(0, 10);
        const target = dayKey(date);
        const sameKey = (a: string | null | undefined, b: string | null | undefined) => (a ?? "") === (b ?? "");
        const exists = evals.some(e =>
          e.evaluationDate
          && dayKey(new Date(e.evaluationDate)) === target
          && sameKey(raw.evaluatorName, e.evaluatorName)
          && sameKey(raw.game, e.game),
        );
        if (exists) { skipped++; continue; }
        const r = raw.ratings;
        await createEvaluation({
          gamePresenterId: gpId,
          evaluatorName: raw.evaluatorName ?? null,
          evaluationDate: date,
          game: raw.game ?? null,
          totalScore: raw.totalScore ?? null,
          hairScore: r.hair?.score ?? null,
          hairMaxScore: r.hair?.maxScore ?? 3,
          hairComment: r.hair?.comment ?? null,
          makeupScore: r.makeup?.score ?? null,
          makeupMaxScore: r.makeup?.maxScore ?? 3,
          makeupComment: r.makeup?.comment ?? null,
          outfitScore: r.outfit?.score ?? null,
          outfitMaxScore: r.outfit?.maxScore ?? 3,
          outfitComment: r.outfit?.comment ?? null,
          postureScore: r.posture?.score ?? null,
          postureMaxScore: r.posture?.maxScore ?? 3,
          postureComment: r.posture?.comment ?? null,
          dealingStyleScore: r.dealingStyle?.score ?? null,
          dealingStyleMaxScore: r.dealingStyle?.maxScore ?? 5,
          dealingStyleComment: r.dealingStyle?.comment ?? null,
          gamePerformanceScore: r.gamePerformance?.score ?? null,
          gamePerformanceMaxScore: r.gamePerformance?.maxScore ?? 5,
          gamePerformanceComment: r.gamePerformance?.comment ?? null,
          rawExtractedData: { source: "studioworks", externalId: raw.externalId, scheduledAt: new Date().toISOString() } as any,
          uploadedById: match.gamePresenter.userId ?? null,
          userId: match.gamePresenter.userId ?? null,
        });
        inserted++;
      } catch (e) {
        log.warn(`[StudioworksAutoSync] row failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    log.info(`[StudioworksAutoSync] inserted=${inserted} skipped=${skipped} unmatched=${unmatched} total=${result.evaluations.length}`);
    // Realtime: tell every open client the moment fresh evals land so their
    // screens refresh without waiting for the next poll. Broadcast (no
    // userId) — clients refetch their own server-scoped queries.
    if (inserted > 0) {
      const { publish } = await import("./_core/events");
      publish({ type: "sync.completed", source: "studioworks", inserted });
      publish({ type: "evaluations.changed", source: "studioworks", count: inserted });
    }
  } catch (err) {
    log.error("[StudioworksAutoSync] failed", err instanceof Error ? err : new Error(String(err)));
  } finally {
    isStudioworksSyncRunning = false;
  }
}

/**
 * Studioworks auto-sync cron — every 6 hours by default.
 * Override interval via STUDIOWORKS_SYNC_CRON env var (full cron
 * expression). Set to "off" to disable.
 */
export function initStudioworksSync() {
  const expr = process.env.STUDIOWORKS_SYNC_CRON ?? "0 */6 * * *";
  if (expr.toLowerCase() === "off") {
    log.info("[StudioworksAutoSync] disabled via env");
    return null;
  }
  if (!cron.validate(expr)) {
    log.warn(`[StudioworksAutoSync] Invalid cron expression "${expr}", falling back to default`);
  }
  const task = cron.schedule(cron.validate(expr) ? expr : "0 */6 * * *", () => {
    log.info("[StudioworksAutoSync] Cron tick — running auto-sync");
    runStudioworksAutoSync().catch(err =>
      log.error("[StudioworksAutoSync] unhandled error", err instanceof Error ? err : new Error(String(err))),
    );
  }, {
    timezone: "Europe/Tallinn",
  });
  log.info(`[StudioworksAutoSync] scheduled with cron "${expr}"`);
  return task;
}

// ============================================
// Auto-coaching: turn regression insights into action items so the FM
// doesn't have to manually click "create plan" for every GP that
// dropped points. Runs daily; idempotent against existing items
// flagged as ai_insight for the same GP.
// ============================================

let isAutoCoachingRunning = false;

async function runAutoCoachingFromInsights() {
  if (isAutoCoachingRunning) {
    log.warn("[AutoCoaching] Already running — skipping this tick");
    return;
  }
  isAutoCoachingRunning = true;
  try {
    const { computeDashboardInsights, createActionItem, getDb } = await import("./db");
    const { actionItems } = await import("../drizzle/schema");
    const { and, eq, gte } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) {
      log.error("[AutoCoaching] DB not available", new Error("DB unavailable"));
      return;
    }

    // No userId scope — runs across all teams. The created action item
    // is keyed to the GP, and ownership is inherited from the GP's
    // userId so the right FM sees it on their board.
    const insights = await computeDashboardInsights({});
    const regressions = insights.filter(i => i.kind === "score_regression" && i.metadata?.gpId);

    let created = 0;
    let skipped = 0;
    // Skip-window: don't re-create the same item within 7 days, even
    // if the FM hasn't acted on it yet — they'll see it once and we
    // don't want a daily duplication storm.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const insight of regressions) {
      const gpId = insight.metadata?.gpId;
      if (!gpId) continue;
      // Look up existing ai_insight items for this GP in the last 7d
      const existing = await db.select()
        .from(actionItems)
        .where(and(
          eq(actionItems.gamePresenterId, gpId),
          eq(actionItems.source, "ai_insight"),
          gte(actionItems.createdAt, sevenDaysAgo),
        ))
        .limit(1);
      if (existing.length > 0) { skipped++; continue; }

      // Pull the GP's userId so the action item shows on the right
      // FM's board. Without this it'd be invisible to the per-user
      // listing query.
      const { gamePresenters } = await import("../drizzle/schema");
      const gp = await db.select().from(gamePresenters).where(eq(gamePresenters.id, gpId)).limit(1);
      const ownerUserId = gp[0]?.userId ?? null;

      try {
        await createActionItem({
          gamePresenterId: gpId,
          userId: ownerUserId,
          createdById: null,
          title: insight.title,
          description: `${insight.description}\n\nAuto-generated from a score-regression insight detected by the Operations Brain. Mark this done after the coaching conversation.`,
          category: "performance",
          status: "open",
          priority: "high",
          source: "ai_insight",
        });
        created++;
      } catch (e) {
        log.warn(`[AutoCoaching] Failed to create item for GP ${gpId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    log.info(`[AutoCoaching] regressions=${regressions.length} created=${created} skipped=${skipped}`);
  } catch (err) {
    log.error("[AutoCoaching] failed", err instanceof Error ? err : new Error(String(err)));
  } finally {
    isAutoCoachingRunning = false;
  }
}

/**
 * Auto-coaching cron — daily at 07:00 EET. Each regression spotted by
 * computeDashboardInsights becomes a coaching action item if there
 * isn't already an ai_insight item for that GP within the last 7d.
 *
 * Override schedule via AUTO_COACHING_CRON ("off" disables).
 */
export function initAutoCoaching() {
  const expr = process.env.AUTO_COACHING_CRON ?? "0 7 * * *";
  if (expr.toLowerCase() === "off") {
    log.info("[AutoCoaching] disabled via env");
    return null;
  }
  const cronExpr = cron.validate(expr) ? expr : "0 7 * * *";
  const task = cron.schedule(cronExpr, () => {
    log.info("[AutoCoaching] Cron tick");
    runAutoCoachingFromInsights().catch(err =>
      log.error("[AutoCoaching] unhandled error", err instanceof Error ? err : new Error(String(err))),
    );
  }, { timezone: "Europe/Tallinn" });
  log.info(`[AutoCoaching] scheduled with cron "${cronExpr}"`);
  return task;
}


// Export for manual triggering (e.g., from admin panel)
export { runMonthlyReportGeneration, runStudioworksAutoSync, runAutoCoachingFromInsights };
