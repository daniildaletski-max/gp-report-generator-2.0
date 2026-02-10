/**
 * Excel Report Generation Service
 * Extracted from routers.ts to keep route handlers lean
 */
import ExcelJS from "exceljs";
import { MONTH_NAMES, MAX_TOTAL_SCORE } from "@shared/const";
import { createLogger } from "./logger";

const log = createLogger("ExcelService");

interface ChartDataPoint {
  gpName: string;
  evaluations: Array<{
    appearanceScore: number | null;
    gamePerformanceScore: number | null;
  }>;
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

interface ReportData {
  report: {
    id: number;
    teamId: number;
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
// Chart Generation (QuickChart API)
// ============================

export async function generateChartImage(
  labels: string[],
  appearanceScores: number[],
  gamePerformanceScores: number[],
  totalScores: number[],
  title: string
): Promise<Buffer | null> {
  try {
    const chartConfig = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: `Total Score (max ${MAX_TOTAL_SCORE})`,
            data: totalScores,
            backgroundColor: 'rgba(54, 162, 235, 0.9)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.8,
            categoryPercentage: 0.9,
          },
          {
            label: 'Appearance (max 12)',
            data: appearanceScores,
            backgroundColor: 'rgba(75, 192, 192, 0.9)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.8,
            categoryPercentage: 0.9,
          },
          {
            label: 'Game Performance (max 10)',
            data: gamePerformanceScores,
            backgroundColor: 'rgba(255, 159, 64, 0.9)',
            borderColor: 'rgba(255, 159, 64, 1)',
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.8,
            categoryPercentage: 0.9,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: title, font: { size: 18, weight: 'bold' }, padding: { bottom: 20 } },
          legend: { position: 'bottom', labels: { padding: 20, font: { size: 12 } } },
          datalabels: { display: true, anchor: 'end', align: 'top', font: { size: 10, weight: 'bold' }, formatter: (value: number) => value.toFixed(1) },
        },
        scales: {
          y: {
            min: 0,
            max: MAX_TOTAL_SCORE + 1,
            grace: '0',
            ticks: { stepSize: 5 },
            title: { display: true, text: 'Score', font: { size: 14, weight: 'bold' } },
            grid: { color: 'rgba(0, 0, 0, 0.1)' },
          },
          x: {
            title: { display: true, text: 'Game Presenters', font: { size: 14, weight: 'bold' } },
            ticks: { maxRotation: 45, minRotation: 45, font: { size: 11 } },
            grid: { display: false },
          },
        },
      },
    };

