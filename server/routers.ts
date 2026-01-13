import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import { nanoid } from "nanoid";
import * as db from "./db";
import ExcelJS from "exceljs";

// Schema for extracted evaluation data
const EvaluationDataSchema = z.object({
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

type EvaluationData = z.infer<typeof EvaluationDataSchema>;

// Function to extract evaluation data from image using LLM
async function extractEvaluationFromImage(imageUrl: string): Promise<EvaluationData> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an OCR assistant that extracts structured data from Game Presenter evaluation screenshots. 
Extract all visible information including presenter name, evaluator name, date, game type, total score, and individual category scores with their comments.
The categories typically include: Hair, Makeup, Outfit, Posture, Dealing Style, and Game Performance/Game Commenting.
Each category has a score in format "X/Y" where X is the score and Y is the maximum.
Return the data in the exact JSON format specified.`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all evaluation data from this screenshot. Return a JSON object with the following structure: { presenterName, evaluatorName, date, game, totalScore, hair: {score, maxScore, comment}, makeup: {score, maxScore, comment}, outfit: {score, maxScore, comment}, posture: {score, maxScore, comment}, dealingStyle: {score, maxScore, comment}, gamePerformance: {score, maxScore, comment} }"
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
    throw new Error("Failed to extract data from image");
  }

  return JSON.parse(content) as EvaluationData;
}

// Parse date string to Date object
function parseEvaluationDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  
  try {
    // Handle formats like "9 Jan 2026" or "7 Jan 2026"
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Upload and process evaluation screenshots
  evaluation: router({
    // Upload a single screenshot and extract data
    uploadAndExtract: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
        filename: z.string(),
        mimeType: z.string().default("image/png"),
      }))
      .mutation(async ({ ctx, input }) => {
        // Upload to S3
        const fileKey = `evaluations/${ctx.user.id}/${nanoid()}-${input.filename}`;
        const buffer = Buffer.from(input.imageBase64, "base64");
        const { url: imageUrl } = await storagePut(fileKey, buffer, input.mimeType);

        // Extract data using LLM
        const extractedData = await extractEvaluationFromImage(imageUrl);

        // Find or create Game Presenter
        const gp = await db.findOrCreateGamePresenter(extractedData.presenterName);

        // Parse evaluation date
        const evalDate = parseEvaluationDate(extractedData.date);

        // Save evaluation to database
        const evaluation = await db.createEvaluation({
          gamePresenterId: gp.id,
          evaluatorName: extractedData.evaluatorName || null,
          evaluationDate: evalDate,
          game: extractedData.game || null,
          totalScore: extractedData.totalScore || null,
          hairScore: extractedData.hair?.score || null,
          hairMaxScore: extractedData.hair?.maxScore || 3,
          hairComment: extractedData.hair?.comment || null,
          makeupScore: extractedData.makeup?.score || null,
          makeupMaxScore: extractedData.makeup?.maxScore || 3,
          makeupComment: extractedData.makeup?.comment || null,
          outfitScore: extractedData.outfit?.score || null,
          outfitMaxScore: extractedData.outfit?.maxScore || 3,
          outfitComment: extractedData.outfit?.comment || null,
          postureScore: extractedData.posture?.score || null,
          postureMaxScore: extractedData.posture?.maxScore || 3,
          postureComment: extractedData.posture?.comment || null,
          dealingStyleScore: extractedData.dealingStyle?.score || null,
          dealingStyleMaxScore: extractedData.dealingStyle?.maxScore || 5,
          dealingStyleComment: extractedData.dealingStyle?.comment || null,
          gamePerformanceScore: extractedData.gamePerformance?.score || null,
          gamePerformanceMaxScore: extractedData.gamePerformance?.maxScore || 5,
          gamePerformanceComment: extractedData.gamePerformance?.comment || null,
          screenshotUrl: imageUrl,
          screenshotKey: fileKey,
          rawExtractedData: extractedData,
          uploadedById: ctx.user.id,
        });

        return {
          success: true,
          evaluation,
          extractedData,
          gamePresenter: gp,
        };
      }),

    // Get all evaluations with GP info
    list: protectedProcedure.query(async () => {
      return await db.getEvaluationsWithGP();
    }),

    // Get evaluations for a specific month
    getByMonth: protectedProcedure
      .input(z.object({
        year: z.number(),
        month: z.number().min(1).max(12),
      }))
      .query(async ({ input }) => {
        return await db.getEvaluationsByMonth(input.year, input.month);
      }),

    // Get monthly stats aggregated by GP
    getMonthlyStats: protectedProcedure
      .input(z.object({
        year: z.number(),
        month: z.number().min(1).max(12),
      }))
      .query(async ({ input }) => {
        return await db.getGPMonthlyStats(input.year, input.month);
      }),
  }),

  // Game Presenters management
  gamePresenter: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllGamePresenters();
    }),
  }),

  // Report generation
  report: router({
    // Generate a new report
    generate: protectedProcedure
      .input(z.object({
        teamName: z.string(),
        floorManagerName: z.string().optional(),
        reportMonth: z.string(),
        reportYear: z.number(),
        fmPerformance: z.string().optional(),
        goalsThisMonth: z.string().optional(),
        teamOverview: z.string().optional(),
        additionalComments: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get monthly stats
        const monthNumber = new Date(`${input.reportMonth} 1, ${input.reportYear}`).getMonth() + 1;
        const stats = await db.getGPMonthlyStats(input.reportYear, monthNumber);

        // Create report
        const report = await db.createReport({
          teamName: input.teamName,
          floorManagerName: input.floorManagerName || null,
          reportMonth: input.reportMonth,
          reportYear: input.reportYear,
          fmPerformance: input.fmPerformance || null,
          goalsThisMonth: input.goalsThisMonth || null,
          teamOverview: input.teamOverview || null,
          additionalComments: input.additionalComments || null,
          reportData: stats,
          status: "generated",
          generatedById: ctx.user.id,
        });

        // Notify owner
        await notifyOwner({
          title: "New Report Generated",
          content: `A new Team Monthly Overview report has been generated for ${input.teamName} - ${input.reportMonth} ${input.reportYear}`,
        });

        return report;
      }),

    // Export report to Excel
    exportToExcel: protectedProcedure
      .input(z.object({
        reportId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const report = await db.getReportById(input.reportId);
        if (!report) {
          throw new Error("Report not found");
        }

        const workbook = new ExcelJS.Workbook();
        
        // Sheet 1: Monthly Report
        const mainSheet = workbook.addWorksheet("Monthly Report");
        
        // Title
        mainSheet.mergeCells("A1:J1");
        mainSheet.getCell("A1").value = "TEAM MONTHLY OVERVIEW";
        mainSheet.getCell("A1").font = { bold: true, size: 18 };
        mainSheet.getCell("A1").alignment = { horizontal: "center" };

        // Team info
        mainSheet.getCell("A3").value = "Team Name:";
        mainSheet.getCell("B3").value = report.teamName;
        mainSheet.getCell("A4").value = "Floor Manager:";
        mainSheet.getCell("B4").value = report.floorManagerName || "";
        mainSheet.getCell("A5").value = "Report Month:";
        mainSheet.getCell("B5").value = `${report.reportMonth} ${report.reportYear}`;

        // FM Performance section
        mainSheet.mergeCells("A7:J7");
        mainSheet.getCell("A7").value = "FM PERFORMANCE (Self Evaluation)";
        mainSheet.getCell("A7").font = { bold: true, color: { argb: "FFFFFFFF" } };
        mainSheet.getCell("A7").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };

        mainSheet.mergeCells("A8:J12");
        mainSheet.getCell("A8").value = report.fmPerformance || "";
        mainSheet.getCell("A8").alignment = { wrapText: true, vertical: "top" };

        // Team Management section
        mainSheet.mergeCells("A14:J14");
        mainSheet.getCell("A14").value = "TEAM MANAGEMENT";
        mainSheet.getCell("A14").font = { bold: true, color: { argb: "FFFFFFFF" } };
        mainSheet.getCell("A14").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };

        mainSheet.getCell("A15").value = "Goals This Month:";
        mainSheet.getCell("A15").font = { bold: true };
        mainSheet.mergeCells("A16:J18");
        mainSheet.getCell("A16").value = report.goalsThisMonth || "";

        mainSheet.getCell("A20").value = "Team Overview:";
        mainSheet.getCell("A20").font = { bold: true };
        mainSheet.mergeCells("A21:J23");
        mainSheet.getCell("A21").value = report.teamOverview || "";

        // Sheet 2: GP Data
        const dataSheet = workbook.addWorksheet("GP Data");
        
        // Headers
        const headers = ["Name", "Eval Count", "Avg Total", "Hair", "Makeup", "Outfit", "Posture", "Dealing", "Game Perf"];
        headers.forEach((header, idx) => {
          const cell = dataSheet.getCell(1, idx + 1);
          cell.value = header;
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
          cell.alignment = { horizontal: "center" };
        });

        // Data rows
        const reportData = report.reportData as any[] || [];
        reportData.forEach((gp, rowIdx) => {
          const row = rowIdx + 2;
          dataSheet.getCell(row, 1).value = gp.gpName;
          dataSheet.getCell(row, 2).value = gp.evaluationCount;
          dataSheet.getCell(row, 3).value = gp.avgTotalScore ? Number(gp.avgTotalScore).toFixed(1) : "-";
          dataSheet.getCell(row, 4).value = gp.avgHairScore ? Number(gp.avgHairScore).toFixed(1) : "-";
          dataSheet.getCell(row, 5).value = gp.avgMakeupScore ? Number(gp.avgMakeupScore).toFixed(1) : "-";
          dataSheet.getCell(row, 6).value = gp.avgOutfitScore ? Number(gp.avgOutfitScore).toFixed(1) : "-";
          dataSheet.getCell(row, 7).value = gp.avgPostureScore ? Number(gp.avgPostureScore).toFixed(1) : "-";
          dataSheet.getCell(row, 8).value = gp.avgDealingStyleScore ? Number(gp.avgDealingStyleScore).toFixed(1) : "-";
          dataSheet.getCell(row, 9).value = gp.avgGamePerformanceScore ? Number(gp.avgGamePerformanceScore).toFixed(1) : "-";
        });

        // Set column widths
        dataSheet.columns = [
          { width: 25 }, { width: 12 }, { width: 12 }, { width: 10 },
          { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 }
        ];

        // Generate buffer and upload to S3
        const buffer = await workbook.xlsx.writeBuffer();
        const fileKey = `reports/${report.id}/${nanoid()}-TeamOverview_${report.teamName}_${report.reportMonth}${report.reportYear}.xlsx`;
        const { url: excelUrl } = await storagePut(fileKey, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        // Update report with Excel URL
        await db.updateReport(report.id, {
          excelFileUrl: excelUrl,
          excelFileKey: fileKey,
          status: "finalized",
        });

        return {
          success: true,
          excelUrl,
        };
      }),

    // List all reports
    list: protectedProcedure.query(async () => {
      return await db.getAllReports();
    }),

    // Get single report
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getReportById(input.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
