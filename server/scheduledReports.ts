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

    // Create the report
    const report = await db.createReport({
      teamId,
      reportMonth,
      reportYear,
      fmPerformance: null,
      goalsThisMonth,
      teamOverview,
      additionalComments: "Auto-generated monthly report",
      reportData: { stats, attendance },
      status: "generated",
      generatedById: user.id,
      userId: user.id,
    });

    // Generate Excel and send email
    // We import the function dynamically to avoid circular deps
    const { generateExcelAndEmailForScheduled } = await import("./scheduledExcelHelper");
    await generateExcelAndEmailForScheduled(user, report.id);

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
    // Get all users with teams
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

// Export for manual triggering (e.g., from admin panel)
export { runMonthlyReportGeneration };