    const chartUrl = `https://quickchart.io/chart?v=3&c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=900&h=450&bkg=white`;
    const response = await fetch(chartUrl);
    if (!response.ok) {
      log.error('QuickChart API error', undefined, { status: response.status });
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    log.error('Chart generation failed', error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

export async function generateComparisonChart(
  labels: string[],
  currentScores: number[],
  previousScores: number[],
  currentMonthName: string,
  previousMonthName: string,
  title: string
): Promise<Buffer | null> {
  try {
    const chartConfig = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: currentMonthName, data: currentScores, backgroundColor: 'rgba(54, 162, 235, 0.8)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1 },
          { label: previousMonthName, data: previousScores, backgroundColor: 'rgba(255, 159, 64, 0.6)', borderColor: 'rgba(255, 159, 64, 1)', borderWidth: 1 },
        ],
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: title, font: { size: 16 } }, legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, max: MAX_TOTAL_SCORE + 1, title: { display: true, text: 'Total Score' } },
          x: { title: { display: true, text: 'Game Presenters' } },
        },
      },
    };

    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=700&h=350&bkg=white`;
    const response = await fetch(chartUrl);
    if (!response.ok) {
      log.error('QuickChart comparison API error', undefined, { status: response.status });
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    log.error('Comparison chart generation failed', error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

// ============================
// Excel Color Constants
// ============================

const COLORS = {
  gold: "FFFFC000",
  lightGray: "FFE7E6E6",
  blue: "FF4472C4",
  white: "FFFFFFFF",
  green: "FF92D050",
  lightGreen: "FF70AD47",
  yellow: "FFFFC000",
  red: "FFFF6B6B",
  lightBlue: "FF5B9BD5",
  positiveBackground: "FFD4EDDA",
  positiveText: "FF155724",
  negativeBackground: "FFF8D7DA",
  negativeText: "FF721C24",
  muted: "FF808080",
  mutedLight: "FF666666",
};

// ============================
// Helper: Score Color
// ============================

function getScoreColor(total: number): string {
  if (total >= 18) return COLORS.green;
  if (total >= 15) return COLORS.yellow;
  return COLORS.red;
}

// ============================
// Sheet Builders
// ============================

function buildDataSheet(workbook: ExcelJS.Workbook, gpEvaluationsData: ChartDataPoint[]) {
  const dataSheet = workbook.addWorksheet("Data");
  dataSheet.columns = [
    { width: 4 }, { width: 25 }, { width: 12 }, { width: 12 },
    { width: 4 }, { width: 25 }, { width: 12 }, { width: 12 },
    { width: 4 }, { width: 25 },
  ];

  let dataRow = 9;
  for (let i = 0; i < gpEvaluationsData.length; i += 2) {
    const gp1 = gpEvaluationsData[i];
    const gp2 = gpEvaluationsData[i + 1];

    if (gp1 && gp1.evaluations.length > 0) {
      dataSheet.mergeCells(`B${dataRow}:B${dataRow + 3}`);
      dataSheet.getCell(`B${dataRow}`).value = gp1.gpName;
      dataSheet.getCell(`B${dataRow}`).alignment = { vertical: "middle" };
      dataSheet.getCell(`C${dataRow}`).value = "GAME PERF.";
      dataSheet.getCell(`D${dataRow}`).value = "APPEARANCE";
      dataSheet.getCell(`C${dataRow}`).font = { bold: true };
      dataSheet.getCell(`D${dataRow}`).font = { bold: true };

      for (let j = 0; j < Math.min(4, gp1.evaluations.length); j++) {
        dataSheet.getCell(`C${dataRow + 1 + j}`).value = gp1.evaluations[j].gamePerformanceScore || "";
        dataSheet.getCell(`D${dataRow + 1 + j}`).value = gp1.evaluations[j].appearanceScore || "";
      }

      dataSheet.getCell(`B${dataRow + 5}`).value = "Total average:";
      dataSheet.getCell(`C${dataRow + 5}`).value = { formula: `AVERAGE(C${dataRow + 1}:C${dataRow + 4})` };
      dataSheet.getCell(`D${dataRow + 5}`).value = { formula: `AVERAGE(D${dataRow + 1}:D${dataRow + 4})` };
    }

    if (gp2 && gp2.evaluations.length > 0) {
      dataSheet.mergeCells(`F${dataRow}:F${dataRow + 3}`);
      dataSheet.getCell(`F${dataRow}`).value = gp2.gpName;
      dataSheet.getCell(`F${dataRow}`).alignment = { vertical: "middle" };
      dataSheet.getCell(`G${dataRow}`).value = "GAME PERF.";
      dataSheet.getCell(`H${dataRow}`).value = "APPEARANCE";
      dataSheet.getCell(`G${dataRow}`).font = { bold: true };
      dataSheet.getCell(`H${dataRow}`).font = { bold: true };

      for (let j = 0; j < Math.min(4, gp2.evaluations.length); j++) {
        dataSheet.getCell(`G${dataRow + 1 + j}`).value = gp2.evaluations[j].gamePerformanceScore || "";
        dataSheet.getCell(`H${dataRow + 1 + j}`).value = gp2.evaluations[j].appearanceScore || "";
      }

      dataSheet.getCell(`F${dataRow + 5}`).value = "Total average:";
      dataSheet.getCell(`G${dataRow + 5}`).value = { formula: `AVERAGE(G${dataRow + 1}:G${dataRow + 4})` };
      dataSheet.getCell(`H${dataRow + 5}`).value = { formula: `AVERAGE(H${dataRow + 1}:H${dataRow + 4})` };
    }

    dataRow += 7;
  }
  return dataSheet;
}

function buildChartSheet(
  workbook: ExcelJS.Workbook,
  gpEvaluationsData: ChartDataPoint[],
  teamName: string,
  monthName: string,
  reportYear: number
) {
  const chartSheet = workbook.addWorksheet("Chart");
  chartSheet.columns = [{ width: 25 }, { width: 15 }, { width: 18 }, { width: 12 }];

  chartSheet.mergeCells("A1:D1");
  chartSheet.getCell("A1").value = `${teamName} Performance - ${monthName} ${reportYear}`;
  chartSheet.getCell("A1").font = { bold: true, size: 16 };
  chartSheet.getCell("A1").alignment = { horizontal: "center" };

  const headers = ["Game Presenter", "Appearance", "Game Performance", "Total Score"];
  headers.forEach((h, i) => {
    const cell = chartSheet.getCell(3, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.blue } };
    cell.alignment = { horizontal: "center" };
  });

  let chartDataRow = 4;
  for (const gp of gpEvaluationsData) {
    if (gp.evaluations.length > 0) {
      const avgApp = gp.evaluations.reduce((s, e) => s + (e.appearanceScore || 0), 0) / gp.evaluations.length;
      const avgGP = gp.evaluations.reduce((s, e) => s + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
      const total = avgApp + avgGP;

      chartSheet.getCell(`A${chartDataRow}`).value = gp.gpName;
      chartSheet.getCell(`B${chartDataRow}`).value = Number(avgApp.toFixed(1));
      chartSheet.getCell(`C${chartDataRow}`).value = Number(avgGP.toFixed(1));
      chartSheet.getCell(`D${chartDataRow}`).value = Number(total.toFixed(1));
      chartSheet.getCell(`D${chartDataRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: getScoreColor(total) } };
      chartSheet.getCell(`D${chartDataRow}`).font = { bold: true };
      chartDataRow++;
    }
  }

  // Instructions and summary
  const instructionRow = chartDataRow + 2;
  chartSheet.mergeCells(`A${instructionRow}:D${instructionRow}`);
  chartSheet.getCell(`A${instructionRow}`).value = `To create a chart: Select data A3:D${chartDataRow - 1} > Insert > Chart > Bar Chart`;
  chartSheet.getCell(`A${instructionRow}`).font = { italic: true, color: { argb: COLORS.mutedLight } };

  const summaryRow = instructionRow + 2;
  chartSheet.getCell(`A${summaryRow}`).value = "Summary Statistics";
  chartSheet.getCell(`A${summaryRow}`).font = { bold: true };

  const formulaRows = [
    ["Average Appearance:", `AVERAGE(B4:B${chartDataRow - 1})`],
    ["Average Game Perf:", `AVERAGE(C4:C${chartDataRow - 1})`],
    ["Average Total:", `AVERAGE(D4:D${chartDataRow - 1})`],
    ["Top Score:", `MAX(D4:D${chartDataRow - 1})`],
    ["Lowest Score:", `MIN(D4:D${chartDataRow - 1})`],
  ];
  formulaRows.forEach(([label, formula], i) => {
    chartSheet.getCell(`A${summaryRow + 1 + i}`).value = label;
    chartSheet.getCell(`B${summaryRow + 1 + i}`).value = { formula };
    if (label === "Average Total:") chartSheet.getCell(`B${summaryRow + 1 + i}`).font = { bold: true };
  });

  return chartSheet;
}

