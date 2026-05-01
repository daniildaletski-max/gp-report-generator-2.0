/**
 * Scheduled Monthly Report Generation
 * 
 * Runs on the 1st of each month at 06:00 UTC.
 * For each user who has teams with evaluation data for the previous month,
 * automatically generates a report and sends it via email.
 */
import cron from "node-cron";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { createLogger } from "./services/logger";

const log = createLogger("ScheduledReports");
import { notifyOwner } from "./_core/notification";
import { MONTH_NAMES } from "@shared/const";

let isMonthlyGenerationRunning = false;

/**
 * Core logic: generate a report for a specific team/user/month.
 * Mirrors the report.generate procedure logic but runs without a request context.
 */
async function generateReportForTeam(
  user: { id: number; role: string; email?: string | null; name?: string | null },
  teamId: number,
  reportMonth: number,
  reportYear: number,
): Promise<{ reportId: number; teamName: string } | null> {
  try {
    const team = await db.getFmTeamById(teamId);
    if (!team) {
      log.info(`[ScheduledReports] Team ${teamId} not found, skipping`);
      return null;
    }

    // Check if a report already exists for this team/month/year
    const existing = await db.getReportByTeamMonthYear(teamId, reportMonth, reportYear);
    if (existing) {
      log.info(`[ScheduledReports] Report already exists for team ${team.teamName} - ${MONTH_NAMES[reportMonth - 1]} ${reportYear}, skipping`);
      return null;
    }

    // Get evaluation stats for the month
    const stats = await db.getGPMonthlyStats(teamId, reportYear, reportMonth);
    if (stats.length === 0) {
      log.info(`[ScheduledReports] No evaluation data for team ${team.teamName} - ${MONTH_NAMES[reportMonth - 1]} ${reportYear}, skipping`);
      return null;
    }

    const attendance = await db.getAttendanceByTeamMonth(teamId, reportMonth, reportYear);
    const monthName = MONTH_NAMES[reportMonth - 1];

    // Get error counts for each GP (user-scoped)
    const errorCounts = await db.getErrorCountByGP(reportMonth, reportYear, user.id);

    // Get attitude data for each GP in the team
    const teamGPs = await db.getGamePresentersByTeam(teamId);
    const attitudeData: { gpName: string; positive: number; negative: number; total: number }[] = [];

    for (const gp of teamGPs) {
      const attitudes = await db.getAttitudeScreenshotsForGP(gp.id, reportMonth, reportYear);
      const positive = attitudes.filter(a => a.attitudeType === "positive").length;
      const negative = attitudes.filter(a => a.attitudeType === "negative").length;
      if (positive > 0 || negative > 0) {
        attitudeData.push({ gpName: gp.name, positive, negative, total: positive - negative });
      }
    }

    // Calculate team statistics for auto-generation
    const avgTotal = stats.reduce((sum, gp) => sum + Number(gp.avgTotalScore || 0), 0) / stats.length;
    const avgAppearance = stats.reduce((sum, gp) => sum + Number(gp.avgAppearanceScore || 0), 0) / stats.length;
    const avgGamePerf = stats.reduce((sum, gp) => sum + Number(gp.avgGamePerfScore || 0), 0) / stats.length;

    const topPerformers = [...stats]
      .sort((a, b) => Number(b.avgTotalScore || 0) - Number(a.avgTotalScore || 0))
      .slice(0, 3);

    const needsImprovement = stats.filter(gp => Number(gp.avgTotalScore || 0) < 18);

    const totalMistakes = attendance.reduce((sum, a) => sum + (a.monthlyStats?.mistakes || a.attendance?.mistakes || 0), 0);
    const totalExtraShifts = attendance.reduce((sum, a) => sum + (a.attendance?.extraShifts || 0), 0);
    const totalLate = attendance.reduce((sum, a) => sum + (a.attendance?.lateToWork || 0), 0);
    const totalMissed = attendance.reduce((sum, a) => sum + (a.attendance?.missedDays || 0), 0);
    const totalSick = attendance.reduce((sum, a) => sum + (a.attendance?.sickLeaves || 0), 0);

    // Build detailed GP performance data
    const gpDetailedData = stats.map(gp => {
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

    const gpsWithErrors = gpDetailedData.filter(gp => gp.errorCount > 0)
      .sort((a, b) => b.errorCount - a.errorCount);

    const gpsWithNegativeAttitude = gpDetailedData.filter(gp => gp.attitudeNegative > 0)
      .sort((a, b) => b.attitudeNegative - a.attitudeNegative);

    const gpsWithPositiveAttitude = gpDetailedData.filter(gp => gp.attitudePositive > 0)
      .sort((a, b) => b.attitudePositive - a.attitudePositive);

    // Build comprehensive context for LLM
    const dataContext = `
Team: ${team.teamName}
Floor Manager: ${team.floorManagerName}
Period: ${monthName} ${reportYear}

=== EVALUATION STATISTICS ===
- Total GPs Evaluated: ${stats.length}
- Average Total Score: ${avgTotal.toFixed(1)}/24 (${avgTotal >= 20 ? "Excellent" : avgTotal >= 18 ? "Good" : avgTotal >= 16 ? "Needs Improvement" : "Critical"})
- Average Appearance Score: ${avgAppearance.toFixed(1)}/12
- Average Game Performance Score: ${avgGamePerf.toFixed(1)}/10

=== TOP PERFORMERS (by evaluation score) ===
${topPerformers.map((gp, i) => {
  const detail = gpDetailedData.find(d => d.name === gp.gpName);
  return `${i + 1}. ${gp.gpName} - ${Number(gp.avgTotalScore || 0).toFixed(1)}/24 (${detail?.evaluationCount || 0} evaluations, ${detail?.errorCount || 0} errors, attitude: +${detail?.attitudePositive || 0}/-${detail?.attitudeNegative || 0})`;
}).join("\n")}

${needsImprovement.length > 0 ? `=== GPs NEEDING IMPROVEMENT (score < 18) ===
${needsImprovement.map(gp => {
  const detail = gpDetailedData.find(d => d.name === gp.gpName);
  return `- ${gp.gpName}: ${Number(gp.avgTotalScore || 0).toFixed(1)}/24 (Appearance: ${detail?.appearanceScore}/12, Game Perf: ${detail?.gamePerformanceScore}/10)`;
}).join("\n")}` : "=== All GPs are performing well (score >= 18) ==="}

=== ERROR ANALYSIS ===
- Total Team Errors: ${gpsWithErrors.reduce((sum, gp) => sum + gp.errorCount, 0)}
${gpsWithErrors.length > 0 ? `GPs with errors:
${gpsWithErrors.slice(0, 5).map(gp => `- ${gp.name}: ${gp.errorCount} errors`).join("\n")}` : "No errors recorded this month"}

=== ATTITUDE ANALYSIS ===
- Total Positive Feedback: ${attitudeData.reduce((sum, a) => sum + a.positive, 0)}
- Total Negative Feedback: ${attitudeData.reduce((sum, a) => sum + a.negative, 0)}
${gpsWithPositiveAttitude.length > 0 ? `GPs with positive attitude feedback:
${gpsWithPositiveAttitude.slice(0, 3).map(gp => `- ${gp.name}: +${gp.attitudePositive}`).join("\n")}` : ""}
${gpsWithNegativeAttitude.length > 0 ? `GPs with negative attitude feedback:
${gpsWithNegativeAttitude.slice(0, 3).map(gp => `- ${gp.name}: -${gp.attitudeNegative}`).join("\n")}` : ""}

=== ATTENDANCE SUMMARY ===
- Total Mistakes/Errors: ${totalMistakes}
- Extra Shifts Worked: ${totalExtraShifts}
- Late Arrivals: ${totalLate}
- Missed Days: ${totalMissed}
- Sick Leaves: ${totalSick}

=== INDIVIDUAL GP BREAKDOWN ===
${gpDetailedData.map(gp =>
  `${gp.name}: Score ${gp.avgScore}/24, Errors: ${gp.errorCount}, Attitude: +${gp.attitudePositive}/-${gp.attitudeNegative}, Late: ${gp.lateArrivals}`
).join("\n")}
`;

    // Auto-generate Team Overview
    let teamOverview: string | null = null;
    try {
      const teamOverviewResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an experienced Floor Manager writing a comprehensive Team Overview for a monthly casino operations report.

Guidelines for writing an optimal Team Overview:
1. Start with overall team performance assessment
2. Highlight achievements - name top performers with scores
3. Address concerns honestly - name GPs with issues
4. Provide balanced perspective
5. Format: Write 4-5 concise sentences. Do NOT use bullet points.

IMPORTANT: Use specific names and numbers from the data.`,
          },
          {
            role: "user",
            content: `Based on this comprehensive team performance data, write a detailed Team Overview:\n${dataContext}`,
          },
        ],
      });
      const content = teamOverviewResponse.choices[0]?.message?.content;
      teamOverview = typeof content === "string" ? content : null;
    } catch (e) {
      log.error("Failed to auto-generate teamOverview", e instanceof Error ? e : new Error(String(e)));
    }

    // Auto-generate Goals
    let goalsThisMonth: string | null = null;
    try {
      const goalsResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an experienced Floor Manager creating SMART goals for a monthly casino operations report.

Guidelines:
1. Analyze the data to identify the TOP 3 priority areas
2. Be SPECIFIC - name GPs, set measurable targets
3. Balance goals between rewarding top performers and addressing weaknesses
4. Format: Write 3-4 concise sentences. Do NOT use bullet points.

IMPORTANT: Be specific with names and numbers from the data.`,
          },
          {
            role: "user",
            content: `Based on this comprehensive team performance data, create specific, actionable Team Goals for next month:\n${dataContext}`,
          },
        ],
      });
      const content = goalsResponse.choices[0]?.message?.content;
      goalsThisMonth = typeof content === "string" ? content : null;
    } catch (e) {
      log.error("Failed to auto-generate goalsThisMonth", e instanceof Error ? e : new Error(String(e)));
    }

    // Auto-generate FM Performance — assesses how the FM led the team
    // this month (was a separate manual field; now LLM-drafted).
    let fmPerformance: string | null = null;
    try {
      const fmPerfResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are writing the "Floor Manager Performance" paragraph for a monthly casino operations report. The FM is reading this about themselves — be honest but constructive.

Focus on:
1. Whether the FM kept the team's overall scores stable / rising / falling vs. the previous period (use the data)
2. How well attendance issues were addressed
3. Whether errors / negative attitude trends got worse or better
4. Specific GPs who improved or regressed under their watch

Write 3-4 concise sentences. Cite specific numbers. No bullet points. No fluff.`,
          },
          {
            role: "user",
            content: `Team performance data for ${monthName} ${reportYear}:\n${dataContext}`,
          },
        ],
      });
      const fmContent = fmPerfResponse.choices[0]?.message?.content;
      fmPerformance = typeof fmContent === "string" ? fmContent : null;
    } catch (e) {
      log.error("Failed to auto-generate fmPerformance", e instanceof Error ? e : new Error(String(e)));
    }

    // Create the report
    const report = await db.createReport({
      teamId,
      reportMonth,
      reportYear,
      fmPerformance,
      goalsThisMonth,
      teamOverview,
      additionalComments: "Auto-generated monthly report",
      reportData: { stats, attendance },
      status: "generated",
      generatedById: user.id,
      userId: user.id,
    });

    // Generate Excel and send email — share the rich workbook builder
    // with the on-demand path so scheduled reports also get the
    // Coaching Plans + Bonus Summary sheets.
    const { generateExcelAndEmail } = await import("./routers/_shared");
    await generateExcelAndEmail(
      { user: { id: user.id, role: user.role, email: user.email, name: user.name } },
      report.id,
    );

    log.info(`[ScheduledReports] Successfully generated report for ${team.teamName} - ${monthName} ${reportYear}`);
    return { reportId: report.id, teamName: team.teamName };
  } catch (error) {
    log.error(`Error generating report for team ${teamId}`, error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

/**
 * Main scheduled job: generates reports for all teams that have data for the previous month.
 */
async function runMonthlyReportGeneration() {
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
    // Step 1: refresh Persona attendance for every team that has a
    // personaProjectId configured. We do this before generating
    // reports so the numbers in the report reflect the latest sick
    // leaves / missed days. Failures here are non-fatal — the report
    // generation runs anyway with whatever data was already in the DB.
    const allTeamsForSync = await db.getAllFmTeams();
    const teamsToSync = allTeamsForSync.filter(t => (t as any).personaProjectId);
    if (teamsToSync.length > 0) {
      log.info(`[ScheduledReports] Pre-sync: syncing Persona for ${teamsToSync.length} team(s)`);
      const { runPersonaSyncForTeam } = await import("./routers/personaSync");
      for (const team of teamsToSync) {
        try {
          const result = await runPersonaSyncForTeam({
            teamId: team.id,
            month: reportMonth,
            year: reportYear,
            triggeredById: null,
            source: "scheduled",
          });
          log.info(`[ScheduledReports] Persona sync ${result.status} for team ${team.teamName}: matched=${result.matched}, unmatched=${result.unmatched}`);
        } catch (e) {
          log.error(
            `[ScheduledReports] Persona sync failed for team ${team.teamName} — continuing with stale data`,
            e instanceof Error ? e : new Error(String(e)),
          );
        }
      }
    } else {
      log.info("[ScheduledReports] Pre-sync: no teams with personaProjectId, skipping");
    }

    // Step 2: generate reports per user/team
    const allUsers = await db.getAllUsers();
    let totalGenerated = 0;
    let totalSkipped = 0;
    const results: { userName: string; teamName: string; reportId: number }[] = [];

    for (const { user } of allUsers) {
      if (!user) continue;

      // Get teams owned by this user
      const userTeams = await db.getFmTeamsByUser(user.id);
      if (userTeams.length === 0) continue;

      for (const team of userTeams) {
        const result = await generateReportForTeam(
          { id: user.id, role: user.role, email: user.email, name: user.name },
          team.id,
          reportMonth,
          reportYear,
        );

        if (result) {
          totalGenerated++;
          results.push({
            userName: user.name || "Unknown",
            teamName: result.teamName,
            reportId: result.reportId,
          });
        } else {
          totalSkipped++;
        }
      }
    }

    log.info(`[ScheduledReports] Completed: ${totalGenerated} reports generated, ${totalSkipped} skipped`);

    // Notify the project owner about the scheduled run
    if (totalGenerated > 0) {
      const reportSummary = results
        .map(r => `- ${r.userName}: ${r.teamName} (Report #${r.reportId})`)
        .join("\n");

      await notifyOwner({
        title: `Monthly Reports Generated: ${monthName} ${reportYear}`,
        content: `Automated monthly report generation completed.\n\nGenerated: ${totalGenerated} reports\nSkipped: ${totalSkipped} (no data or already exists)\n\nReports:\n${reportSummary}`,
      });
    } else {
      await notifyOwner({
        title: `Monthly Reports: No Reports Generated for ${monthName} ${reportYear}`,
        content: `Automated monthly report generation ran but no new reports were generated. Either all teams already have reports for this month, or no evaluation data was found.`,
      });
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
 * Runs at 06:00 UTC on the 1st of every month.
 */
export function initScheduledReports() {
  // Cron: minute hour day-of-month month day-of-week
  // "0 6 1 * *" = At 06:00 on the 1st of every month
  const task = cron.schedule("0 6 1 * *", () => {
    log.info("[ScheduledReports] Cron triggered - starting monthly report generation");
    runMonthlyReportGeneration().catch(err => {
      log.error("Unhandled error in scheduled job", err instanceof Error ? err : new Error(String(err)));
    });
  }, {
    timezone: "Europe/Tallinn", // User's timezone
  });

  log.info("[ScheduledReports] Monthly report generation scheduled (1st of each month at 06:00 EET)");
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

// ============================================
// Persona auto-sync — pulls attendance every N hours instead of just
// on the 1st of each month. Combined with the existing monthly run
// (which is the authoritative pre-report sync), this keeps attendance
// numbers fresh throughout the month so the Dashboard / coaching
// view never shows two-week-old data.
// ============================================

let isPersonaAutoSyncRunning = false;

async function runPersonaAutoSync() {
  if (isPersonaAutoSyncRunning) {
    log.warn("[PersonaAutoSync] Already running — skipping this tick");
    return;
  }
  if (!process.env.PERSONA_USERNAME || !process.env.PERSONA_PASSWORD) {
    log.info("[PersonaAutoSync] Credentials not configured — skipped");
    return;
  }
  isPersonaAutoSyncRunning = true;
  try {
    const { runPersonaSyncForTeam } = await import("./routers/personaSync");
    const { getAllFmTeams } = await import("./db");

    const teams = await getAllFmTeams();
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    let total = { matched: 0, unmatched: 0, failed: 0 };
    for (const team of teams) {
      try {
        const r = await runPersonaSyncForTeam({
          teamId: team.id,
          month,
          year,
          triggeredById: null,
          source: "scheduled",
        });
        if (r.status === "failed") {
          total.failed++;
        } else {
          total.matched += r.matched;
          total.unmatched += r.unmatched;
        }
      } catch (e) {
        total.failed++;
        log.warn(`[PersonaAutoSync] team ${team.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    log.info(`[PersonaAutoSync] teams=${teams.length} matched=${total.matched} unmatched=${total.unmatched} failed=${total.failed}`);
  } catch (err) {
    log.error("[PersonaAutoSync] failed", err instanceof Error ? err : new Error(String(err)));
  } finally {
    isPersonaAutoSyncRunning = false;
  }
}

/**
 * Persona attendance auto-sync — every 12h by default. Persona tends
 * to have updated attendance on a 1-2 day delay so polling more often
 * than 12h doesn't gain anything.
 *
 * Override via PERSONA_SYNC_CRON ("off" disables).
 */
export function initPersonaAutoSync() {
  const expr = process.env.PERSONA_SYNC_CRON ?? "0 */12 * * *";
  if (expr.toLowerCase() === "off") {
    log.info("[PersonaAutoSync] disabled via env");
    return null;
  }
  const cronExpr = cron.validate(expr) ? expr : "0 */12 * * *";
  const task = cron.schedule(cronExpr, () => {
    log.info("[PersonaAutoSync] Cron tick");
    runPersonaAutoSync().catch(err =>
      log.error("[PersonaAutoSync] unhandled error", err instanceof Error ? err : new Error(String(err))),
    );
  }, { timezone: "Europe/Tallinn" });
  log.info(`[PersonaAutoSync] scheduled with cron "${cronExpr}"`);
  return task;
}

// Export for manual triggering (e.g., from admin panel)
export { runMonthlyReportGeneration, runStudioworksAutoSync, runAutoCoachingFromInsights, runPersonaAutoSync };
