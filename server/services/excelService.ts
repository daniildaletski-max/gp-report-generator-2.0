/**
 * Excel Report Generation Service v2.0
 * Major quality upgrade: dynamic rows, executive summary, improved formatting
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
  // Optional supplementary data — render extra sheets only when present.
  actionItems?: ActionItemSummary[];
  bonusSummary?: BonusSummary[];
}

interface ActionItemSummary {
  gpName: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  source: string;
  dueDate: Date | string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
}

interface BonusSummary {
  gpName: string;
  bonusLevel: "level1" | "level2" | "ineligible";
  bonusAmount: number;
  bonusRate: number;
  achievedGGs: number;
  totalGames: number;
  errorCount: number;
  hoursWorked: number;
  disqualifyingFactors: string[];
}

// ============================
// Color Constants
// ============================

const COLORS = {
  // Primary palette
  gold: "FFFFC000",
  goldLight: "FFFFF2CC",
  goldDark: "FFD4A017",
  
  // Neutrals
  white: "FFFFFFFF",
  lightGray: "FFF2F2F2",
  mediumGray: "FFE7E6E6",
  darkGray: "FF404040",
  black: "FF1A1A1A",
  
  // Blues
  blue: "FF4472C4",
  blueLight: "FFD6E4F0",
  blueDark: "FF2F5496",
  navyBlue: "FF1F3864",
  
  // Greens
  green: "FF70AD47",
  greenLight: "FFE2EFDA",
  greenDark: "FF548235",
  
  // Reds
  red: "FFFF4444",
  redLight: "FFFCE4EC",
  redDark: "FFC00000",
  
  // Yellows / Warnings
  yellow: "FFFFC000",
  yellowLight: "FFFFF9E6",
  
  // Accent
  teal: "FF00B0A0",
  purple: "FF7B68EE",
  
  // Attitude
  positiveBackground: "FFD4EDDA",
  positiveText: "FF155724",
  negativeBackground: "FFF8D7DA",
  negativeText: "FF721C24",
};

// ============================
// Shared Helpers
// ============================

function getScoreColor(total: number): string {
  if (total >= 20) return COLORS.greenDark;
  if (total >= 18) return COLORS.green;
  if (total >= 16) return COLORS.yellow;
  if (total >= 14) return COLORS.gold;
  return COLORS.red;
}

function getScoreBgColor(total: number): string {
  if (total >= 20) return COLORS.greenLight;
  if (total >= 18) return "FFE8F5E9";
  if (total >= 16) return COLORS.yellowLight;
  if (total >= 14) return COLORS.goldLight;
  return COLORS.redLight;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function thickBottomBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "medium" },
    right: { style: "thin" },
  };
}

function headerFill(color: string = COLORS.gold): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function setHeaderCell(cell: ExcelJS.Cell, value: string, bgColor: string = COLORS.gold) {
  cell.value = value;
  cell.font = { bold: true, size: 11 };
  cell.fill = headerFill(bgColor);
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = thinBorder();
}

/** Compute GP averages from evaluations */
function computeGpAverages(gpEvaluationsData: ChartDataPoint[]) {
  return gpEvaluationsData
    .filter(gp => gp.evaluations.length > 0)
    .map(gp => {
      const avgApp = gp.evaluations.reduce((s, e) => s + (e.appearanceScore || 0), 0) / gp.evaluations.length;
      const avgGP = gp.evaluations.reduce((s, e) => s + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
      const total = avgApp + avgGP;
      return { name: gp.gpName, appearance: Number(avgApp.toFixed(1)), gamePerf: Number(avgGP.toFixed(1)), total: Number(total.toFixed(1)), evalCount: gp.evaluations.length };
    })
    .sort((a, b) => b.total - a.total);
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
            backgroundColor: 'rgba(68, 114, 196, 0.85)',
            borderColor: 'rgba(68, 114, 196, 1)',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.75,
            categoryPercentage: 0.85,
          },
          {
            label: 'Appearance (max 12)',
            data: appearanceScores,
            backgroundColor: 'rgba(112, 173, 71, 0.85)',
            borderColor: 'rgba(112, 173, 71, 1)',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.75,
            categoryPercentage: 0.85,
          },
          {
            label: 'Game Performance (max 10)',
            data: gamePerformanceScores,
            backgroundColor: 'rgba(255, 192, 0, 0.85)',
            borderColor: 'rgba(255, 192, 0, 1)',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.75,
            categoryPercentage: 0.85,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: title, font: { size: 16, weight: 'bold' }, padding: { bottom: 16 }, color: '#1a1a1a' },
          legend: { position: 'bottom', labels: { padding: 16, font: { size: 11 }, usePointStyle: true, pointStyle: 'rectRounded' } },
          datalabels: { display: true, anchor: 'end', align: 'top', font: { size: 9, weight: 'bold' }, color: '#333', formatter: (value: number) => value.toFixed(1) },
        },
        scales: {
          y: {
            min: 0,
            max: MAX_TOTAL_SCORE + 2,
            ticks: { stepSize: 2, font: { size: 10 } },
            title: { display: true, text: 'Score', font: { size: 12, weight: 'bold' } },
            grid: { color: 'rgba(0, 0, 0, 0.06)' },
          },
          x: {
            title: { display: true, text: 'Game Presenters', font: { size: 12, weight: 'bold' } },
            ticks: { maxRotation: 45, minRotation: 0, font: { size: 10 } },
            grid: { display: false },
          },
        },
      },
    };

    const chartUrl = `https://quickchart.io/chart?v=3&c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=900&h=420&bkg=white&f=png`;
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
          { label: currentMonthName, data: currentScores, backgroundColor: 'rgba(68, 114, 196, 0.8)', borderColor: 'rgba(68, 114, 196, 1)', borderWidth: 1, borderRadius: 4 },
          { label: previousMonthName, data: previousScores, backgroundColor: 'rgba(255, 192, 0, 0.7)', borderColor: 'rgba(255, 192, 0, 1)', borderWidth: 1, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: title, font: { size: 14, weight: 'bold' }, color: '#1a1a1a' },
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded' } },
          datalabels: { display: true, anchor: 'end', align: 'top', font: { size: 9 }, formatter: (value: number) => value.toFixed(1) },
        },
        scales: {
          y: { beginAtZero: true, max: MAX_TOTAL_SCORE + 2, title: { display: true, text: 'Total Score' } },
          x: { title: { display: true, text: 'Game Presenters' } },
        },
      },
    };

    const chartUrl = `https://quickchart.io/chart?v=3&c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=800&h=380&bkg=white&f=png`;
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
// Sheet 1: Data Sheet (Individual GP Scores)
// ============================