function buildAttitudeSheet(
  workbook: ExcelJS.Workbook,
  attendanceData: AttendanceItem[],
  attitudeByGp: AttitudeByGp
): boolean {
  const hasData = Object.values(attitudeByGp).some(a => a.entries.length > 0);
  if (!hasData) return false;

  const sheet = workbook.addWorksheet("Attitude Entries");
  sheet.columns = [{ width: 25 }, { width: 18 }, { width: 12 }, { width: 60 }, { width: 8 }];

  sheet.getRow(1).values = ["GP Name", "Date", "Type", "Comment", "Score"];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.gold } };
  sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };

  let row = 2;
  for (const item of attendanceData) {
    const gpId = item.gamePresenter?.id;
    const gpName = item.gamePresenter?.name || "Unknown";
    const gpAttitude = gpId ? attitudeByGp[gpId] : null;

    if (gpAttitude && gpAttitude.entries.length > 0) {
      for (const entry of gpAttitude.entries) {
        sheet.getRow(row).values = [gpName, entry.date, entry.type, entry.comment, entry.score];
        const typeCell = sheet.getCell(`C${row}`);
        if (entry.type === 'POSITIVE') {
          typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.positiveBackground } };
          typeCell.font = { color: { argb: COLORS.positiveText } };
        } else {
          typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.negativeBackground } };
          typeCell.font = { color: { argb: COLORS.negativeText } };
        }
        const scoreCell = sheet.getCell(`E${row}`);
        scoreCell.font = { color: { argb: entry.score > 0 ? COLORS.positiveText : COLORS.negativeText }, bold: true };
        row++;
      }
    }
  }

  row++;
  const totalPositive = Object.values(attitudeByGp).reduce((s, a) => s + a.positive, 0);
  const totalNegative = Object.values(attitudeByGp).reduce((s, a) => s + a.negative, 0);
  sheet.getRow(row).values = ["TOTAL", "", `+${totalPositive} / -${totalNegative}`, "", ""];
  sheet.getRow(row).font = { bold: true };
  sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.gold } };

  return true;
}

// ============================
// Main Excel Generation
// ============================

