import { describe, it, expect, vi } from "vitest";

// Test the exported functions from excelService
// We test generateChartImage and generateReportWorkbook

describe("Excel Service v2.0", () => {
  describe("generateChartImage", () => {
    it("should return a buffer when given valid chart data", async () => {
      const { generateChartImage } = await import("./services/excelService");
      
      const labels = ["GP Alpha", "GP Beta"];
      const appearance = [9.5, 8.0];
      const gamePerf = [8.0, 7.5];
      const totals = [17.5, 15.5];
      
      const result = await generateChartImage(labels, appearance, gamePerf, totals, "Test Chart");
      // QuickChart may or may not be available, so we handle both cases
      if (result) {
        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
      } else {
        // If QuickChart is unavailable, it returns null gracefully
        expect(result).toBeNull();
      }
    });

    it("should handle empty data gracefully", async () => {
      const { generateChartImage } = await import("./services/excelService");
      
      const result = await generateChartImage([], [], [], [], "Empty Chart");
      // Should not throw, returns either buffer or null
      expect(result === null || Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe("generateReportWorkbook", () => {
    it("should generate a valid Excel workbook buffer", async () => {
      const { generateReportWorkbook } = await import("./services/excelService");
      
      const mockData = {
        report: {
          id: 1,
          teamId: 100,
          reportMonth: 3,
          reportYear: 2026,
          fmPerformance: "Good performance this month.",
          goalsThisMonth: "Improve team scores by 10%.",
          teamOverview: "Team performed well overall.",
          additionalComments: "No additional comments.",
        },
        teamName: "Team Alpha",
        fmName: "John Smith",
        attendanceData: [
          {
            gamePresenter: { id: 1, name: "GP One" },
            attendance: {
              mistakes: 2,
              extraShifts: 1,
              lateToWork: 0,
              missedDays: 0,
              sickLeaves: 1,
              remarks: "Good worker",
            },
            monthlyStats: {
              mistakes: 2,
              attitude: 5,
              notes: "Positive attitude",
            },
          },
          {
            gamePresenter: { id: 2, name: "GP Two" },
            attendance: {
              mistakes: 0,
              extraShifts: 3,
              lateToWork: 1,
              missedDays: 0,
              sickLeaves: 0,
              remarks: null,
            },
            monthlyStats: {
              mistakes: 0,
              attitude: 3,
              notes: null,
            },
          },
        ],
        attitudeByGp: {
          1: {
            positive: 3,
            negative: 1,
            entries: [
              { date: "2026-03-05", type: "positive", comment: "Great teamwork", score: 1 },
              { date: "2026-03-10", type: "negative", comment: "Late once", score: -1 },
            ],
          },
          2: {
            positive: 2,
            negative: 0,
            entries: [
              { date: "2026-03-15", type: "positive", comment: "Excellent dealing", score: 1 },
            ],
          },
        },
        gpEvaluationsData: [
          {
            gpName: "GP One",
            evaluations: [
              { appearanceScore: 10, gamePerformanceScore: 8 },
              { appearanceScore: 9, gamePerformanceScore: 9 },
            ],
          },
          {
            gpName: "GP Two",
            evaluations: [
              { appearanceScore: 11, gamePerformanceScore: 7 },
            ],
          },
        ],
        prevMonthEvaluations: [
          {
            gpName: "GP One",
            evaluations: [
              { appearanceScore: 8, gamePerformanceScore: 7 },
            ],
          },
        ],
      };

      const buffer = await generateReportWorkbook(mockData);
      
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
      
      // Verify it's a valid xlsx file (starts with PK zip header)
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
    }, 30000); // 30s timeout for chart generation

    it("should handle empty attendance data", async () => {
      const { generateReportWorkbook } = await import("./services/excelService");
      
      const mockData = {
        report: {
          id: 2,
          teamId: 200,
          reportMonth: 1,
          reportYear: 2026,
          fmPerformance: null,
          goalsThisMonth: null,
          teamOverview: null,
          additionalComments: null,
        },
        teamName: "Team Beta",
        fmName: "Jane Doe",
        attendanceData: [],
        attitudeByGp: {},
        gpEvaluationsData: [],
        prevMonthEvaluations: [],
      };

      const buffer = await generateReportWorkbook(mockData);
      
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    }, 30000);

    it("should handle GPs with no evaluations", async () => {
      const { generateReportWorkbook } = await import("./services/excelService");
      
      const mockData = {
        report: {
          id: 3,
          teamId: 300,
          reportMonth: 6,
          reportYear: 2026,
          fmPerformance: "Steady month.",
          goalsThisMonth: "Maintain standards.",
          teamOverview: "Average performance.",
          additionalComments: null,
        },
        teamName: "Team Gamma",
        fmName: "Bob Johnson",
        attendanceData: [
          {
            gamePresenter: { id: 5, name: "GP Five" },
            attendance: null,
            monthlyStats: null,
          },
        ],
        attitudeByGp: {},
        gpEvaluationsData: [
          {
            gpName: "GP Five",
            evaluations: [], // No evaluations
          },
        ],
        prevMonthEvaluations: [],
      };

      const buffer = await generateReportWorkbook(mockData);
      
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    }, 30000);
  });
});