function buildDataSheet(workbook: ExcelJS.Workbook, gpEvaluationsData: ChartDataPoint[]) {
  const dataSheet = workbook.addWorksheet("Data");
  
  // Column widths
  dataSheet.columns = [
    { width: 4 }, { width: 25 }, { width: 14 }, { width: 14 },
    { width: 4 }, { width: 25 }, { width: 14 }, { width: 14 },
  ];

  // Title
  dataSheet.mergeCells("A1:H1");
  const titleCell = dataSheet.getCell("A1");
  titleCell.value = "Individual GP Evaluation Scores";
  titleCell.font = { bold: true, size: 14, color: { argb: COLORS.white } };
  titleCell.fill = headerFill(COLORS.navyBlue);
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  dataSheet.getRow(1).height = 30;

  // Instructions
  dataSheet.mergeCells("A2:H2");
  dataSheet.getCell("A2").value = "Raw evaluation data per GP — Game Performance (max 5+5=10) and Appearance (max 3+3+3+3=12)";
  dataSheet.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF666666" } };
  dataSheet.getCell("A2").alignment = { horizontal: "center" };

  // Column headers for each GP block
  const headerRow = 4;
  
  // Left block headers
  dataSheet.getCell(`B${headerRow}`).value = "GP Name";
  dataSheet.getCell(`C${headerRow}`).value = "Game Perf.";
  dataSheet.getCell(`D${headerRow}`).value = "Appearance";
  // Right block headers
  dataSheet.getCell(`F${headerRow}`).value = "GP Name";
  dataSheet.getCell(`G${headerRow}`).value = "Game Perf.";
  dataSheet.getCell(`H${headerRow}`).value = "Appearance";
  
  for (const col of ["B", "C", "D", "F", "G", "H"]) {
    const cell = dataSheet.getCell(`${col}${headerRow}`);
    cell.font = { bold: true, size: 10, color: { argb: COLORS.white } };
    cell.fill = headerFill(COLORS.blue);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder();
  }

  // Data rows — two GPs side by side
  let dataRow = headerRow + 1;
  for (let i = 0; i < gpEvaluationsData.length; i += 2) {
    const gp1 = gpEvaluationsData[i];
    const gp2 = gpEvaluationsData[i + 1];

    const maxEvals = Math.max(
      gp1?.evaluations.length || 0,
      gp2?.evaluations.length || 0,
      1
    );

    // GP1 (left side)
    if (gp1 && gp1.evaluations.length > 0) {
      // Merge name cells
      if (maxEvals > 1) {
        dataSheet.mergeCells(`B${dataRow}:B${dataRow + maxEvals - 1}`);
      }
      dataSheet.getCell(`B${dataRow}`).value = gp1.gpName;
      dataSheet.getCell(`B${dataRow}`).alignment = { vertical: "middle" };
      dataSheet.getCell(`B${dataRow}`).font = { bold: true };
      dataSheet.getCell(`B${dataRow}`).border = thinBorder();

      for (let j = 0; j < gp1.evaluations.length; j++) {
        const gpCell = dataSheet.getCell(`C${dataRow + j}`);
        gpCell.value = gp1.evaluations[j].gamePerformanceScore ?? "";
        gpCell.alignment = { horizontal: "center" };
        gpCell.border = thinBorder();
        
        const appCell = dataSheet.getCell(`D${dataRow + j}`);
        appCell.value = gp1.evaluations[j].appearanceScore ?? "";
        appCell.alignment = { horizontal: "center" };
        appCell.border = thinBorder();
      }

      // Average row
      const avgRow = dataRow + maxEvals;
      dataSheet.getCell(`B${avgRow}`).value = "Average:";
      dataSheet.getCell(`B${avgRow}`).font = { bold: true, italic: true, size: 10 };
      dataSheet.getCell(`B${avgRow}`).border = thickBottomBorder();
      dataSheet.getCell(`C${avgRow}`).value = { formula: `AVERAGE(C${dataRow}:C${dataRow + gp1.evaluations.length - 1})` };
      dataSheet.getCell(`C${avgRow}`).font = { bold: true };
      dataSheet.getCell(`C${avgRow}`).numFmt = '0.0';
      dataSheet.getCell(`C${avgRow}`).border = thickBottomBorder();
      dataSheet.getCell(`D${avgRow}`).value = { formula: `AVERAGE(D${dataRow}:D${dataRow + gp1.evaluations.length - 1})` };
      dataSheet.getCell(`D${avgRow}`).font = { bold: true };
      dataSheet.getCell(`D${avgRow}`).numFmt = '0.0';
      dataSheet.getCell(`D${avgRow}`).border = thickBottomBorder();
    }

    // GP2 (right side)
    if (gp2 && gp2.evaluations.length > 0) {
      if (maxEvals > 1) {
        dataSheet.mergeCells(`F${dataRow}:F${dataRow + maxEvals - 1}`);
      }
      dataSheet.getCell(`F${dataRow}`).value = gp2.gpName;
      dataSheet.getCell(`F${dataRow}`).alignment = { vertical: "middle" };
      dataSheet.getCell(`F${dataRow}`).font = { bold: true };
      dataSheet.getCell(`F${dataRow}`).border = thinBorder();

      for (let j = 0; j < gp2.evaluations.length; j++) {
        const gpCell = dataSheet.getCell(`G${dataRow + j}`);
        gpCell.value = gp2.evaluations[j].gamePerformanceScore ?? "";
        gpCell.alignment = { horizontal: "center" };
        gpCell.border = thinBorder();
        
        const appCell = dataSheet.getCell(`H${dataRow + j}`);
        appCell.value = gp2.evaluations[j].appearanceScore ?? "";
        appCell.alignment = { horizontal: "center" };
        appCell.border = thinBorder();
      }

      const avgRow = dataRow + maxEvals;
      dataSheet.getCell(`F${avgRow}`).value = "Average:";
      dataSheet.getCell(`F${avgRow}`).font = { bold: true, italic: true, size: 10 };
      dataSheet.getCell(`F${avgRow}`).border = thickBottomBorder();
      dataSheet.getCell(`G${avgRow}`).value = { formula: `AVERAGE(G${dataRow}:G${dataRow + gp2.evaluations.length - 1})` };
      dataSheet.getCell(`G${avgRow}`).font = { bold: true };
      dataSheet.getCell(`G${avgRow}`).numFmt = '0.0';
      dataSheet.getCell(`G${avgRow}`).border = thickBottomBorder();
      dataSheet.getCell(`H${avgRow}`).value = { formula: `AVERAGE(H${dataRow}:H${dataRow + gp2.evaluations.length - 1})` };
      dataSheet.getCell(`H${avgRow}`).font = { bold: true };
      dataSheet.getCell(`H${avgRow}`).numFmt = '0.0';
      dataSheet.getCell(`H${avgRow}`).border = thickBottomBorder();
    }

    dataRow += maxEvals + 2; // +1 for average row, +1 for spacing
  }

  return dataSheet;
}

// ============================
// Sheet 2: Chart Data Sheet (Summary Table)
// ============================