export async function generateReportWorkbook(data: ReportData): Promise<Buffer> {
  const { report, teamName, fmName, attendanceData, attitudeByGp, gpEvaluationsData, prevMonthEvaluations } = data;
  const monthName = MONTH_NAMES[report.reportMonth - 1];

  log.info("Generating Excel workbook", { reportId: report.id, teamName, month: monthName });

  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Data
  buildDataSheet(workbook, gpEvaluationsData);

  // Sheet 2: Chart
  buildChartSheet(workbook, gpEvaluationsData, teamName, monthName, report.reportYear);

  // Sheet 3: Monthly Report (the main sheet — complex layout kept in place)
  const mainSheet = workbook.addWorksheet(`${monthName} ${report.reportYear}`);
  buildMonthlySheet(mainSheet, data, monthName, fmName, teamName, gpEvaluationsData, attendanceData, attitudeByGp);

  // Embed chart images into the monthly sheet
  await embedChartImages(workbook, mainSheet, gpEvaluationsData, prevMonthEvaluations, teamName, monthName, report);

  // Sheet 4: Attitude Entries (optional)
  buildAttitudeSheet(workbook, attendanceData, attitudeByGp);

  const buffer = await workbook.xlsx.writeBuffer();
  log.info("Workbook generated successfully", { reportId: report.id, sheets: workbook.worksheets.length });
  return Buffer.from(buffer);
}

// ============================
// Monthly Sheet Builder (complex layout)
// ============================

