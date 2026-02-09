/**
 * Helper for scheduled report generation.
 * Re-exports the generateExcelAndEmail function from routers
 * to be called from the scheduled reports module.
 */

// We need to call the same Excel generation logic used by the report.generate procedure.
// Since generateExcelAndEmail is defined in routers.ts, we import it indirectly
// by duplicating the call pattern here to avoid circular imports.

import * as db from "./db";
import { sendReportEmail } from "./_core/email";
import { storagePut } from "./storage";
import ExcelJS from "exceljs";
import XLSXChart from "xlsx-chart";
import { nanoid } from "nanoid";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Chart generation via QuickChart API (same as in routers.ts)
async function generateChartImage(
  labels: string[],
  appearanceScores: number[],
  gamePerformanceScores: number[],
  totalScores: number[],
): Promise<Buffer | null> {
  try {
    const chartConfig = {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Appearance",
            data: appearanceScores,
            backgroundColor: "rgba(212, 175, 55, 0.7)",
          },
          {
            label: "Game Performance",
            data: gamePerformanceScores,
            backgroundColor: "rgba(184, 134, 11, 0.7)",
          },
          {
            label: "Total Score",
            data: totalScores,
            backgroundColor: "rgba(139, 0, 0, 0.7)",
          },
        ],
      },
      options: {
        scales: {
          y: { beginAtZero: true, max: 24 },
        },
        plugins: {
          title: { display: true, text: "GP Performance Scores" },
        },
      },
    };

    const response = await fetch(
      `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=800&h=400&f=png`,
    );
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.error("[ScheduledExcel] Chart generation failed:", e);
    return null;
  }
}

/**
 * Generate Excel file and send email for a scheduled report.
 * This mirrors the generateExcelAndEmail function from routers.ts
 * but accepts a simpler user context.
 */