function buildChartSheet(
  workbook: ExcelJS.Workbook,
  gpEvaluationsData: ChartDataPoint[],
  teamName: string,
  monthName: string,
  reportYear: number
) {
  const chartSheet = workbook.addWorksheet("Chart");
  chartSheet.columns = [{ width: 28 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 18 }];

  // Title
  chartSheet.mergeCells("A1:F1");
  const titleCell = chartSheet.getCell("A1");
  titleCell.value = `${teamName} Performance Summary — ${monthName} ${reportYear}`;
  titleCell.font = { bold: true, size: 14, color: { argb: COLORS.white } };
  titleCell.fill = headerFill(COLORS.navyBlue);
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  chartSheet.getRow(1).height = 30;

  // Headers
  const headers = ["Game Presenter", "Appearance", "Game Performance", "Total Score", "Evaluations", "Performance Level"];
  headers.forEach((h, i) => {
    const cell = chartSheet.getCell(3, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: COLORS.white } };
    cell.fill = headerFill(COLORS.blue);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder();
  });

  const gpAverages = computeGpAverages(gpEvaluationsData);
  let chartDataRow = 4;

  for (const gp of gpAverages) {
    chartSheet.getCell(`A${chartDataRow}`).value = gp.name;
    chartSheet.getCell(`A${chartDataRow}`).font = { bold: true };
    chartSheet.getCell(`A${chartDataRow}`).border = thinBorder();
    
    chartSheet.getCell(`B${chartDataRow}`).value = gp.appearance;
    chartSheet.getCell(`B${chartDataRow}`).alignment = { horizontal: "center" };
    chartSheet.getCell(`B${chartDataRow}`).border = thinBorder();
    
    chartSheet.getCell(`C${chartDataRow}`).value = gp.gamePerf;
    chartSheet.getCell(`C${chartDataRow}`).alignment = { horizontal: "center" };
    chartSheet.getCell(`C${chartDataRow}`).border = thinBorder();
    
    chartSheet.getCell(`D${chartDataRow}`).value = gp.total;
    chartSheet.getCell(`D${chartDataRow}`).font = { bold: true };
    chartSheet.getCell(`D${chartDataRow}`).alignment = { horizontal: "center" };
    chartSheet.getCell(`D${chartDataRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: getScoreBgColor(gp.total) } };
    chartSheet.getCell(`D${chartDataRow}`).border = thinBorder();
    
    chartSheet.getCell(`E${chartDataRow}`).value = gp.evalCount;
    chartSheet.getCell(`E${chartDataRow}`).alignment = { horizontal: "center" };
    chartSheet.getCell(`E${chartDataRow}`).border = thinBorder();
    
    // Performance level label
    let level = "Needs Improvement";
    if (gp.total >= 20) level = "Excellent";
    else if (gp.total >= 18) level = "Very Good";
    else if (gp.total >= 16) level = "Good";
    else if (gp.total >= 14) level = "Fair";
    
    chartSheet.getCell(`F${chartDataRow}`).value = level;
    chartSheet.getCell(`F${chartDataRow}`).alignment = { horizontal: "center" };
    chartSheet.getCell(`F${chartDataRow}`).font = { italic: true, color: { argb: gp.total >= 18 ? COLORS.greenDark : gp.total >= 16 ? COLORS.goldDark : COLORS.redDark } };
    chartSheet.getCell(`F${chartDataRow}`).border = thinBorder();
    
    chartDataRow++;
  }

  // Team average row
  const lastDataRow = chartDataRow - 1;
  chartSheet.getCell(`A${chartDataRow}`).value = "TEAM AVERAGE";
  chartSheet.getCell(`A${chartDataRow}`).font = { bold: true, size: 11 };
  chartSheet.getCell(`A${chartDataRow}`).fill = headerFill(COLORS.goldLight);
  chartSheet.getCell(`A${chartDataRow}`).border = thickBottomBorder();
  
  for (const [col, label] of [["B", "B"], ["C", "C"], ["D", "D"], ["E", "E"]] as const) {
    const cell = chartSheet.getCell(`${col}${chartDataRow}`);
    cell.value = { formula: `AVERAGE(${col}4:${col}${lastDataRow})` };
    cell.font = { bold: true };
    cell.numFmt = '0.0';
    cell.alignment = { horizontal: "center" };
    cell.fill = headerFill(COLORS.goldLight);
    cell.border = thickBottomBorder();
  }
  chartSheet.getCell(`F${chartDataRow}`).fill = headerFill(COLORS.goldLight);
  chartSheet.getCell(`F${chartDataRow}`).border = thickBottomBorder();

  // Instructions
  const instrRow = chartDataRow + 2;
  chartSheet.mergeCells(`A${instrRow}:F${instrRow}`);
  chartSheet.getCell(`A${instrRow}`).value = `To create a chart in Google Sheets: Select A3:D${lastDataRow} → Insert → Chart → Bar Chart`;
  chartSheet.getCell(`A${instrRow}`).font = { italic: true, size: 10, color: { argb: "FF888888" } };

  return chartSheet;
}

// ============================
// Sheet 3: Monthly Report (Main Sheet)
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
): number {
  const { report } = data;
  const gpCount = attendanceData.length;

  // Column widths — 31 columns (A-AE)
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

  // ---- LEFT SIDE: FM Report ----
  
  // Title row
  mainSheet.mergeCells("A2:H3");
  const titleCell = mainSheet.getCell("A2");
  titleCell.value = `${fmName} — ${teamName}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = headerFill(COLORS.mediumGray);
  titleCell.border = thinBorder();

  // ---- RIGHT SIDE: Team Overview Title ----
  mainSheet.mergeCells("N2:AE3");
  const overviewTitle = mainSheet.getCell("N2");
  overviewTitle.value = `${teamName} Overview — ${monthName} ${report.reportYear}`;
  overviewTitle.font = { bold: true, size: 14 };
  overviewTitle.alignment = { horizontal: "center", vertical: "middle" };
  overviewTitle.fill = headerFill(COLORS.mediumGray);
  overviewTitle.border = thinBorder();

  // ---- FM Performance Section ----
  mainSheet.mergeCells("A4:H5");
  setHeaderCell(mainSheet.getCell("A4"), "FM Performance (self evaluation)");

  mainSheet.mergeCells("I4:L9");
  mainSheet.getCell("I4").value = "Please evaluate your performance as a Floor Manager — your studio operations, teamwork with colleagues, and if there are any issues etc.";
  mainSheet.getCell("I4").alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell("I4").font = { italic: true, size: 9, color: { argb: "FF888888" } };

  // FM Performance text — dynamic height based on content
  const fmPerfText = report.fmPerformance || "";
  const fmPerfRowSpan = Math.max(8, Math.ceil(fmPerfText.length / 60) + 2);
  const fmPerfEndRow = 5 + fmPerfRowSpan;
  mainSheet.mergeCells(`A6:H${fmPerfEndRow}`);
  mainSheet.getCell("A6").value = fmPerfText;
  mainSheet.getCell("A6").alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell("A6").border = thinBorder();

  // ---- Attendance Table (Right Side) ----
  const attendanceHeaders: Array<{ range: string; cell: string; label: string }> = [
    { range: "N4:P5", cell: "N4", label: "Name" },
    { range: "Q4:R5", cell: "Q4", label: "Mistakes" },
    { range: "S4:T5", cell: "S4", label: "Extra shifts /\nStaying longer" },
    { range: "U4:V5", cell: "U4", label: "Late to work" },
    { range: "W4:X5", cell: "W4", label: "Missed days" },
    { range: "Y4:Z5", cell: "Y4", label: "Sick leaves" },
    { range: "AA4:AE5", cell: "AA4", label: "Attitude / Concerns / Remarks" },
  ];
  for (const h of attendanceHeaders) {
    mainSheet.mergeCells(h.range);
    setHeaderCell(mainSheet.getCell(h.cell), h.label);
  }

  // Attendance data rows — dynamic based on GP count
  let gpRow = 6;
  const attendanceStartRow = gpRow;
  for (const item of attendanceData) {
    fillAttendanceRow(mainSheet, gpRow, item, attitudeByGp);
    gpRow += 2;
  }
  const attendanceEndRow = gpRow - 1;

  // TOTAL row — dynamic position based on actual data
  const totalRowStart = gpRow;
  const totalRowEnd = gpRow + 1;
  
  mainSheet.mergeCells(`N${totalRowStart}:P${totalRowEnd}`);
  const totalCell = mainSheet.getCell(`N${totalRowStart}`);
  totalCell.value = "TOTAL";
  totalCell.font = { bold: true, size: 11 };
  totalCell.fill = headerFill(COLORS.gold);
  totalCell.alignment = { horizontal: "center", vertical: "middle" };
  totalCell.border = thinBorder();

  // Dynamic SUM formulas based on actual data range
  const sumColumns = [
    { range: `Q${totalRowStart}:R${totalRowEnd}`, formula: `SUM(Q${attendanceStartRow}:R${attendanceEndRow})` },
    { range: `S${totalRowStart}:T${totalRowEnd}`, formula: `SUM(S${attendanceStartRow}:T${attendanceEndRow})` },
    { range: `U${totalRowStart}:V${totalRowEnd}`, formula: `SUM(U${attendanceStartRow}:V${attendanceEndRow})` },
    { range: `W${totalRowStart}:X${totalRowEnd}`, formula: `SUM(W${attendanceStartRow}:W${attendanceEndRow})` },
    { range: `Y${totalRowStart}:Z${totalRowEnd}`, formula: `SUM(Y${attendanceStartRow}:Y${attendanceEndRow})` },
  ];
  for (const { range, formula } of sumColumns) {
    mainSheet.mergeCells(range);
    const c = mainSheet.getCell(range.split(":")[0]);
    c.value = { formula };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.font = { bold: true };
    c.border = thinBorder();
    c.fill = headerFill(COLORS.goldLight);
  }

  // Remarks total
  mainSheet.mergeCells(`AA${totalRowStart}:AE${totalRowEnd}`);
  mainSheet.getCell(`AA${totalRowStart}`).border = thinBorder();
  mainSheet.getCell(`AA${totalRowStart}`).fill = headerFill(COLORS.goldLight);

  // Borders for attendance section
  for (let row = 4; row <= totalRowEnd; row++) {
    if (!mainSheet.getCell(`N${row}`).border) mainSheet.getCell(`N${row}`).border = { left: { style: "thin" } };
    if (!mainSheet.getCell(`AE${row}`).border) mainSheet.getCell(`AE${row}`).border = { right: { style: "thin" } };
  }

  // ---- Team Management Section (Left Side) ----
  const teamMgmtStartRow = Math.max(fmPerfEndRow + 2, totalRowEnd + 2);
  
  mainSheet.mergeCells(`A${teamMgmtStartRow}:H${teamMgmtStartRow + 1}`);
  setHeaderCell(mainSheet.getCell(`A${teamMgmtStartRow}`), "Team Management");

  mainSheet.mergeCells(`I${teamMgmtStartRow}:L${teamMgmtStartRow + 4}`);
  mainSheet.getCell(`I${teamMgmtStartRow}`).value = "Please write about your team — what were your goals for this month, did you achieve your set goals, did you have enough time to finish everything, etc.";
  mainSheet.getCell(`I${teamMgmtStartRow}`).alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell(`I${teamMgmtStartRow}`).font = { italic: true, size: 9, color: { argb: "FF888888" } };

  const goalsRow = teamMgmtStartRow + 2;
  mainSheet.mergeCells(`A${goalsRow}:D${goalsRow}`);
  mainSheet.getCell(`A${goalsRow}`).value = "Goals this month:";
  mainSheet.getCell(`A${goalsRow}`).font = { bold: true };
  mainSheet.getCell(`A${goalsRow}`).border = thinBorder();

  mainSheet.mergeCells(`E${goalsRow}:H${goalsRow}`);
  mainSheet.getCell(`E${goalsRow}`).value = "Team Overview:";
  mainSheet.getCell(`E${goalsRow}`).font = { bold: true };
  mainSheet.getCell(`E${goalsRow}`).border = thinBorder();

  // Goals text — dynamic height
  const goalsText = report.goalsThisMonth || "";
  const overviewText = report.teamOverview || "";
  const textRowSpan = Math.max(8, Math.ceil(Math.max(goalsText.length, overviewText.length) / 50) + 2);
  const textEndRow = goalsRow + textRowSpan;

  mainSheet.mergeCells(`A${goalsRow + 1}:D${textEndRow}`);
  mainSheet.getCell(`A${goalsRow + 1}`).value = goalsText;
  mainSheet.getCell(`A${goalsRow + 1}`).alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell(`A${goalsRow + 1}`).border = thinBorder();

  mainSheet.mergeCells(`E${goalsRow + 1}:H${textEndRow}`);
  mainSheet.getCell(`E${goalsRow + 1}`).value = overviewText;
  mainSheet.getCell(`E${goalsRow + 1}`).alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell(`E${goalsRow + 1}`).border = thinBorder();

  // ---- Additional Notes Section ----
  const notesStartRow = textEndRow + 2;
  
  mainSheet.mergeCells(`A${notesStartRow}:H${notesStartRow + 1}`);
  setHeaderCell(mainSheet.getCell(`A${notesStartRow}`), "Additional Notes");

  mainSheet.mergeCells(`I${notesStartRow}:K${notesStartRow + 2}`);
  mainSheet.getCell(`I${notesStartRow}`).value = "Are there any additional comments from the previous month you would like to add?";
  mainSheet.getCell(`I${notesStartRow}`).alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell(`I${notesStartRow}`).font = { italic: true, size: 9, color: { argb: "FF888888" } };

  const notesText = report.additionalComments || "";
  const notesRowSpan = Math.max(6, Math.ceil(notesText.length / 60) + 2);
  const notesEndRow = notesStartRow + 1 + notesRowSpan;

  mainSheet.mergeCells(`A${notesStartRow + 2}:H${notesEndRow}`);
  mainSheet.getCell(`A${notesStartRow + 2}`).value = notesText;
  mainSheet.getCell(`A${notesStartRow + 2}`).alignment = { wrapText: true, vertical: "top" };
  mainSheet.getCell(`A${notesStartRow + 2}`).border = thinBorder();

  // ---- Executive Summary Section (Right Side, below attendance) ----
  const execSummaryRow = totalRowEnd + 3;
  buildExecutiveSummary(mainSheet, execSummaryRow, gpEvaluationsData, attendanceData, attitudeByGp, monthName, report.reportYear);

  // ---- Performance Analysis Section (Left Side, below notes) ----
  const analysisStartRow = notesEndRow + 2;
  addPerformanceAnalysis(mainSheet, analysisStartRow, gpEvaluationsData);

  // Return the row where charts should be placed
  return Math.max(analysisStartRow + 20, execSummaryRow + 25);
}

// ============================
// Executive Summary (new section)
// ============================

function buildExecutiveSummary(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  gpEvaluationsData: ChartDataPoint[],
  attendanceData: AttendanceItem[],
  attitudeByGp: AttitudeByGp,
  monthName: string,
  reportYear: number
) {
  const gpAverages = computeGpAverages(gpEvaluationsData);
  if (gpAverages.length === 0) return;

  const teamAvgTotal = gpAverages.reduce((s, g) => s + g.total, 0) / gpAverages.length;
  const teamAvgApp = gpAverages.reduce((s, g) => s + g.appearance, 0) / gpAverages.length;
  const teamAvgGP = gpAverages.reduce((s, g) => s + g.gamePerf, 0) / gpAverages.length;
  const topPerformer = gpAverages[0];
  const lowestPerformer = gpAverages[gpAverages.length - 1];
  const excellentCount = gpAverages.filter(g => g.total >= 20).length;
  const needsImprovementCount = gpAverages.filter(g => g.total < 16).length;

  // Total attendance issues
  let totalMistakes = 0, totalLate = 0, totalMissed = 0, totalSick = 0;
  for (const item of attendanceData) {
    totalMistakes += item.monthlyStats?.mistakes ?? item.attendance?.mistakes ?? 0;
    totalLate += item.attendance?.lateToWork ?? 0;
    totalMissed += item.attendance?.missedDays ?? 0;
    totalSick += item.attendance?.sickLeaves ?? 0;
  }

  // Total attitude
  const totalPositive = Object.values(attitudeByGp).reduce((s, a) => s + a.positive, 0);
  const totalNegative = Object.values(attitudeByGp).reduce((s, a) => s + a.negative, 0);

  // Header
  sheet.mergeCells(`N${startRow}:AE${startRow + 1}`);
  const headerCell = sheet.getCell(`N${startRow}`);
  headerCell.value = `Executive Summary — ${monthName} ${reportYear}`;
  headerCell.font = { bold: true, size: 12, color: { argb: COLORS.white } };
  headerCell.fill = headerFill(COLORS.navyBlue);
  headerCell.alignment = { horizontal: "center", vertical: "middle" };
  headerCell.border = thinBorder();

  let row = startRow + 2;

  // Key Metrics
  sheet.mergeCells(`N${row}:Q${row}`);
  sheet.getCell(`N${row}`).value = "Key Metrics";
  sheet.getCell(`N${row}`).font = { bold: true, size: 11 };
  sheet.getCell(`N${row}`).fill = headerFill(COLORS.blueLight);
  sheet.getCell(`N${row}`).border = thinBorder();
  
  sheet.mergeCells(`R${row}:U${row}`);
  sheet.getCell(`R${row}`).value = "Attendance Summary";
  sheet.getCell(`R${row}`).font = { bold: true, size: 11 };
  sheet.getCell(`R${row}`).fill = headerFill(COLORS.blueLight);
  sheet.getCell(`R${row}`).border = thinBorder();

  sheet.mergeCells(`V${row}:AE${row}`);
  sheet.getCell(`V${row}`).value = "Highlights";
  sheet.getCell(`V${row}`).font = { bold: true, size: 11 };
  sheet.getCell(`V${row}`).fill = headerFill(COLORS.blueLight);
  sheet.getCell(`V${row}`).border = thinBorder();

  row++;

  // Key Metrics data
  const metrics = [
    ["Team Avg Score:", `${teamAvgTotal.toFixed(1)} / ${MAX_TOTAL_SCORE}`],
    ["Avg Appearance:", `${teamAvgApp.toFixed(1)} / 12`],
    ["Avg Game Perf:", `${teamAvgGP.toFixed(1)} / 10`],
    ["GPs Evaluated:", `${gpAverages.length}`],
    ["Excellent (≥20):", `${excellentCount}`],
    ["Needs Improvement (<16):", `${needsImprovementCount}`],
  ];

  const attendanceMetrics = [
    ["Total Mistakes:", `${totalMistakes}`],
    ["Late to Work:", `${totalLate}`],
    ["Missed Days:", `${totalMissed}`],
    ["Sick Leaves:", `${totalSick}`],
    ["Attitude +/-:", `+${totalPositive} / -${totalNegative}`],
    ["", ""],
  ];

  const highlights = [
    [`Top Performer: ${topPerformer.name}`, `${topPerformer.total}/${MAX_TOTAL_SCORE}`],
    [`Lowest Score: ${lowestPerformer.name}`, `${lowestPerformer.total}/${MAX_TOTAL_SCORE}`],
    ...(gpAverages.length >= 3 ? [[`2nd Best: ${gpAverages[1].name}`, `${gpAverages[1].total}/${MAX_TOTAL_SCORE}`]] : []),
    ...(gpAverages.length >= 3 ? [[`3rd Best: ${gpAverages[2].name}`, `${gpAverages[2].total}/${MAX_TOTAL_SCORE}`]] : []),
  ];

  for (let i = 0; i < Math.max(metrics.length, attendanceMetrics.length, highlights.length); i++) {
    const currentRow = row + i;
    
    // Key metrics column
    if (i < metrics.length) {
      sheet.mergeCells(`N${currentRow}:O${currentRow}`);
      sheet.getCell(`N${currentRow}`).value = metrics[i][0];
      sheet.getCell(`N${currentRow}`).font = { size: 10 };
      sheet.getCell(`N${currentRow}`).border = thinBorder();
      
      sheet.mergeCells(`P${currentRow}:Q${currentRow}`);
      sheet.getCell(`P${currentRow}`).value = metrics[i][1];
      sheet.getCell(`P${currentRow}`).font = { bold: true, size: 10 };
      sheet.getCell(`P${currentRow}`).alignment = { horizontal: "center" };
      sheet.getCell(`P${currentRow}`).border = thinBorder();
    }

    // Attendance column
    if (i < attendanceMetrics.length && attendanceMetrics[i][0]) {
      sheet.mergeCells(`R${currentRow}:S${currentRow}`);
      sheet.getCell(`R${currentRow}`).value = attendanceMetrics[i][0];
      sheet.getCell(`R${currentRow}`).font = { size: 10 };
      sheet.getCell(`R${currentRow}`).border = thinBorder();
      
      sheet.mergeCells(`T${currentRow}:U${currentRow}`);
      sheet.getCell(`T${currentRow}`).value = attendanceMetrics[i][1];
      sheet.getCell(`T${currentRow}`).font = { bold: true, size: 10 };
      sheet.getCell(`T${currentRow}`).alignment = { horizontal: "center" };
      sheet.getCell(`T${currentRow}`).border = thinBorder();
    }

    // Highlights column
    if (i < highlights.length) {
      sheet.mergeCells(`V${currentRow}:AC${currentRow}`);
      sheet.getCell(`V${currentRow}`).value = highlights[i][0];
      sheet.getCell(`V${currentRow}`).font = { size: 10 };
      sheet.getCell(`V${currentRow}`).border = thinBorder();
      
      sheet.mergeCells(`AD${currentRow}:AE${currentRow}`);
      sheet.getCell(`AD${currentRow}`).value = highlights[i][1];
      sheet.getCell(`AD${currentRow}`).font = { bold: true, size: 10, color: { argb: i === 0 ? COLORS.greenDark : i === 1 ? COLORS.redDark : COLORS.blue } };
      sheet.getCell(`AD${currentRow}`).alignment = { horizontal: "center" };
      sheet.getCell(`AD${currentRow}`).border = thinBorder();
    }
  }
}

// ============================
// Attendance Row Helper
// ============================

function fillAttendanceRow(
  sheet: ExcelJS.Worksheet,
  gpRow: number,
  item: AttendanceItem,
  attitudeByGp: AttitudeByGp
) {
  const mergeAndCenter = (range: string, value: any, isNumeric: boolean = false) => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = value;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder();
    
    // Color-code numeric values
    if (isNumeric && typeof value === 'number' && value > 0) {
      cell.font = { bold: true, color: { argb: value >= 3 ? COLORS.redDark : COLORS.goldDark } };
    }
  };

  // GP Name
  sheet.mergeCells(`N${gpRow}:P${gpRow + 1}`);
  sheet.getCell(`N${gpRow}`).value = item.gamePresenter?.name || "";
  sheet.getCell(`N${gpRow}`).alignment = { vertical: "middle" };
  sheet.getCell(`N${gpRow}`).font = { bold: true };
  sheet.getCell(`N${gpRow}`).border = thinBorder();

  // Attendance data with color coding
  const mistakes = item.monthlyStats?.mistakes ?? item.attendance?.mistakes ?? 0;
  mergeAndCenter(`Q${gpRow}:R${gpRow + 1}`, mistakes, true);
  mergeAndCenter(`S${gpRow}:T${gpRow + 1}`, item.attendance?.extraShifts || 0, false);
  mergeAndCenter(`U${gpRow}:V${gpRow + 1}`, item.attendance?.lateToWork || 0, true);
  mergeAndCenter(`W${gpRow}:X${gpRow + 1}`, item.attendance?.missedDays || 0, true);
  mergeAndCenter(`Y${gpRow}:Z${gpRow + 1}`, item.attendance?.sickLeaves || 0, true);

  // Extra shifts get green color if positive
  const extraShifts = item.attendance?.extraShifts || 0;
  if (extraShifts > 0) {
    sheet.getCell(`S${gpRow}`).font = { bold: true, color: { argb: COLORS.greenDark } };
  }

  // Attitude / Remarks
  sheet.mergeCells(`AA${gpRow}:AE${gpRow + 1}`);
  const gpId = item.gamePresenter?.id;
  const gpAttitude = gpId ? attitudeByGp[gpId] : null;

  const parts: string[] = [];
  
  if (gpAttitude && gpAttitude.entries.length > 0) {
    parts.push(`Attitude: +${gpAttitude.positive} / -${gpAttitude.negative}`);
    // Show up to 3 most recent entries
    const recentEntries = gpAttitude.entries.slice(0, 3);
    for (const entry of recentEntries) {
      const prefix = entry.type === 'POSITIVE' ? '+' : '-';
      const truncatedComment = entry.comment.length > 60 ? entry.comment.substring(0, 57) + '...' : entry.comment;
      parts.push(`  ${prefix} ${truncatedComment}`);
    }
    if (gpAttitude.entries.length > 3) {
      parts.push(`  ... and ${gpAttitude.entries.length - 3} more`);
    }
  } else if (item.monthlyStats?.attitude) {
    parts.push(`Attitude: ${item.monthlyStats.attitude}/5`);
  }

  const remarksText = item.attendance?.remarks || item.monthlyStats?.notes || "";
  if (remarksText) {
    parts.push(remarksText);
  }

  const remarksCell = sheet.getCell(`AA${gpRow}`);
  remarksCell.value = parts.join("\n");
  remarksCell.alignment = { wrapText: true, vertical: "top" };
  remarksCell.font = { size: 9 };
  remarksCell.border = thinBorder();
}