function buildMonthlySheet(
  mainSheet: ExcelJS.Worksheet,
  data: ReportData,
  monthName: string,
  fmName: string,
  teamName: string,
  gpEvaluationsData: ChartDataPoint[],
  attendanceData: AttendanceItem[],
  attitudeByGp: AttitudeByGp
) {
  const { report } = data;

  // Column widths
  mainSheet.columns = [
    { width: 9 }, { width: 13 }, { width: 13 }, { width: 13 },
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 },
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 },
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 },
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 12.25 },
    { width: 9 }, { width: 13 }, { width: 13 }, { width: 13 },
    { width: 13 }, { width: 13 }, { width: 9 }, { width: 13 },
    { width: 13 }, { width: 25.5 }, { width: 29.5 },
  ];

  // Title
  mainSheet.mergeCells("A2:H3");
  const titleCell = mainSheet.getCell("A2");
  titleCell.value = `${fmName} - ${teamName}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.lightGray } };

  mainSheet.mergeCells("N2:AE3");
  const overviewTitle = mainSheet.getCell("N2");
  overviewTitle.value = `${teamName} Overview ${monthName} ${report.reportYear}`;
  overviewTitle.font = { bold: true, size: 14 };
  overviewTitle.alignment = { horizontal: "center", vertical: "middle" };
  overviewTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.lightGray } };

  // FM Performance section
  mainSheet.mergeCells("A4:H5");
  setHeaderCell(mainSheet.getCell("A4"), "FM Performance (self evaluation)");

  mainSheet.mergeCells("I4:L9");
  mainSheet.getCell("I4").value = "Please evaluate your performance as a Floor Manager - your studio operations, teamwork with colleagues, and if there are any issues etc)";
  mainSheet.getCell("I4").alignment = { wrapText: true, vertical: "top" };

  // Attendance table headers
  const attendanceHeaders: Array<{ range: string; cell: string; label: string }> = [
    { range: "N4:P5", cell: "N4", label: "Name " },
    { range: "Q4:R5", cell: "Q4", label: "Mistakes" },
    { range: "S4:T5", cell: "S4", label: "Extra shifts/\nStaying longer" },
    { range: "U4:V5", cell: "U4", label: "Late to work" },
    { range: "W4:X5", cell: "W4", label: "Missed days" },
    { range: "Y4:Z5", cell: "Y4", label: "Sick leaves " },
    { range: "AA4:AE5", cell: "AA4", label: "Attitude/ Concerns/ Remarks" },
  ];
  for (const h of attendanceHeaders) {
    mainSheet.mergeCells(h.range);
    setHeaderCell(mainSheet.getCell(h.cell), h.label);
    mainSheet.getCell(h.cell).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }

  // FM Performance text
  mainSheet.mergeCells("A6:H19");
  mainSheet.getCell("A6").value = report.fmPerformance || "";
  mainSheet.getCell("A6").alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell("A6").border = thinBorder();

  // Attendance data rows
  let gpRow = 6;
  for (const item of attendanceData) {
    if (gpRow > 34) break;
    fillAttendanceRow(mainSheet, gpRow, item, attitudeByGp);
    gpRow += 2;
  }

  // Team Management section
  mainSheet.mergeCells("A21:H22");
  setHeaderCell(mainSheet.getCell("A21"), "Team Management");

  mainSheet.mergeCells("I21:L25");
  mainSheet.getCell("I21").value = "Please write about your team - what were your goals for this month, did you achieve your set goals, did you have enough time to finish everything, etc.)";
  mainSheet.getCell("I21").alignment = { wrapText: true, vertical: "top" };

  mainSheet.mergeCells("A23:D23");
  mainSheet.getCell("A23").value = "Goals this month:";
  mainSheet.getCell("A23").font = { bold: true };

  mainSheet.mergeCells("E23:H23");
  mainSheet.getCell("E23").value = "Team Overview:";
  mainSheet.getCell("E23").font = { bold: true };

  mainSheet.mergeCells("A24:D36");
  mainSheet.getCell("A24").value = report.goalsThisMonth || "";
  mainSheet.getCell("A24").alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell("A24").border = thinBorder();

  mainSheet.mergeCells("E24:H36");
  mainSheet.getCell("E24").value = report.teamOverview || "";
  mainSheet.getCell("E24").alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell("E24").border = thinBorder();

  // TOTAL row
  mainSheet.mergeCells("N36:P37");
  const totalCell = mainSheet.getCell("N36");
  totalCell.value = "TOTAL";
  totalCell.font = { bold: true };
  totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.gold } };
  totalCell.alignment = { horizontal: "center", vertical: "middle" };

  const sumCols = ["Q36:R37", "S36:T37", "U36:V37", "W36:X37", "Y36:Z37"];
  const sumFormulas = ["SUM(Q4:R35)", "SUM(S4:T35)", "SUM(U4:V35)", "SUM(W4:X35)", "SUM(Y4:Z35)"];
  sumCols.forEach((range, i) => {
    mainSheet.mergeCells(range);
    const c = mainSheet.getCell(range.split(":")[0]);
    c.value = { formula: sumFormulas[i] };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder();
  });

  // Borders for attendance
  for (let row = 4; row <= 37; row++) {
    mainSheet.getCell(`N${row}`).border = { left: { style: "thin" } };
    mainSheet.getCell(`AE${row}`).border = { right: { style: "thin" } };
  }

  // Additional Notes
  mainSheet.mergeCells("A38:H39");
  setHeaderCell(mainSheet.getCell("A38"), "Additional Notes");

  mainSheet.mergeCells("I38:K40");
  mainSheet.getCell("I38").value = "Are there any additional comments from the previous month you would like to add?";
  mainSheet.getCell("I38").alignment = { wrapText: true, vertical: "top" };

  mainSheet.mergeCells("N39:P39");
  mainSheet.getCell("N39").value = "Paste the table here (delete old): (from Data)";
  mainSheet.getCell("N39").font = { italic: true, color: { argb: COLORS.muted } };

  mainSheet.mergeCells("A40:H53");
  mainSheet.getCell("A40").value = report.additionalComments || "";
  mainSheet.getCell("A40").alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell("A40").border = thinBorder();

  // Performance Analysis section
  addPerformanceAnalysis(mainSheet, gpEvaluationsData);
}

// ============================
// Helpers
// ============================

function setHeaderCell(cell: ExcelJS.Cell, value: string) {
  cell.value = value;
  cell.font = { bold: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.gold } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function fillAttendanceRow(
  sheet: ExcelJS.Worksheet,
  gpRow: number,
  item: AttendanceItem,
  attitudeByGp: AttitudeByGp
) {
  const mergeAndCenter = (range: string, value: any) => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = value;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  };

  sheet.mergeCells(`N${gpRow}:P${gpRow + 1}`);
  sheet.getCell(`N${gpRow}`).value = item.gamePresenter?.name || "";
  sheet.getCell(`N${gpRow}`).alignment = { vertical: "middle" };

  mergeAndCenter(`Q${gpRow}:R${gpRow + 1}`, item.monthlyStats?.mistakes ?? item.attendance?.mistakes ?? 0);
  mergeAndCenter(`S${gpRow}:T${gpRow + 1}`, item.attendance?.extraShifts || 0);
  mergeAndCenter(`U${gpRow}:V${gpRow + 1}`, item.attendance?.lateToWork || 0);
  mergeAndCenter(`W${gpRow}:X${gpRow + 1}`, item.attendance?.missedDays || 0);
  mergeAndCenter(`Y${gpRow}:Z${gpRow + 1}`, item.attendance?.sickLeaves || 0);

  // Attitude remarks
  sheet.mergeCells(`AA${gpRow}:AE${gpRow + 1}`);
  const gpId = item.gamePresenter?.id;
  const gpAttitude = gpId ? attitudeByGp[gpId] : null;

  let attitudeText = "";
  if (gpAttitude && gpAttitude.entries.length > 0) {
    attitudeText = `Attitude: +${gpAttitude.positive}/-${gpAttitude.negative}`;
    const comments = gpAttitude.entries.slice(0, 2).map(e =>
      `${e.type === 'POSITIVE' ? '+' : '-'} ${e.comment.substring(0, 50)}${e.comment.length > 50 ? '...' : ''}`
    );
    if (comments.length > 0) attitudeText += " | " + comments.join("; ");
  } else if (item.monthlyStats?.attitude) {
    attitudeText = `Attitude: ${item.monthlyStats.attitude}/5`;
  }

  const remarksText = item.attendance?.remarks || item.monthlyStats?.notes || "";
  sheet.getCell(`AA${gpRow}`).value = [attitudeText, remarksText].filter(Boolean).join(" | ");
  sheet.getCell(`AA${gpRow}`).alignment = { wrapText: true, vertical: "middle" };
}

function addPerformanceAnalysis(sheet: ExcelJS.Worksheet, gpEvaluationsData: ChartDataPoint[]) {
  let totalEvaluations = 0;
  let totalAppearance = 0;
  let totalGamePerf = 0;
  const performers: { name: string; score: number }[] = [];

  for (const gp of gpEvaluationsData) {
    if (gp.evaluations.length > 0) {
      const avgApp = gp.evaluations.reduce((s, e) => s + (e.appearanceScore || 0), 0) / gp.evaluations.length;
      const avgGP = gp.evaluations.reduce((s, e) => s + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
      totalEvaluations += gp.evaluations.length;
      totalAppearance += avgApp * gp.evaluations.length;
      totalGamePerf += avgGP * gp.evaluations.length;
      performers.push({ name: gp.gpName, score: avgApp + avgGP });
    }
  }

  performers.sort((a, b) => b.score - a.score);
  const top3 = performers.slice(0, 3);
  const bottom3 = performers.slice(-3).reverse();
  const teamAvgApp = totalEvaluations > 0 ? (totalAppearance / totalEvaluations).toFixed(1) : 'N/A';
  const teamAvgGP = totalEvaluations > 0 ? (totalGamePerf / totalEvaluations).toFixed(1) : 'N/A';

  // Performance Analysis header
  sheet.mergeCells("A55:H56");
  sheet.getCell("A55").value = "Performance Analysis (Auto-generated)";
  sheet.getCell("A55").font = { bold: true, color: { argb: COLORS.white }, size: 12 };
  sheet.getCell("A55").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.blue } };
  sheet.getCell("A55").alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("A57:D57");
  sheet.getCell("A57").value = "Team Statistics";
  sheet.getCell("A57").font = { bold: true };
  sheet.getCell("A58").value = "Total Evaluations:";
  sheet.getCell("B58").value = totalEvaluations;
  sheet.getCell("A59").value = "Avg Appearance:";
  sheet.getCell("B59").value = teamAvgApp;
  sheet.getCell("A60").value = "Avg Game Performance:";
  sheet.getCell("B60").value = teamAvgGP;

  sheet.mergeCells("E57:H57");
  sheet.getCell("E57").value = "Top Performers";
  sheet.getCell("E57").font = { bold: true };
  sheet.getCell("E57").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.green } };

  for (let i = 0; i < Math.min(3, top3.length); i++) {
    sheet.getCell(`E${58 + i}`).value = `${i + 1}. ${top3[i].name}`;
    sheet.getCell(`H${58 + i}`).value = top3[i].score.toFixed(1);
  }

  sheet.mergeCells("A62:D62");
  sheet.getCell("A62").value = "Needs Improvement";
  sheet.getCell("A62").font = { bold: true };
  sheet.getCell("A62").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.red } };

  for (let i = 0; i < Math.min(3, bottom3.length); i++) {
    sheet.getCell(`A${63 + i}`).value = `${i + 1}. ${bottom3[i].name}`;
    sheet.getCell(`D${63 + i}`).value = bottom3[i].score.toFixed(1);
  }

  // Chart data table
  addChartDataTable(sheet, gpEvaluationsData, teamAvgApp, teamAvgGP);
}

function addChartDataTable(
  sheet: ExcelJS.Worksheet,
  gpEvaluationsData: ChartDataPoint[],
  teamAvgApp: string,
  teamAvgGP: string
) {
  sheet.mergeCells("A67:H68");
  sheet.getCell("A67").value = "Monthly Performance Data (for Chart)";
  sheet.getCell("A67").font = { bold: true, color: { argb: COLORS.white }, size: 12 };
  sheet.getCell("A67").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.blue } };

  const headers = [["A69", "GP Name"], ["B69", "Appearance"], ["C69", "Game Perf"], ["D69", "Total"]];
  headers.forEach(([cell, val]) => {
    sheet.getCell(cell).value = val;
    sheet.getCell(cell).font = { bold: true };
  });

  let chartRow = 70;
  for (const gp of gpEvaluationsData) {
    if (gp.evaluations.length > 0 && chartRow <= 85) {
      const avgApp = gp.evaluations.reduce((s, e) => s + (e.appearanceScore || 0), 0) / gp.evaluations.length;
      const avgGP = gp.evaluations.reduce((s, e) => s + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
      const total = avgApp + avgGP;

      sheet.getCell(`A${chartRow}`).value = gp.gpName;
      sheet.getCell(`B${chartRow}`).value = Number(avgApp.toFixed(1));
      sheet.getCell(`C${chartRow}`).value = Number(avgGP.toFixed(1));
      sheet.getCell(`D${chartRow}`).value = Number(total.toFixed(1));
      sheet.getCell(`D${chartRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: getScoreColor(total) } };
      chartRow++;
    }
  }

  // Team average
  sheet.getCell(`A${chartRow}`).value = "TEAM AVERAGE";
  sheet.getCell(`A${chartRow}`).font = { bold: true };
  sheet.getCell(`B${chartRow}`).value = teamAvgApp;
  sheet.getCell(`B${chartRow}`).font = { bold: true };
  sheet.getCell(`C${chartRow}`).value = teamAvgGP;
  sheet.getCell(`C${chartRow}`).font = { bold: true };
  if (teamAvgApp === 'N/A' || teamAvgGP === 'N/A') {
    sheet.getCell(`D${chartRow}`).value = 'N/A';
  } else {
    sheet.getCell(`D${chartRow}`).value = (parseFloat(teamAvgApp) + parseFloat(teamAvgGP)).toFixed(1);
  }
  sheet.getCell(`D${chartRow}`).font = { bold: true };

  // Visual bars section
  addVisualBars(sheet, gpEvaluationsData, chartRow);
}