export async function generateExcelAndEmailForScheduled(
  user: { id: number; role: string; email?: string | null; name?: string | null },
  reportId: number,
): Promise<{ excelUrl: string } | null> {
  try {
    console.log(`[ScheduledExcel] Generating Excel for report ${reportId}`);
    const reportWithTeam = await db.getReportWithTeam(reportId);
    if (!reportWithTeam) {
      console.error(`[ScheduledExcel] Report ${reportId} not found`);
      return null;
    }

    const { report, team } = reportWithTeam;
    const teamName = team?.teamName || "Unknown Team";
    const fmName = team?.floorManagerName || "Unknown FM";
    const monthName = MONTH_NAMES[report.reportMonth - 1];

    // Fetch fresh data
    const freshAttendance = await db.getAttendanceByTeamMonth(
      report.teamId,
      report.reportMonth,
      report.reportYear,
    );

    const freshStats = await db.getGPMonthlyStats(
      report.teamId,
      report.reportYear,
      report.reportMonth,
    );

    // Get previous month data for comparison
    const prevMonth = report.reportMonth === 1 ? 12 : report.reportMonth - 1;
    const prevYear = report.reportMonth === 1 ? report.reportYear - 1 : report.reportYear;
    const prevMonthStats = await db.getGPMonthlyStats(report.teamId, prevYear, prevMonth);
    const prevMonthScoresMap = new Map<string, number>();
    for (const s of prevMonthStats) {
      prevMonthScoresMap.set(s.gpName, Number(s.avgTotalScore || 0));
    }

    // Get error counts
    const errorCounts = await db.getErrorCountByGP(report.reportMonth, report.reportYear, user.id);

    // Get attitude data
    const teamGPs = await db.getGamePresentersByTeam(report.teamId);
    const attitudeByGp = new Map<string, { positive: number; negative: number }>();
    for (const gp of teamGPs) {
      const attitudes = await db.getAttitudeScreenshotsForGP(gp.id, report.reportMonth, report.reportYear);
      const positive = attitudes.filter(a => a.attitudeType === "positive").length;
      const negative = attitudes.filter(a => a.attitudeType === "negative").length;
      if (positive > 0 || negative > 0) {
        attitudeByGp.set(gp.name, { positive, negative });
      }
    }

    // Build Excel workbook
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Team Monthly Overview");

    // Set column widths
    ws.columns = [
      { width: 5 },   // A - #
      { width: 22 },  // B - GP Name
      { width: 14 },  // C - Appearance
      { width: 14 },  // D - Game Perf
      { width: 12 },  // E - Total
      { width: 12 },  // F - Prev Month
      { width: 12 },  // G - Change
      { width: 10 },  // H - Evals
      { width: 10 },  // I - Errors
      { width: 12 },  // J - Attitude+
      { width: 12 },  // K - Attitude-
      { width: 10 },  // L - Late
      { width: 10 },  // M - Missed
      { width: 10 },  // N - Sick
      { width: 12 },  // O - Extra Shifts
    ];

    // Header
    const titleRow = ws.addRow([`Team Monthly Overview: ${teamName} - ${monthName} ${report.reportYear}`]);
    titleRow.font = { bold: true, size: 16 };
    ws.mergeCells("A1:O1");

    const fmRow = ws.addRow([`Floor Manager: ${fmName}`]);
    fmRow.font = { size: 12 };
    ws.mergeCells("A2:O2");

    ws.addRow([]); // blank row

    // Column headers
    const headerRow = ws.addRow([
      "#", "GP Name", "Appearance", "Game Perf", "Total", "Prev Month",
      "Change", "Evals", "Errors", "Attitude+", "Attitude-",
      "Late", "Missed", "Sick", "Extra Shifts",
    ]);
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4AF37" } };
      cell.border = {
        bottom: { style: "thin" },
        top: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Data rows
    const labels: string[] = [];
    const appearanceScores: number[] = [];
    const gamePerformanceScores: number[] = [];
    const totalScores: number[] = [];

    freshAttendance.forEach((item, idx) => {
      const gpName = item.gamePresenter.name;
      const stat = freshStats.find(s => s.gpName === gpName);
      const errors = errorCounts.find(e => e.gpName === gpName);
      const attitude = attitudeByGp.get(gpName);
      const prevScore = prevMonthScoresMap.get(gpName) ?? 0;
      const currentScore = Number(stat?.avgTotalScore || 0);
      const change = currentScore - prevScore;

      labels.push(gpName);
      appearanceScores.push(Number(stat?.avgAppearanceScore || 0));
      gamePerformanceScores.push(Number(stat?.avgGamePerfScore || 0));
      totalScores.push(currentScore);

      ws.addRow([
        idx + 1,
        gpName,
        Number(stat?.avgAppearanceScore || 0).toFixed(1),
        Number(stat?.avgGamePerfScore || 0).toFixed(1),
        currentScore.toFixed(1),
        prevScore.toFixed(1),
        change > 0 ? `+${change.toFixed(1)}` : change.toFixed(1),
        stat?.evaluationCount || 0,
        errors?.errorCount || 0,
        attitude?.positive || 0,
        attitude?.negative || 0,
        item.attendance?.lateToWork || 0,
        item.attendance?.missedDays || 0,
        item.attendance?.sickLeaves || 0,
        item.attendance?.extraShifts || 0,
      ]);
    });

    // Add summary rows
    ws.addRow([]);
    const summaryRow = ws.addRow(["", "TEAM AVERAGES"]);
    summaryRow.font = { bold: true };

    if (freshStats.length > 0) {
      const avgApp = freshStats.reduce((s, g) => s + Number(g.avgAppearanceScore || 0), 0) / freshStats.length;
      const avgPerf = freshStats.reduce((s, g) => s + Number(g.avgGamePerfScore || 0), 0) / freshStats.length;
      const avgTotal = freshStats.reduce((s, g) => s + Number(g.avgTotalScore || 0), 0) / freshStats.length;

      ws.addRow(["", "", avgApp.toFixed(1), avgPerf.toFixed(1), avgTotal.toFixed(1)]);
    }

    // Add report text sections
    ws.addRow([]);
    ws.addRow([]);
    if (report.teamOverview) {
      const overviewHeader = ws.addRow(["Team Overview"]);
      overviewHeader.font = { bold: true, size: 12 };
      ws.addRow([report.teamOverview]);
    }
    if (report.goalsThisMonth) {
      ws.addRow([]);
      const goalsHeader = ws.addRow(["Goals This Month"]);
      goalsHeader.font = { bold: true, size: 12 };
      ws.addRow([report.goalsThisMonth]);
    }

    // Generate chart image and add to Excel
    try {
      const chartBuffer = await generateChartImage(labels, appearanceScores, gamePerformanceScores, totalScores);
      if (chartBuffer) {
        const chartSheet = workbook.addWorksheet("Performance Chart");
        const imageId = workbook.addImage({ buffer: chartBuffer as any, extension: "png" });
        chartSheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 800, height: 400 } });
      }
    } catch (e) {
      console.error("[ScheduledExcel] Failed to add chart:", e);
    }

    // Export to buffer and upload to S3
    const buffer = await workbook.xlsx.writeBuffer();
    const fileKey = `reports/${teamName.replace(/\s+/g, "_")}_${monthName}_${report.reportYear}_${nanoid(8)}.xlsx`;
    const { url: excelUrl } = await storagePut(fileKey, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    // Update report with Excel URL
    await db.updateReport(reportId, { excelFileUrl: excelUrl, excelFileKey: fileKey });

    // Send email if user has email
    const userEmail = user.email;
    if (userEmail) {
      try {
        await sendReportEmail({
          userEmail,
          userName: user.name || "Floor Manager",
          teamName,
          monthName,
          year: report.reportYear,
          excelUrl,
        });
        console.log(`[ScheduledExcel] Email sent to ${userEmail} for report ${reportId}`);
      } catch (e) {
        console.error(`[ScheduledExcel] Failed to send email to ${userEmail}:`, e);
      }
    }

    console.log(`[ScheduledExcel] Excel generated and uploaded: ${excelUrl}`);
    return { excelUrl };
  } catch (error) {
    console.error(`[ScheduledExcel] Error generating Excel for report ${reportId}:`, error);
    return null;
  }
}