// ============================
// Performance Analysis Section
// ============================

function addPerformanceAnalysis(sheet: ExcelJS.Worksheet, startRow: number, gpEvaluationsData: ChartDataPoint[]) {
  const gpAverages = computeGpAverages(gpEvaluationsData);
  if (gpAverages.length === 0) return;

  const teamAvgApp = gpAverages.reduce((s, g) => s + g.appearance, 0) / gpAverages.length;
  const teamAvgGP = gpAverages.reduce((s, g) => s + g.gamePerf, 0) / gpAverages.length;
  const totalEvals = gpAverages.reduce((s, g) => s + g.evalCount, 0);

  // Header
  sheet.mergeCells(`A${startRow}:H${startRow + 1}`);
  sheet.getCell(`A${startRow}`).value = "Performance Analysis (Auto-generated)";
  sheet.getCell(`A${startRow}`).font = { bold: true, color: { argb: COLORS.white }, size: 12 };
  sheet.getCell(`A${startRow}`).fill = headerFill(COLORS.navyBlue);
  sheet.getCell(`A${startRow}`).alignment = { horizontal: "center", vertical: "middle" };
  sheet.getCell(`A${startRow}`).border = thinBorder();

  let row = startRow + 2;

  // Team Statistics
  sheet.mergeCells(`A${row}:D${row}`);
  sheet.getCell(`A${row}`).value = "Team Statistics";
  sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
  sheet.getCell(`A${row}`).fill = headerFill(COLORS.blueLight);
  sheet.getCell(`A${row}`).border = thinBorder();

  sheet.mergeCells(`E${row}:H${row}`);
  sheet.getCell(`E${row}`).value = "Top Performers";
  sheet.getCell(`E${row}`).font = { bold: true, size: 11 };
  sheet.getCell(`E${row}`).fill = headerFill(COLORS.greenLight);
  sheet.getCell(`E${row}`).border = thinBorder();

  row++;

  const statsData = [
    ["Total Evaluations:", totalEvals],
    ["Avg Appearance:", teamAvgApp.toFixed(1)],
    ["Avg Game Perf:", teamAvgGP.toFixed(1)],
    ["Avg Total:", (teamAvgApp + teamAvgGP).toFixed(1)],
  ];

  for (let i = 0; i < statsData.length; i++) {
    sheet.getCell(`A${row + i}`).value = statsData[i][0] as string;
    sheet.getCell(`A${row + i}`).font = { size: 10 };
    sheet.getCell(`A${row + i}`).border = thinBorder();
    sheet.getCell(`B${row + i}`).value = statsData[i][1];
    sheet.getCell(`B${row + i}`).font = { bold: true };
    sheet.getCell(`B${row + i}`).border = thinBorder();
  }

  // Top performers
  const top3 = gpAverages.slice(0, 3);
  for (let i = 0; i < top3.length; i++) {
    const medal = i === 0 ? "1st" : i === 1 ? "2nd" : "3rd";
    sheet.getCell(`E${row + i}`).value = `${medal}. ${top3[i].name}`;
    sheet.getCell(`E${row + i}`).font = { size: 10 };
    sheet.getCell(`E${row + i}`).border = thinBorder();
    sheet.getCell(`H${row + i}`).value = top3[i].total;
    sheet.getCell(`H${row + i}`).font = { bold: true, color: { argb: COLORS.greenDark } };
    sheet.getCell(`H${row + i}`).border = thinBorder();
  }

  // Needs improvement
  row += Math.max(statsData.length, top3.length) + 1;
  sheet.mergeCells(`A${row}:D${row}`);
  sheet.getCell(`A${row}`).value = "Needs Improvement";
  sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
  sheet.getCell(`A${row}`).fill = headerFill(COLORS.redLight);
  sheet.getCell(`A${row}`).border = thinBorder();

  row++;
  const bottom3 = gpAverages.slice(-3).reverse();
  for (let i = 0; i < bottom3.length; i++) {
    sheet.getCell(`A${row + i}`).value = `${i + 1}. ${bottom3[i].name}`;
    sheet.getCell(`A${row + i}`).font = { size: 10 };
    sheet.getCell(`A${row + i}`).border = thinBorder();
    sheet.getCell(`D${row + i}`).value = bottom3[i].total;
    sheet.getCell(`D${row + i}`).font = { bold: true, color: { argb: COLORS.redDark } };
    sheet.getCell(`D${row + i}`).border = thinBorder();
  }
}