function addVisualBars(sheet: ExcelJS.Worksheet, gpEvaluationsData: ChartDataPoint[], chartRow: number) {
  const chartStartRow = chartRow + 3;
  sheet.mergeCells(`A${chartStartRow}:H${chartStartRow + 1}`);
  sheet.getCell(`A${chartStartRow}`).value = "GP Performance Chart (Visual Representation)";
  sheet.getCell(`A${chartStartRow}`).font = { bold: true, color: { argb: COLORS.white }, size: 12 };
  sheet.getCell(`A${chartStartRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.blue } };
  sheet.getCell(`A${chartStartRow}`).alignment = { horizontal: "center", vertical: "middle" };

  let visualRow = chartStartRow + 3;
  sheet.getCell(`A${visualRow}`).value = "GP Name";
  sheet.getCell(`A${visualRow}`).font = { bold: true };
  sheet.getCell(`B${visualRow}`).value = "Appearance (max 12)";
  sheet.getCell(`B${visualRow}`).font = { bold: true };
  sheet.getCell(`E${visualRow}`).value = "Game Perf (max 10)";
  sheet.getCell(`E${visualRow}`).font = { bold: true };
  sheet.getCell(`H${visualRow}`).value = "Total";
  sheet.getCell(`H${visualRow}`).font = { bold: true };
  visualRow++;

  for (const gp of gpEvaluationsData) {
    if (gp.evaluations.length > 0 && visualRow <= chartStartRow + 20) {
      const avgApp = gp.evaluations.reduce((s, e) => s + (e.appearanceScore || 0), 0) / gp.evaluations.length;
      const avgGP = gp.evaluations.reduce((s, e) => s + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
      const total = avgApp + avgGP;

      sheet.getCell(`A${visualRow}`).value = gp.gpName;

      const appBarWidth = Math.round((avgApp / 12) * 3);
      for (let i = 0; i < 3; i++) {
        const col = String.fromCharCode(66 + i);
        if (i < appBarWidth) {
          sheet.getCell(`${col}${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.lightBlue } };
        }
        sheet.getCell(`${col}${visualRow}`).border = thinBorder();
      }
      sheet.getCell(`D${visualRow}`).value = avgApp.toFixed(1);

      const gpBarWidth = Math.round((avgGP / 10) * 3);
      for (let i = 0; i < 3; i++) {
        const col = String.fromCharCode(69 + i);
        if (i < gpBarWidth) {
          sheet.getCell(`${col}${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.lightGreen } };
        }
        sheet.getCell(`${col}${visualRow}`).border = thinBorder();
      }
      sheet.getCell(`G${visualRow}`).value = avgGP.toFixed(1);

      sheet.getCell(`H${visualRow}`).value = total.toFixed(1);
      sheet.getCell(`H${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: getScoreColor(total) } };
      sheet.getCell(`H${visualRow}`).font = { bold: true };

      visualRow++;
    }
  }

  // Legend
  visualRow += 2;
  sheet.getCell(`A${visualRow}`).value = "Legend:";
  sheet.getCell(`A${visualRow}`).font = { bold: true };
  sheet.getCell(`B${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.lightBlue } };
  sheet.getCell(`C${visualRow}`).value = "Appearance";
  sheet.getCell(`D${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.lightGreen } };
  sheet.getCell(`E${visualRow}`).value = "Game Performance";

  visualRow++;
  sheet.getCell(`A${visualRow}`).value = "Score colors:";
  sheet.getCell(`A${visualRow}`).font = { bold: true };
  sheet.getCell(`B${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.green } };
  sheet.getCell(`C${visualRow}`).value = ">=18 (Excellent)";
  sheet.getCell(`D${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.yellow } };
  sheet.getCell(`E${visualRow}`).value = ">=15 (Good)";
  sheet.getCell(`F${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.red } };
  sheet.getCell(`G${visualRow}`).value = "<15 (Needs Improvement)";
}

async function embedChartImages(
  workbook: ExcelJS.Workbook,
  mainSheet: ExcelJS.Worksheet,
  gpEvaluationsData: ChartDataPoint[],
  prevMonthEvaluations: ChartDataPoint[],
  teamName: string,
  monthName: string,
  report: ReportData["report"]
) {
  const chartLabels: string[] = [];
  const appearanceScores: number[] = [];
  const gamePerformanceScores: number[] = [];
  const totalScores: number[] = [];

  for (const gp of gpEvaluationsData) {
    if (gp.evaluations.length > 0) {
      const avgApp = gp.evaluations.reduce((s, e) => s + (e.appearanceScore || 0), 0) / gp.evaluations.length;
      const avgGP = gp.evaluations.reduce((s, e) => s + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
      chartLabels.push(gp.gpName);
      appearanceScores.push(Number(avgApp.toFixed(1)));
      gamePerformanceScores.push(Number(avgGP.toFixed(1)));
      totalScores.push(Number((avgApp + avgGP).toFixed(1)));
    }
  }

  if (chartLabels.length === 0) return;

  const chartTitle = `${teamName} Performance - ${monthName} ${report.reportYear}`;
  const chartImageBuffer = await generateChartImage(chartLabels, appearanceScores, gamePerformanceScores, totalScores, chartTitle);

  if (chartImageBuffer) {
    const imageId = workbook.addImage({ buffer: chartImageBuffer as any, extension: 'png' });
    mainSheet.addImage(imageId, { tl: { col: 13, row: 40 }, ext: { width: 700, height: 350 } });
    log.debug("Chart image added to month sheet");
  } else {
    mainSheet.mergeCells("N42:AA45");
    mainSheet.getCell("N42").value = "Chart could not be generated. Please check the Data sheet for performance data.";
    mainSheet.getCell("N42").alignment = { wrapText: true, vertical: "top" };
    mainSheet.getCell("N42").font = { italic: true, color: { argb: COLORS.mutedLight } };
  }

  // Comparison chart
  const prevMonth = report.reportMonth === 1 ? 12 : report.reportMonth - 1;
  const prevMonthScoresMap = new Map<string, number>();
  for (const gp of prevMonthEvaluations) {
    if (gp.evaluations.length > 0) {
      const avgApp = gp.evaluations.reduce((s, e) => s + (e.appearanceScore || 0), 0) / gp.evaluations.length;
      const avgGP = gp.evaluations.reduce((s, e) => s + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
      prevMonthScoresMap.set(gp.gpName, Number((avgApp + avgGP).toFixed(1)));
    }
  }

  if (prevMonthScoresMap.size > 0) {
    const comparisonLabels: string[] = [];
    const currentMonthScores: number[] = [];
    const previousMonthScores: number[] = [];

    for (let i = 0; i < chartLabels.length; i++) {
      const prevScore = prevMonthScoresMap.get(chartLabels[i]);
      if (prevScore !== undefined) {
        comparisonLabels.push(chartLabels[i]);
        currentMonthScores.push(totalScores[i]);
        previousMonthScores.push(prevScore);
      }
    }

    if (comparisonLabels.length > 0) {
      const prevMonthName = MONTH_NAMES[prevMonth - 1];
      const comparisonChartBuffer = await generateComparisonChart(
        comparisonLabels, currentMonthScores, previousMonthScores,
        monthName, prevMonthName,
        `Performance Comparison: ${monthName} vs ${prevMonthName}`
      );

      if (comparisonChartBuffer) {
        const comparisonImageId = workbook.addImage({ buffer: comparisonChartBuffer as any, extension: 'png' });
        mainSheet.addImage(comparisonImageId, { tl: { col: 13, row: 62 }, ext: { width: 700, height: 350 } });
        log.debug("Comparison chart added to month sheet");
      }
    }
  }
}
