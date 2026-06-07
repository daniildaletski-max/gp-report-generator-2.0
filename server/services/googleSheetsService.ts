/**
 * Google Sheets Export Service
 * Converts report data into a Google Sheets spreadsheet using service account credentials.
 * The spreadsheet is shared with the user's email for easy access.
 */
import { google } from "googleapis";
import { createLogger } from "./logger";
import { MONTH_NAMES, MAX_TOTAL_SCORE } from "@shared/const";

const log = createLogger("GoogleSheetsService");

interface ChartDataPoint {
  gpName: string;
  evaluations: Array<{
    appearanceScore: number | null;
    gamePerformanceScore: number | null;
  }>;
}

interface AttendanceItem {
  gamePresenter: { id?: number; name?: string } | null;
  attendance: {
    mistakes?: number | null;
    extraShifts?: number | null;
    lateToWork?: number | null;
    missedDays?: number | null;
    sickLeaves?: number | null;
    remarks?: string | null;
  } | null;
  monthlyStats: {
    mistakes?: number | null;
    attitude?: number | null;
    notes?: string | null;
  } | null;
}

interface AttitudeEntry {
  date: string;
  type: string;
  comment: string;
  score: number;
}

interface AttitudeByGp {
  [gpId: number]: {
    positive: number;
    negative: number;
    entries: AttitudeEntry[];
  };
}

interface ReportData {
  report: {
    id: number;
    teamId: number | null;
    reportMonth: number;
    reportYear: number;
    fmPerformance: string | null;
    goalsThisMonth: string | null;
    teamOverview: string | null;
    additionalComments: string | null;
  };
  teamName: string;
  fmName: string;
  attendanceData: AttendanceItem[];
  attitudeByGp: AttitudeByGp;
  gpEvaluationsData: ChartDataPoint[];
  prevMonthEvaluations: ChartDataPoint[];
}

// ============================
// Color helpers
// ============================
function rgb(r: number, g: number, b: number) {
  return { red: r / 255, green: g / 255, blue: b / 255 };
}

const COLORS = {
  gold: rgb(255, 192, 0),
  goldLight: rgb(255, 242, 204),
  white: rgb(255, 255, 255),
  lightGray: rgb(242, 242, 242),
  darkGray: rgb(64, 64, 64),
  black: rgb(26, 26, 26),
  blue: rgb(68, 114, 196),
  blueLight: rgb(214, 228, 240),
  green: rgb(112, 173, 71),
  greenLight: rgb(226, 239, 218),
  red: rgb(255, 68, 68),
  redLight: rgb(252, 228, 236),
  navyBlue: rgb(31, 56, 100),
};

function getScoreColor(total: number) {
  if (total >= 20) return COLORS.green;
  if (total >= 18) return rgb(104, 159, 56);
  if (total >= 16) return COLORS.gold;
  if (total >= 14) return rgb(212, 160, 23);
  return COLORS.red;
}

function getScoreBgColor(total: number) {
  if (total >= 20) return COLORS.greenLight;
  if (total >= 18) return rgb(232, 245, 233);
  if (total >= 16) return rgb(255, 249, 230);
  if (total >= 14) return COLORS.goldLight;
  return COLORS.redLight;
}

// ============================
// Auth
// ============================
function getAuth() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set");
  }

  let credentials: any;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch (e) {
    throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON: not valid JSON");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  return auth;
}