// ============================
// Attitude Entries Sheet
// ============================

function buildAttitudeSheet(
  workbook: ExcelJS.Workbook,
  attendanceData: AttendanceItem[],
  attitudeByGp: AttitudeByGp
): boolean {
  const hasData = Object.values(attitudeByGp).some(a => a.entries.length > 0);
  if (!hasData) return false;

  const sheet = workbook.addWorksheet("Attitude Entries");
  sheet.columns = [{ width: 25 }, { width: 18 }, { width: 12 }, { width: 60 }, { width: 8 }];

  // Title
  sheet.mergeCells("A1:E1");
  sheet.getCell("A1").value = "Attitude & Behavior Entries";
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: COLORS.white } };
  sheet.getCell("A1").fill = headerFill(COLORS.navyBlue);
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 30;

  // Headers
  const headerValues = ["GP Name", "Date", "Type", "Comment", "Score"];
  headerValues.forEach((val, i) => {
    const cell = sheet.getCell(3, i + 1);
    cell.value = val;
    cell.font = { bold: true, size: 10, color: { argb: COLORS.white } };
    cell.fill = headerFill(COLORS.blue);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder();
  });

  let row = 4;
  for (const item of attendanceData) {
    const gpId = item.gamePresenter?.id;
    const gpName = item.gamePresenter?.name || "Unknown";
    const gpAttitude = gpId ? attitudeByGp[gpId] : null;

    if (gpAttitude && gpAttitude.entries.length > 0) {
      for (const entry of gpAttitude.entries) {
        sheet.getCell(`A${row}`).value = gpName;
        sheet.getCell(`A${row}`).font = { bold: true };
        sheet.getCell(`A${row}`).border = thinBorder();
        
        sheet.getCell(`B${row}`).value = entry.date;
        sheet.getCell(`B${row}`).alignment = { horizontal: "center" };
        sheet.getCell(`B${row}`).border = thinBorder();
        
        const typeCell = sheet.getCell(`C${row}`);
        typeCell.value = entry.type;
        typeCell.alignment = { horizontal: "center" };
        typeCell.border = thinBorder();
        if (entry.type === 'POSITIVE') {
          typeCell.fill = headerFill(COLORS.positiveBackground);
          typeCell.font = { bold: true, color: { argb: COLORS.positiveText } };
        } else {
          typeCell.fill = headerFill(COLORS.negativeBackground);
          typeCell.font = { bold: true, color: { argb: COLORS.negativeText } };
        }
        
        sheet.getCell(`D${row}`).value = entry.comment;
        sheet.getCell(`D${row}`).alignment = { wrapText: true };
        sheet.getCell(`D${row}`).border = thinBorder();
        
        const scoreCell = sheet.getCell(`E${row}`);
        scoreCell.value = entry.score;
        scoreCell.alignment = { horizontal: "center" };
        scoreCell.border = thinBorder();
        scoreCell.font = { bold: true, color: { argb: entry.score > 0 ? COLORS.positiveText : COLORS.negativeText } };
        
        row++;
      }
    }
  }

  // Summary row
  row++;
  const totalPositive = Object.values(attitudeByGp).reduce((s, a) => s + a.positive, 0);
  const totalNegative = Object.values(attitudeByGp).reduce((s, a) => s + a.negative, 0);
  
  sheet.getCell(`A${row}`).value = "TOTAL";
  sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
  sheet.getCell(`A${row}`).fill = headerFill(COLORS.goldLight);
  sheet.getCell(`A${row}`).border = thickBottomBorder();
  
  sheet.getCell(`C${row}`).value = `+${totalPositive} / -${totalNegative}`;
  sheet.getCell(`C${row}`).font = { bold: true };
  sheet.getCell(`C${row}`).alignment = { horizontal: "center" };
  sheet.getCell(`C${row}`).fill = headerFill(COLORS.goldLight);
  sheet.getCell(`C${row}`).border = thickBottomBorder();
  
  sheet.getCell(`E${row}`).value = { formula: `SUM(E4:E${row - 2})` };
  sheet.getCell(`E${row}`).font = { bold: true };
  sheet.getCell(`E${row}`).alignment = { horizontal: "center" };
  sheet.getCell(`E${row}`).fill = headerFill(COLORS.goldLight);
  sheet.getCell(`E${row}`).border = thickBottomBorder();

  return true;
}

// ============================
// Chart Image Embedding
// ============================

async function embedChartImages(
  workbook: ExcelJS.Workbook,
  mainSheet: ExcelJS.Worksheet,
  gpEvaluationsData: ChartDataPoint[],
  prevMonthEvaluations: ChartDataPoint[],
  teamName: string,
  monthName: string,
  report: ReportData["report"],
  chartStartRow: number
) {
  const gpAverages = computeGpAverages(gpEvaluationsData);
  if (gpAverages.length === 0) return;

  const chartLabels = gpAverages.map(g => g.name);
  const appearanceScores = gpAverages.map(g => g.appearance);
  const gamePerformanceScores = gpAverages.map(g => g.gamePerf);
  const totalScores = gpAverages.map(g => g.total);

  const chartTitle = `${teamName} Performance — ${monthName} ${report.reportYear}`;
  const chartImageBuffer = await generateChartImage(chartLabels, appearanceScores, gamePerformanceScores, totalScores, chartTitle);

  // Chart placement label
  mainSheet.mergeCells(`N${chartStartRow}:AE${chartStartRow}`);
  mainSheet.getCell(`N${chartStartRow}`).value = "Performance Charts";
  mainSheet.getCell(`N${chartStartRow}`).font = { bold: true, size: 12, color: { argb: COLORS.white } };
  mainSheet.getCell(`N${chartStartRow}`).fill = headerFill(COLORS.navyBlue);
  mainSheet.getCell(`N${chartStartRow}`).alignment = { horizontal: "center", vertical: "middle" };
  mainSheet.getCell(`N${chartStartRow}`).border = thinBorder();

  if (chartImageBuffer) {
    const imageId = workbook.addImage({ buffer: chartImageBuffer as any, extension: 'png' });
    mainSheet.addImage(imageId, { tl: { col: 13, row: chartStartRow + 1 }, ext: { width: 700, height: 350 } });
    log.debug("Chart image added to month sheet");
  } else {
    mainSheet.mergeCells(`N${chartStartRow + 2}:AE${chartStartRow + 5}`);
    mainSheet.getCell(`N${chartStartRow + 2}`).value = "Chart could not be generated. Please check the Chart sheet for performance data.";
    mainSheet.getCell(`N${chartStartRow + 2}`).alignment = { wrapText: true, vertical: "top" };
    mainSheet.getCell(`N${chartStartRow + 2}`).font = { italic: true, color: { argb: "FF888888" } };
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
      const comparisonRow = chartStartRow + 22;
      
      mainSheet.mergeCells(`N${comparisonRow}:AE${comparisonRow}`);
      mainSheet.getCell(`N${comparisonRow}`).value = "Month-over-Month Comparison";
      mainSheet.getCell(`N${comparisonRow}`).font = { bold: true, size: 11, color: { argb: COLORS.white } };
      mainSheet.getCell(`N${comparisonRow}`).fill = headerFill(COLORS.blue);
      mainSheet.getCell(`N${comparisonRow}`).alignment = { horizontal: "center", vertical: "middle" };
      mainSheet.getCell(`N${comparisonRow}`).border = thinBorder();

      const prevMonthName = MONTH_NAMES[prevMonth - 1];
      const comparisonChartBuffer = await generateComparisonChart(
        comparisonLabels, currentMonthScores, previousMonthScores,
        monthName, prevMonthName,
        `Performance Comparison: ${monthName} vs ${prevMonthName}`
      );

      if (comparisonChartBuffer) {
        const comparisonImageId = workbook.addImage({ buffer: comparisonChartBuffer as any, extension: 'png' });
        mainSheet.addImage(comparisonImageId, { tl: { col: 13, row: comparisonRow + 1 }, ext: { width: 700, height: 350 } });
        log.debug("Comparison chart added to month sheet");
      }
    }
  }
}