// ============================
// Compute GP averages
// ============================
function computeGpAverages(gpEvaluationsData: ChartDataPoint[]) {
  return gpEvaluationsData
    .filter(gp => gp.evaluations.length > 0)
    .map(gp => {
      const avgApp = gp.evaluations.reduce((s, e) => s + (e.appearanceScore || 0), 0) / gp.evaluations.length;
      const avgGP = gp.evaluations.reduce((s, e) => s + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
      const total = avgApp + avgGP;
      return {
        name: gp.gpName,
        appearance: Number(avgApp.toFixed(1)),
        gamePerf: Number(avgGP.toFixed(1)),
        total: Number(total.toFixed(1)),
        evalCount: gp.evaluations.length,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ============================
// Helper: cell formatting
// ============================
function headerCell(value: string) {
  return {
    userEnteredValue: { stringValue: value },
    userEnteredFormat: {
      backgroundColor: COLORS.gold,
      textFormat: { bold: true, fontSize: 11, foregroundColor: COLORS.black },
      horizontalAlignment: "CENTER",
      verticalAlignment: "MIDDLE",
      borders: thinBorders(),
    },
  };
}

function titleCell(value: string, fontSize: number = 14) {
  return {
    userEnteredValue: { stringValue: value },
    userEnteredFormat: {
      textFormat: { bold: true, fontSize, foregroundColor: COLORS.white },
      backgroundColor: COLORS.navyBlue,
      horizontalAlignment: "CENTER",
      verticalAlignment: "MIDDLE",
      borders: thinBorders(),
    },
  };
}

function textCell(value: string, opts?: { bold?: boolean; bg?: any; fg?: any; align?: string; wrap?: boolean }) {
  return {
    userEnteredValue: { stringValue: value },
    userEnteredFormat: {
      textFormat: {
        bold: opts?.bold || false,
        fontSize: 10,
        foregroundColor: opts?.fg || COLORS.white,
      },
      backgroundColor: opts?.bg || COLORS.black,
      horizontalAlignment: opts?.align || "LEFT",
      verticalAlignment: "MIDDLE",
      wrapStrategy: opts?.wrap ? "WRAP" : "OVERFLOW_OR_WRAP",
      borders: thinBorders(),
    },
  };
}

function numberCell(value: number, opts?: { bold?: boolean; bg?: any; fg?: any; format?: string }) {
  return {
    userEnteredValue: { numberValue: value },
    userEnteredFormat: {
      textFormat: {
        bold: opts?.bold || false,
        fontSize: 10,
        foregroundColor: opts?.fg || COLORS.white,
      },
      backgroundColor: opts?.bg || COLORS.black,
      horizontalAlignment: "CENTER",
      verticalAlignment: "MIDDLE",
      numberFormat: opts?.format ? { type: "NUMBER", pattern: opts.format } : undefined,
      borders: thinBorders(),
    },
  };
}

function emptyCell(bg?: any) {
  return {
    userEnteredValue: { stringValue: "" },
    userEnteredFormat: {
      backgroundColor: bg || COLORS.black,
      borders: thinBorders(),
    },
  };
}

function thinBorders() {
  const style = { style: "SOLID", colorStyle: { rgbColor: rgb(50, 50, 50) } };
  return { top: style, bottom: style, left: style, right: style };
}

// ============================
// Build Sheets Data
// ============================

function buildMonthlySheetRows(data: ReportData, monthName: string) {
  const { report, teamName, fmName, attendanceData, attitudeByGp, gpEvaluationsData } = data;
  const gpAverages = computeGpAverages(gpEvaluationsData);
  const rows: any[] = [];

  // Title
  rows.push({
    values: [
      titleCell(`${teamName} — Monthly Overview`, 16),
      ...Array(7).fill(null).map(() => titleCell("")),
    ],
  });
  rows.push({
    values: [
      titleCell(`${monthName} ${report.reportYear} | Floor Manager: ${fmName}`, 11),
      ...Array(7).fill(null).map(() => titleCell("", 11)),
    ],
  });
  rows.push({ values: [emptyCell()] });

  // ── Executive Summary ──
  rows.push({
    values: [
      titleCell("EXECUTIVE SUMMARY", 12),
      ...Array(7).fill(null).map(() => titleCell("", 12)),
    ],
  });

  const teamAvg = gpAverages.length > 0
    ? (gpAverages.reduce((s, g) => s + g.total, 0) / gpAverages.length).toFixed(1)
    : "N/A";
  const topGp = gpAverages[0];
  const bottomGp = gpAverages[gpAverages.length - 1];

  rows.push({ values: [textCell(`Team Average Score: ${teamAvg}/${MAX_TOTAL_SCORE}`, { bold: true, fg: COLORS.gold })] });
  rows.push({ values: [textCell(`GPs Evaluated: ${gpAverages.length} | Total Evaluations: ${gpEvaluationsData.reduce((s, g) => s + g.evaluations.length, 0)}`)] });
  if (topGp) rows.push({ values: [textCell(`Top Performer: ${topGp.name} (${topGp.total}/${MAX_TOTAL_SCORE})`, { fg: COLORS.green })] });
  if (bottomGp && gpAverages.length > 1) rows.push({ values: [textCell(`Needs Attention: ${bottomGp.name} (${bottomGp.total}/${MAX_TOTAL_SCORE})`, { fg: COLORS.red })] });
  rows.push({ values: [emptyCell()] });

  // ── GP Scores Table ──
  rows.push({
    values: [
      titleCell("GP EVALUATION SCORES", 12),
      ...Array(7).fill(null).map(() => titleCell("", 12)),
    ],
  });

  // Headers
  rows.push({
    values: [
      headerCell("GP Name"),
      headerCell("Appearance"),
      headerCell("Game Perf."),
      headerCell(`Total (/${MAX_TOTAL_SCORE})`),
      headerCell("Evaluations"),
      headerCell("Rating"),
      emptyCell(),
      emptyCell(),
    ],
  });

  // GP rows
  for (const gp of gpAverages) {
    const rating = gp.total >= 20 ? "Excellent" : gp.total >= 18 ? "Good" : gp.total >= 16 ? "Average" : gp.total >= 14 ? "Below Avg" : "Poor";
    rows.push({
      values: [
        textCell(gp.name, { bold: true }),
        numberCell(gp.appearance, { format: "0.0", bg: getScoreBgColor(gp.total), fg: getScoreColor(gp.total) }),
        numberCell(gp.gamePerf, { format: "0.0", bg: getScoreBgColor(gp.total), fg: getScoreColor(gp.total) }),
        numberCell(gp.total, { bold: true, format: "0.0", bg: getScoreBgColor(gp.total), fg: getScoreColor(gp.total) }),
        numberCell(gp.evalCount, { bg: COLORS.lightGray, fg: COLORS.darkGray }),
        textCell(rating, { align: "CENTER", fg: getScoreColor(gp.total), bg: getScoreBgColor(gp.total) }),
        emptyCell(),
        emptyCell(),
      ],
    });
  }

  // Team average row
  if (gpAverages.length > 0) {
    const avgApp = gpAverages.reduce((s, g) => s + g.appearance, 0) / gpAverages.length;
    const avgGP = gpAverages.reduce((s, g) => s + g.gamePerf, 0) / gpAverages.length;
    const avgTotal = gpAverages.reduce((s, g) => s + g.total, 0) / gpAverages.length;
    rows.push({
      values: [
        textCell("TEAM AVERAGE", { bold: true, bg: COLORS.navyBlue, fg: COLORS.gold }),
        numberCell(Number(avgApp.toFixed(1)), { bold: true, format: "0.0", bg: COLORS.navyBlue, fg: COLORS.gold }),
        numberCell(Number(avgGP.toFixed(1)), { bold: true, format: "0.0", bg: COLORS.navyBlue, fg: COLORS.gold }),
        numberCell(Number(avgTotal.toFixed(1)), { bold: true, format: "0.0", bg: COLORS.navyBlue, fg: COLORS.gold }),
        numberCell(gpAverages.reduce((s, g) => s + g.evalCount, 0), { bold: true, bg: COLORS.navyBlue, fg: COLORS.gold }),
        textCell("", { bg: COLORS.navyBlue }),
        emptyCell(),
        emptyCell(),
      ],
    });
  }

  rows.push({ values: [emptyCell()] });

  // ── Attendance Table ──
  rows.push({
    values: [
      titleCell("ATTENDANCE & DISCIPLINE", 12),
      ...Array(7).fill(null).map(() => titleCell("", 12)),
    ],
  });

  rows.push({
    values: [
      headerCell("GP Name"),
      headerCell("Mistakes"),
      headerCell("Extra Shifts"),
      headerCell("Late to Work"),
      headerCell("Missed Days"),
      headerCell("Sick Leaves"),
      headerCell("Attitude (+/-)"),
      headerCell("Remarks"),
    ],
  });

  for (const item of attendanceData) {
    const gpName = item.gamePresenter?.name || "Unknown";
    const gpId = item.gamePresenter?.id || 0;
    const att = item.attendance;
    const stats = item.monthlyStats;
    const attitude = attitudeByGp[gpId];
    const attitudeStr = attitude ? `+${attitude.positive} / -${attitude.negative}` : "-";
    const remarks = att?.remarks || stats?.notes || "";

    const mistakes = att?.mistakes ?? stats?.mistakes ?? 0;
    const late = att?.lateToWork ?? 0;
    const missed = att?.missedDays ?? 0;

    rows.push({
      values: [
        textCell(gpName, { bold: true }),
        numberCell(mistakes, { bg: mistakes > 3 ? COLORS.redLight : undefined, fg: mistakes > 3 ? COLORS.red : undefined }),
        numberCell(att?.extraShifts ?? 0, { bg: (att?.extraShifts ?? 0) > 0 ? COLORS.greenLight : undefined, fg: (att?.extraShifts ?? 0) > 0 ? COLORS.green : undefined }),
        numberCell(late, { bg: late > 2 ? COLORS.redLight : undefined, fg: late > 2 ? COLORS.red : undefined }),
        numberCell(missed, { bg: missed > 1 ? COLORS.redLight : undefined, fg: missed > 1 ? COLORS.red : undefined }),
        numberCell(att?.sickLeaves ?? 0),
        textCell(attitudeStr, { align: "CENTER" }),
        textCell(remarks, { wrap: true }),
      ],
    });
  }

  // Attendance totals
  if (attendanceData.length > 0) {
    const totals = attendanceData.reduce((acc, item) => ({
      mistakes: acc.mistakes + (item.monthlyStats?.mistakes ?? item.attendance?.mistakes ?? 0),
      extraShifts: acc.extraShifts + (item.attendance?.extraShifts ?? 0),
      lateToWork: acc.lateToWork + (item.attendance?.lateToWork ?? 0),
      missedDays: acc.missedDays + (item.attendance?.missedDays ?? 0),
      sickLeaves: acc.sickLeaves + (item.attendance?.sickLeaves ?? 0),
    }), { mistakes: 0, extraShifts: 0, lateToWork: 0, missedDays: 0, sickLeaves: 0 });

    rows.push({
      values: [
        textCell("TOTALS", { bold: true, bg: COLORS.navyBlue, fg: COLORS.gold }),
        numberCell(totals.mistakes, { bold: true, bg: COLORS.navyBlue, fg: COLORS.gold }),
        numberCell(totals.extraShifts, { bold: true, bg: COLORS.navyBlue, fg: COLORS.gold }),
        numberCell(totals.lateToWork, { bold: true, bg: COLORS.navyBlue, fg: COLORS.gold }),
        numberCell(totals.missedDays, { bold: true, bg: COLORS.navyBlue, fg: COLORS.gold }),
        numberCell(totals.sickLeaves, { bold: true, bg: COLORS.navyBlue, fg: COLORS.gold }),
        textCell("", { bg: COLORS.navyBlue }),
        textCell("", { bg: COLORS.navyBlue }),
      ],
    });
  }

  rows.push({ values: [emptyCell()] });

  // ── FM Performance & Goals ──
  rows.push({
    values: [
      titleCell("FM PERFORMANCE & GOALS", 12),
      ...Array(7).fill(null).map(() => titleCell("", 12)),
    ],
  });

  if (report.fmPerformance) {
    rows.push({ values: [textCell("FM Performance (Self Evaluation):", { bold: true, fg: COLORS.gold })] });
    for (const line of report.fmPerformance.split("\n")) {
      rows.push({ values: [textCell(line, { wrap: true })] });
    }
    rows.push({ values: [emptyCell()] });
  }

  if (report.goalsThisMonth) {
    rows.push({ values: [textCell("Goals This Month:", { bold: true, fg: COLORS.gold })] });
    for (const line of report.goalsThisMonth.split("\n")) {
      rows.push({ values: [textCell(line, { wrap: true })] });
    }
    rows.push({ values: [emptyCell()] });
  }

  if (report.teamOverview) {
    rows.push({ values: [textCell("Team Overview:", { bold: true, fg: COLORS.gold })] });
    for (const line of report.teamOverview.split("\n")) {
      rows.push({ values: [textCell(line, { wrap: true })] });
    }
    rows.push({ values: [emptyCell()] });
  }

  if (report.additionalComments) {
    rows.push({ values: [textCell("Additional Notes:", { bold: true, fg: COLORS.gold })] });
    for (const line of report.additionalComments.split("\n")) {
      rows.push({ values: [textCell(line, { wrap: true })] });
    }
  }

  return rows;
}

function buildDataSheetRows(gpEvaluationsData: ChartDataPoint[]) {
  const gpAverages = computeGpAverages(gpEvaluationsData);
  const rows: any[] = [];

  rows.push({
    values: [
      headerCell("GP Name"),
      headerCell("Appearance (max 12)"),
      headerCell("Game Performance (max 10)"),
      headerCell(`Total (max ${MAX_TOTAL_SCORE})`),
      headerCell("# Evaluations"),
    ],
  });

  for (const gp of gpAverages) {
    rows.push({
      values: [
        textCell(gp.name, { bold: true }),
        numberCell(gp.appearance, { format: "0.0" }),
        numberCell(gp.gamePerf, { format: "0.0" }),
        numberCell(gp.total, { bold: true, format: "0.0", fg: getScoreColor(gp.total), bg: getScoreBgColor(gp.total) }),
        numberCell(gp.evalCount),
      ],
    });
  }

  return { rows, gpAverages };
}

// ============================
// Main Export Function
// ============================

export async function exportToGoogleSheets(
  data: ReportData,
  userEmail?: string | null
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const monthName = MONTH_NAMES[data.report.reportMonth - 1];
  const title = `Team Overview — ${data.teamName} — ${monthName} ${data.report.reportYear}`;

  log.info("Creating Google Sheet", { title, reportId: data.report.id });

  // Build sheet data
  const monthlyRows = buildMonthlySheetRows(data, monthName);
  const { rows: dataRows, gpAverages } = buildDataSheetRows(data.gpEvaluationsData);

  // Create spreadsheet with two sheets
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title,
        locale: "en_US",
      },
      sheets: [
        {
          properties: {
            title: `${monthName} ${data.report.reportYear}`,
            sheetId: 0,
            gridProperties: { rowCount: monthlyRows.length + 10, columnCount: 10 },
            tabColor: COLORS.gold,
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: monthlyRows,
            },
          ],
        },
        {
          properties: {
            title: "Data",
            sheetId: 1,
            gridProperties: { rowCount: dataRows.length + 5, columnCount: 6 },
            tabColor: COLORS.blue,
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: dataRows,
            },
          ],
        },
      ],
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId!;
  const spreadsheetUrl = spreadsheet.data.spreadsheetUrl!;

  log.info("Spreadsheet created", { spreadsheetId });

  // Add chart to Data sheet
  if (gpAverages.length > 0) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // Column widths for monthly sheet
            {
              updateDimensionProperties: {
                range: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
                properties: { pixelSize: 180 },
                fields: "pixelSize",
              },
            },
            {
              updateDimensionProperties: {
                range: { sheetId: 0, dimension: "COLUMNS", startIndex: 1, endIndex: 6 },
                properties: { pixelSize: 120 },
                fields: "pixelSize",
              },
            },
            {
              updateDimensionProperties: {
                range: { sheetId: 0, dimension: "COLUMNS", startIndex: 7, endIndex: 8 },
                properties: { pixelSize: 250 },
                fields: "pixelSize",
              },
            },
            // Merge title rows on monthly sheet
            {
              mergeCells: {
                range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
                mergeType: "MERGE_ALL",
              },
            },
            {
              mergeCells: {
                range: { sheetId: 0, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 },
                mergeType: "MERGE_ALL",
              },
            },
            // Add chart to Data sheet (placed under the data table)
            {
              addChart: {
                chart: {
                  spec: {
                    title: `GP Evaluation Scores — ${data.teamName} — ${monthName} ${data.report.reportYear}`,
                    basicChart: {
                      chartType: "COLUMN",
                      legendPosition: "BOTTOM_LEGEND",
                      axis: [
                        { position: "BOTTOM_AXIS", title: "Game Presenter" },
                        { position: "LEFT_AXIS", title: "Score", viewWindowOptions: { viewWindowMin: 0, viewWindowMax: MAX_TOTAL_SCORE } },
                      ],
                      domains: [
                        {
                          domain: {
                            sourceRange: {
                              sources: [{ sheetId: 1, startRowIndex: 0, endRowIndex: gpAverages.length + 1, startColumnIndex: 0, endColumnIndex: 1 }],
                            },
                          },
                        },
                      ],
                      series: [
                        {
                          series: {
                            sourceRange: {
                              sources: [{ sheetId: 1, startRowIndex: 0, endRowIndex: gpAverages.length + 1, startColumnIndex: 3, endColumnIndex: 4 }],
                            },
                          },
                          targetAxis: "LEFT_AXIS",
                          color: { red: 0.267, green: 0.447, blue: 0.769 },
                        },
                        {
                          series: {
                            sourceRange: {
                              sources: [{ sheetId: 1, startRowIndex: 0, endRowIndex: gpAverages.length + 1, startColumnIndex: 1, endColumnIndex: 2 }],
                            },
                          },
                          targetAxis: "LEFT_AXIS",
                          color: { red: 0.439, green: 0.678, blue: 0.278 },
                        },
                        {
                          series: {
                            sourceRange: {
                              sources: [{ sheetId: 1, startRowIndex: 0, endRowIndex: gpAverages.length + 1, startColumnIndex: 2, endColumnIndex: 3 }],
                            },
                          },
                          targetAxis: "LEFT_AXIS",
                          color: { red: 1, green: 0.753, blue: 0 },
                        },
                      ],
                      headerCount: 1,
                    },
                    backgroundColor: { red: 1, green: 1, blue: 1 },
                  },
                  position: {
                    overlayPosition: {
                      anchorCell: { sheetId: 1, rowIndex: gpAverages.length + 2, columnIndex: 0 },
                      widthPixels: 800,
                      heightPixels: 450,
                    },
                  },
                },
              },
            },
          ],
        },
      });
      log.info("Chart and formatting applied");
    } catch (err: any) {
      log.warn("Failed to apply chart/formatting", { error: err.message });
    }
  }

  // Share with user email
  if (userEmail) {
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: {
          type: "user",
          role: "writer",
          emailAddress: userEmail,
        },
        sendNotificationEmail: false,
      });
      log.info("Shared with user", { email: userEmail });
    } catch (err: any) {
      log.warn("Failed to share with user email, making link-accessible", { error: err.message });
      // Fallback: make it accessible via link
      try {
        await drive.permissions.create({
          fileId: spreadsheetId,
          requestBody: {
            type: "anyone",
            role: "writer",
          },
        });
        log.info("Made accessible via link");
      } catch (err2: any) {
        log.warn("Failed to set link sharing", { error: err2.message });
      }
    }
  } else {
    // No email, make accessible via link
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: {
          type: "anyone",
          role: "writer",
        },
      });
      log.info("Made accessible via link (no user email)");
    } catch (err: any) {
      log.warn("Failed to set link sharing", { error: err.message });
    }
  }

  log.info("Google Sheets export complete", { spreadsheetId, spreadsheetUrl });
  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Check if Google Sheets export is available (credentials configured)
 */
export function isGoogleSheetsAvailable(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}