// ============================
// Action Items sheet
// ============================

function buildActionItemsSheet(workbook: ExcelJS.Workbook, items: ActionItemSummary[]): void {
  const sheet = workbook.addWorksheet("Coaching Plans");

  sheet.columns = [
    { header: "GP", key: "gpName", width: 22 },
    { header: "Title", key: "title", width: 38 },
    { header: "Category", key: "category", width: 14 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "Status", key: "status", width: 13 },
    { header: "Source", key: "source", width: 11 },
    { header: "Due", key: "dueDate", width: 13 },
    { header: "Created", key: "createdAt", width: 13 },
    { header: "Completed", key: "completedAt", width: 13 },
    { header: "Description", key: "description", width: 50 },
  ];

  // Header styling
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  header.alignment = { horizontal: "center", vertical: "middle" };
  header.height = 22;

  for (const item of items) {
    sheet.addRow({
      gpName: item.gpName,
      title: item.title,
      category: item.category,
      priority: item.priority,
      status: item.status,
      source: item.source === "ai_insight" ? "AI suggestion" : "manual",
      dueDate: item.dueDate ? new Date(item.dueDate) : null,
      createdAt: new Date(item.createdAt),
      completedAt: item.completedAt ? new Date(item.completedAt) : null,
      description: item.description ?? "",
    });
  }

  // Conditional cell tinting for priority + status
  for (let r = 2; r <= sheet.rowCount; r++) {
    const priority = String(sheet.getCell(`D${r}`).value || "");
    const status = String(sheet.getCell(`E${r}`).value || "");

    if (priority === "high") {
      sheet.getCell(`D${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE0E0" } };
    } else if (priority === "medium") {
      sheet.getCell(`D${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    }

    if (status === "done") {
      sheet.getRow(r).font = { italic: true, color: { argb: "FF7F7F7F" } };
    } else if (status === "open") {
      sheet.getCell(`E${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
    } else if (status === "in_progress") {
      sheet.getCell(`E${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    }
  }

  // Format dates
  ["G", "H", "I"].forEach(col => {
    sheet.getColumn(col).numFmt = "yyyy-mm-dd";
  });

  // Wrap description column
  sheet.getColumn("description").alignment = { wrapText: true, vertical: "top" };

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

// ============================
// Bonus Summary sheet
// ============================

function buildBonusSummarySheet(workbook: ExcelJS.Workbook, summary: BonusSummary[]): void {
  const sheet = workbook.addWorksheet("Bonus Summary");

  sheet.columns = [
    { header: "GP", key: "gpName", width: 22 },
    { header: "Level", key: "level", width: 14 },
    { header: "Rate (€/h)", key: "rate", width: 11 },
    { header: "Hours", key: "hours", width: 8 },
    { header: "Bonus (€)", key: "amount", width: 11 },
    { header: "GGs", key: "ggs", width: 10 },
    { header: "Games", key: "games", width: 10 },
    { header: "Errors", key: "errors", width: 8 },
    { header: "Disqualifying factors", key: "factors", width: 40 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4A017" } };
  header.alignment = { horizontal: "center", vertical: "middle" };
  header.height = 22;

  // Sort: highest payout first
  const sorted = [...summary].sort((a, b) => b.bonusAmount - a.bonusAmount);

  let totalPayout = 0;
  let level1Count = 0;
  let level2Count = 0;
  let ineligibleCount = 0;

  for (const b of sorted) {
    sheet.addRow({
      gpName: b.gpName,
      level: b.bonusLevel === "level2" ? "Level 2" : b.bonusLevel === "level1" ? "Level 1" : "Not qualifying",
      rate: b.bonusRate,
      hours: b.hoursWorked,
      amount: b.bonusAmount,
      ggs: b.achievedGGs,
      games: b.totalGames,
      errors: b.errorCount,
      factors: b.disqualifyingFactors.join("; ") || "—",
    });
    totalPayout += b.bonusAmount;
    if (b.bonusLevel === "level2") level2Count++;
    else if (b.bonusLevel === "level1") level1Count++;
    else ineligibleCount++;
  }

  // Tinting per level
  for (let r = 2; r <= sheet.rowCount; r++) {
    const level = String(sheet.getCell(`B${r}`).value || "");
    if (level === "Level 2") {
      sheet.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    } else if (level === "Level 1") {
      sheet.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
    } else {
      sheet.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    }
  }

  // Number format for currency / counts
  sheet.getColumn("rate").numFmt = "€#,##0.00";
  sheet.getColumn("amount").numFmt = "€#,##0";
  ["F", "G", "H"].forEach(col => { sheet.getColumn(col).numFmt = "#,##0"; });

  // Totals row
  const totalRow = sheet.addRow({});
  sheet.addRow({
    gpName: "TOTAL",
    level: `${level2Count}× L2 / ${level1Count}× L1 / ${ineligibleCount}× —`,
    rate: "",
    hours: "",
    amount: totalPayout,
  });
  const totalRowIdx = sheet.rowCount;
  const tRow = sheet.getRow(totalRowIdx);
  tRow.font = { bold: true };
  tRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

// ============================
// Main Excel Generation
// ============================

export async function generateReportWorkbook(data: ReportData): Promise<Buffer> {
  const { report, teamName, fmName, attendanceData, attitudeByGp, gpEvaluationsData, prevMonthEvaluations, actionItems, bonusSummary } = data;
  const monthName = MONTH_NAMES[report.reportMonth - 1];

  log.info("Generating Excel workbook v2.0", { reportId: report.id, teamName, month: monthName, gpCount: attendanceData.length });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GP Report Generator";
  workbook.created = new Date();

  // Sheet 1: Data (Individual GP Scores)
  buildDataSheet(workbook, gpEvaluationsData);

  // Sheet 2: Chart (Summary Table)
  buildChartSheet(workbook, gpEvaluationsData, teamName, monthName, report.reportYear);

  // Sheet 3: Monthly Report (Main Sheet — complex layout)
  const mainSheet = workbook.addWorksheet(`${monthName} ${report.reportYear}`);
  const chartPlacementRow = buildMonthlySheet(mainSheet, data, monthName, fmName, teamName, gpEvaluationsData, attendanceData, attitudeByGp);

  // Embed chart images into the monthly sheet
  await embedChartImages(workbook, mainSheet, gpEvaluationsData, prevMonthEvaluations, teamName, monthName, report, chartPlacementRow);

  // Sheet 4: Attitude Entries (optional)
  buildAttitudeSheet(workbook, attendanceData, attitudeByGp);

  // Sheet 5: Coaching Plans (optional — only if any items)
  if (actionItems && actionItems.length > 0) {
    buildActionItemsSheet(workbook, actionItems);
  }

  // Sheet 6: Bonus Summary (optional — only if any data)
  if (bonusSummary && bonusSummary.length > 0) {
    buildBonusSummarySheet(workbook, bonusSummary);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  log.info("Workbook v2.0 generated successfully", { reportId: report.id, sheets: workbook.worksheets.length });
  return Buffer.from(buffer);
}
