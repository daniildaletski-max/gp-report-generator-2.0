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

// Month names for report formatting
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", 
                     "July", "August", "September", "October", "November", "December"];

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

  // FM Teams management
  fmTeam: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllFmTeams();
    }),
    
    initialize: protectedProcedure.mutation(async () => {
      await db.initializeDefaultTeams();
      return { success: true };
    }),
  }),

  // Upload and process evaluation screenshots
  evaluation: router({
    uploadAndExtract: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
        filename: z.string(),
        mimeType: z.string().default("image/png"),
      }))
      .mutation(async ({ ctx, input }) => {
        const fileKey = `evaluations/${ctx.user.id}/${nanoid()}-${input.filename}`;
        const buffer = Buffer.from(input.imageBase64, "base64");
        const { url: imageUrl } = await storagePut(fileKey, buffer, input.mimeType);

        const extractedData = await extractEvaluationFromImage(imageUrl);
        const gp = await db.findOrCreateGamePresenter(extractedData.presenterName);
        const evalDate = parseEvaluationDate(extractedData.date);

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

    list: protectedProcedure.query(async () => {
      return await db.getEvaluationsWithGP();
    }),

    getByMonth: protectedProcedure
      .input(z.object({
        year: z.number(),
        month: z.number().min(1).max(12),
      }))
      .query(async ({ input }) => {
        return await db.getEvaluationsByMonth(input.year, input.month);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getEvaluationWithGP(input.id);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        evaluatorName: z.string().optional(),
        evaluationDate: z.date().optional(),
        game: z.string().optional(),
        totalScore: z.number().optional(),
        hairScore: z.number().optional(),
        makeupScore: z.number().optional(),
        outfitScore: z.number().optional(),
        postureScore: z.number().optional(),
        dealingStyleScore: z.number().optional(),
        gamePerformanceScore: z.number().optional(),
        hairComment: z.string().optional(),
        makeupComment: z.string().optional(),
        outfitComment: z.string().optional(),
        postureComment: z.string().optional(),
        dealingStyleComment: z.string().optional(),
        gamePerformanceComment: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const updated = await db.updateEvaluation(id, data);
        return { success: true, evaluation: updated };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteEvaluation(input.id);
        return { success: true };
      }),

    deleteByMonth: protectedProcedure
      .input(z.object({
        year: z.number(),
        month: z.number().min(1).max(12),
      }))
      .mutation(async ({ input }) => {
        const count = await db.deleteEvaluationsByMonth(input.year, input.month);
        return { success: true, deletedCount: count };
      }),

    deleteByDateRange: protectedProcedure
      .input(z.object({
        startDate: z.date(),
        endDate: z.date(),
      }))
      .mutation(async ({ input }) => {
        const count = await db.deleteEvaluationsByDateRange(input.startDate, input.endDate);
        return { success: true, deletedCount: count };
      }),
  }),

  // Game Presenters management
  gamePresenter: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllGamePresenters();
    }),
    
    assignToTeam: protectedProcedure
      .input(z.object({
        gpId: z.number(),
        teamId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.updateGamePresenterTeam(input.gpId, input.teamId);
        return { success: true };
      }),
  }),

  // Dashboard stats
  dashboard: router({
    stats: protectedProcedure
      .input(z.object({
        month: z.number().min(1).max(12).optional(),
        year: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getDashboardStats(input?.month, input?.year);
      }),
  }),

  // Report generation
  report: router({
    generate: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        reportMonth: z.number().min(1).max(12),
        reportYear: z.number(),
        fmPerformance: z.string().optional(),
        goalsThisMonth: z.string().optional(),
        teamOverview: z.string().optional(),
        additionalComments: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const team = await db.getFmTeamById(input.teamId);
        if (!team) throw new Error("Team not found");

        const stats = await db.getGPMonthlyStats(input.teamId, input.reportYear, input.reportMonth);
        const attendance = await db.getAttendanceByTeamMonth(input.teamId, input.reportMonth, input.reportYear);

        const report = await db.createReport({
          teamId: input.teamId,
          reportMonth: input.reportMonth,
          reportYear: input.reportYear,
          fmPerformance: input.fmPerformance || null,
          goalsThisMonth: input.goalsThisMonth || null,
          teamOverview: input.teamOverview || null,
          additionalComments: input.additionalComments || null,
          reportData: { stats, attendance },
          status: "generated",
          generatedById: ctx.user.id,
        });

        await notifyOwner({
          title: "New Report Generated",
          content: `A new Team Monthly Overview report has been generated for ${team.teamName} - ${MONTH_NAMES[input.reportMonth - 1]} ${input.reportYear}`,
        });

        return report;
      }),

    exportToExcel: protectedProcedure
      .input(z.object({
        reportId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const reportWithTeam = await db.getReportWithTeam(input.reportId);
        if (!reportWithTeam) throw new Error("Report not found");

        const { report, team } = reportWithTeam;
        const teamName = team?.teamName || "Unknown Team";
        const fmName = team?.floorManagerName || "Unknown FM";
        const monthName = MONTH_NAMES[report.reportMonth - 1];

        // Get detailed GP evaluations for Data sheet
        const gpEvaluationsData = await db.getGPEvaluationsForDataSheet(
          report.teamId, 
          report.reportYear, 
          report.reportMonth
        );

        const workbook = new ExcelJS.Workbook();
        
        // ===== Sheet 1: Data (GP Performance scores) - FIRST =====
        const dataSheet = workbook.addWorksheet("Data");
        
        // Set column widths for Data sheet
        dataSheet.columns = [
          { width: 4 }, { width: 25 }, { width: 12 }, { width: 12 },
          { width: 4 }, { width: 25 }, { width: 12 }, { width: 12 },
          { width: 4 }, { width: 25 }
        ];

        // Set up Data sheet structure (2 GPs per row block, matching template)
        let dataRow = 9;
        
        for (let i = 0; i < gpEvaluationsData.length; i += 2) {
          const gp1 = gpEvaluationsData[i];
          const gp2 = gpEvaluationsData[i + 1];

          // GP 1 (columns B-D)
          if (gp1 && gp1.evaluations.length > 0) {
            // Merge GP name cell
            dataSheet.mergeCells(`B${dataRow}:B${dataRow + 3}`);
            dataSheet.getCell(`B${dataRow}`).value = gp1.gpName;
            dataSheet.getCell(`B${dataRow}`).alignment = { vertical: "middle" };
            dataSheet.getCell(`C${dataRow}`).value = "GAME PERF.";
            dataSheet.getCell(`D${dataRow}`).value = "APPEARANCE";
            dataSheet.getCell(`C${dataRow}`).font = { bold: true };
            dataSheet.getCell(`D${dataRow}`).font = { bold: true };

            // Individual evaluation scores (up to 4)
            for (let j = 0; j < Math.min(4, gp1.evaluations.length); j++) {
              const eval1 = gp1.evaluations[j];
              dataSheet.getCell(`C${dataRow + 1 + j}`).value = eval1.gamePerformanceScore || "";
              dataSheet.getCell(`D${dataRow + 1 + j}`).value = eval1.appearanceScore || "";
            }

            // Total average row
            dataSheet.getCell(`B${dataRow + 5}`).value = "Total average:";
            dataSheet.getCell(`C${dataRow + 5}`).value = { formula: `AVERAGE(C${dataRow + 1}:C${dataRow + 4})` };
            dataSheet.getCell(`D${dataRow + 5}`).value = { formula: `AVERAGE(D${dataRow + 1}:D${dataRow + 4})` };
          }

          // GP 2 (columns F-H)
          if (gp2 && gp2.evaluations.length > 0) {
            dataSheet.mergeCells(`F${dataRow}:F${dataRow + 3}`);
            dataSheet.getCell(`F${dataRow}`).value = gp2.gpName;
            dataSheet.getCell(`F${dataRow}`).alignment = { vertical: "middle" };
            dataSheet.getCell(`G${dataRow}`).value = "GAME PERF.";
            dataSheet.getCell(`H${dataRow}`).value = "APPEARANCE";
            dataSheet.getCell(`G${dataRow}`).font = { bold: true };
            dataSheet.getCell(`H${dataRow}`).font = { bold: true };

            for (let j = 0; j < Math.min(4, gp2.evaluations.length); j++) {
              const eval2 = gp2.evaluations[j];
              dataSheet.getCell(`G${dataRow + 1 + j}`).value = eval2.gamePerformanceScore || "";
              dataSheet.getCell(`H${dataRow + 1 + j}`).value = eval2.appearanceScore || "";
            }

            dataSheet.getCell(`F${dataRow + 5}`).value = "Total average:";
            dataSheet.getCell(`G${dataRow + 5}`).value = { formula: `AVERAGE(G${dataRow + 1}:G${dataRow + 4})` };
            dataSheet.getCell(`H${dataRow + 5}`).value = { formula: `AVERAGE(H${dataRow + 1}:H${dataRow + 4})` };
          }

          dataRow += 7;
        }

        // ===== Sheet 2: Monthly Report (matching template format) =====
        const mainSheet = workbook.addWorksheet(`${monthName} ${report.reportYear}`);
        
        // Set column widths to match template exactly
        mainSheet.columns = [
          { width: 9 }, { width: 13 }, { width: 13 }, { width: 13 }, 
          { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 },
          { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 },
          { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 },
          { width: 13 }, { width: 13 }, { width: 13 }, { width: 12.25 },
          { width: 9 }, { width: 13 }, { width: 13 }, { width: 13 },
          { width: 13 }, { width: 13 }, { width: 9 }, { width: 13 },
          { width: 13 }, { width: 25.5 }, { width: 29.5 }
        ];

        // Row 2: Title headers
        mainSheet.mergeCells("A2:H3");
        mainSheet.getCell("A2").value = `${fmName} - ${teamName}`;
        mainSheet.getCell("A2").font = { bold: true, size: 14 };
        mainSheet.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };
        mainSheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };

        mainSheet.mergeCells("N2:AE3");
        mainSheet.getCell("N2").value = `${teamName} Overview ${monthName} ${report.reportYear}`;
        mainSheet.getCell("N2").font = { bold: true, size: 14 };
        mainSheet.getCell("N2").alignment = { horizontal: "center", vertical: "middle" };
        mainSheet.getCell("N2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };

        // Row 4: FM Performance header and GP table headers
        mainSheet.mergeCells("A4:H5");
        mainSheet.getCell("A4").value = "FM Performance (self evaluation)";
        mainSheet.getCell("A4").font = { bold: true };
        mainSheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };

        // Instruction text
        mainSheet.mergeCells("I4:L9");
        mainSheet.getCell("I4").value = "Please evaluate your performance as a Floor Manager - your studio operations, teamwork with colleagues, and if there are any issues etc)";
        mainSheet.getCell("I4").alignment = { wrapText: true, vertical: "top" };

        // GP Attendance table headers
        mainSheet.mergeCells("N4:P5");
        mainSheet.getCell("N4").value = "Name ";
        mainSheet.getCell("N4").font = { bold: true };
        mainSheet.getCell("N4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
        mainSheet.getCell("N4").alignment = { horizontal: "center", vertical: "middle" };

        mainSheet.mergeCells("Q4:R5");
        mainSheet.getCell("Q4").value = "Mistakes";
        mainSheet.getCell("Q4").font = { bold: true };
        mainSheet.getCell("Q4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
        mainSheet.getCell("Q4").alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        mainSheet.mergeCells("S4:T5");
        mainSheet.getCell("S4").value = "Extra shifts/\nStaying longer";
        mainSheet.getCell("S4").font = { bold: true };
        mainSheet.getCell("S4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
        mainSheet.getCell("S4").alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        mainSheet.mergeCells("U4:V5");
        mainSheet.getCell("U4").value = "Late to work";
        mainSheet.getCell("U4").font = { bold: true };
        mainSheet.getCell("U4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
        mainSheet.getCell("U4").alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        mainSheet.mergeCells("W4:X5");
        mainSheet.getCell("W4").value = "Missed days";
        mainSheet.getCell("W4").font = { bold: true };
        mainSheet.getCell("W4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
        mainSheet.getCell("W4").alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        mainSheet.mergeCells("Y4:Z5");
        mainSheet.getCell("Y4").value = "Sick leaves ";
        mainSheet.getCell("Y4").font = { bold: true };
        mainSheet.getCell("Y4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
        mainSheet.getCell("Y4").alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        mainSheet.mergeCells("AA4:AE5");
        mainSheet.getCell("AA4").value = "Attitude/ Concerns/ Remarks";
        mainSheet.getCell("AA4").font = { bold: true };
        mainSheet.getCell("AA4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
        mainSheet.getCell("AA4").alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        // FM Performance text area (rows 6-19)
        mainSheet.mergeCells("A6:H19");
        mainSheet.getCell("A6").value = report.fmPerformance || "";
        mainSheet.getCell("A6").alignment = { wrapText: true, vertical: "top" };
        mainSheet.getCell("A6").border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" }
        };

        // Populate GP attendance data (rows 6-35, 2 rows per GP)
        const reportData = report.reportData as { stats?: any[], attendance?: any[] } || {};
        const attendanceData = reportData.attendance || [];
        let gpRow = 6;
        
        for (const item of attendanceData) {
          if (gpRow > 34) break; // Max 15 GPs (rows 6-35)
          
          mainSheet.mergeCells(`N${gpRow}:P${gpRow + 1}`);
          mainSheet.getCell(`N${gpRow}`).value = item.gamePresenter?.name || "";
          mainSheet.getCell(`N${gpRow}`).alignment = { vertical: "middle" };

          mainSheet.mergeCells(`Q${gpRow}:R${gpRow + 1}`);
          mainSheet.getCell(`Q${gpRow}`).value = item.attendance?.mistakes || 0;
          mainSheet.getCell(`Q${gpRow}`).alignment = { horizontal: "center", vertical: "middle" };

          mainSheet.mergeCells(`S${gpRow}:T${gpRow + 1}`);
          mainSheet.getCell(`S${gpRow}`).value = item.attendance?.extraShifts || 0;
          mainSheet.getCell(`S${gpRow}`).alignment = { horizontal: "center", vertical: "middle" };

          mainSheet.mergeCells(`U${gpRow}:V${gpRow + 1}`);
          mainSheet.getCell(`U${gpRow}`).value = item.attendance?.lateToWork || 0;
          mainSheet.getCell(`U${gpRow}`).alignment = { horizontal: "center", vertical: "middle" };

          mainSheet.mergeCells(`W${gpRow}:X${gpRow + 1}`);
          mainSheet.getCell(`W${gpRow}`).value = item.attendance?.missedDays || 0;
          mainSheet.getCell(`W${gpRow}`).alignment = { horizontal: "center", vertical: "middle" };

          mainSheet.mergeCells(`Y${gpRow}:Z${gpRow + 1}`);
          mainSheet.getCell(`Y${gpRow}`).value = item.attendance?.sickLeaves || 0;
          mainSheet.getCell(`Y${gpRow}`).alignment = { horizontal: "center", vertical: "middle" };

          mainSheet.mergeCells(`AA${gpRow}:AE${gpRow + 1}`);
          mainSheet.getCell(`AA${gpRow}`).value = item.attendance?.remarks || "";
          mainSheet.getCell(`AA${gpRow}`).alignment = { wrapText: true, vertical: "middle" };

          gpRow += 2;
        }

        // Team Management section
        mainSheet.mergeCells("A21:H22");
        mainSheet.getCell("A21").value = "Team Management";
        mainSheet.getCell("A21").font = { bold: true };
        mainSheet.getCell("A21").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };

        // Instruction text for Team Management
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
        mainSheet.getCell("A24").border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" }
        };

        mainSheet.mergeCells("E24:H36");
        mainSheet.getCell("E24").value = report.teamOverview || "";
        mainSheet.getCell("E24").alignment = { wrapText: true, vertical: "top" };
        mainSheet.getCell("E24").border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" }
        };

        // TOTAL row for attendance (row 36-37)
        mainSheet.mergeCells("N36:P37");
        mainSheet.getCell("N36").value = "TOTAL";
        mainSheet.getCell("N36").font = { bold: true };
        mainSheet.getCell("N36").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
        mainSheet.getCell("N36").alignment = { horizontal: "center", vertical: "middle" };

        // Sum formulas for totals (matching template: =SUM(Q4:R35))
        mainSheet.mergeCells("Q36:R37");
        mainSheet.getCell("Q36").value = { formula: "SUM(Q4:R35)" };
        mainSheet.getCell("Q36").alignment = { horizontal: "center", vertical: "middle" };

        mainSheet.mergeCells("S36:T37");
        mainSheet.getCell("S36").value = { formula: "SUM(S4:T35)" };
        mainSheet.getCell("S36").alignment = { horizontal: "center", vertical: "middle" };

        mainSheet.mergeCells("U36:V37");
        mainSheet.getCell("U36").value = { formula: "SUM(U4:V35)" };
        mainSheet.getCell("U36").alignment = { horizontal: "center", vertical: "middle" };

        mainSheet.mergeCells("W36:X37");
        mainSheet.getCell("W36").value = { formula: "SUM(W4:X35)" };
        mainSheet.getCell("W36").alignment = { horizontal: "center", vertical: "middle" };

        mainSheet.mergeCells("Y36:Z37");
        mainSheet.getCell("Y36").value = { formula: "SUM(Y4:Z35)" };
        mainSheet.getCell("Y36").alignment = { horizontal: "center", vertical: "middle" };

        // Additional Notes section
        mainSheet.mergeCells("A38:H39");
        mainSheet.getCell("A38").value = "Additional Notes";
        mainSheet.getCell("A38").font = { bold: true };
        mainSheet.getCell("A38").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };

        // Instruction text for Additional Notes
        mainSheet.mergeCells("I38:K40");
        mainSheet.getCell("I38").value = "Are there any additional comments from the previous month you would like to add?";
        mainSheet.getCell("I38").alignment = { wrapText: true, vertical: "top" };

        // Reference to Data sheet
        mainSheet.mergeCells("N39:P39");
        mainSheet.getCell("N39").value = "Paste the table here (delete old): (from Data)";
        mainSheet.getCell("N39").font = { italic: true, color: { argb: "FF808080" } };

        mainSheet.mergeCells("A40:H53");
        mainSheet.getCell("A40").value = report.additionalComments || "";
        mainSheet.getCell("A40").alignment = { wrapText: true, vertical: "top" };
        mainSheet.getCell("A40").border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" }
        };

        // Generate buffer and upload to S3
        const buffer = await workbook.xlsx.writeBuffer();
        const fileKey = `reports/${report.id}/${nanoid()}-TeamOverview_${teamName.replace(/\s+/g, '_')}_${monthName}${report.reportYear}.xlsx`;
        const { url: excelUrl } = await storagePut(fileKey, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

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

    list: protectedProcedure.query(async () => {
      return await db.getReportsWithTeams();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getReportWithTeam(input.id);
      }),
  }),

  // Error file management
  errorFile: router({
    upload: protectedProcedure
      .input(z.object({
        fileBase64: z.string(),
        filename: z.string(),
        month: z.number().min(1).max(12),
        year: z.number(),
        errorType: z.enum(["playgon", "mg"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Upload file to S3
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const fileKey = `error-files/${input.year}/${input.month}/${input.errorType}-${nanoid()}.xlsx`;
        const { url: fileUrl } = await storagePut(fileKey, fileBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        // Parse Excel file to extract GP errors
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(fileBuffer as any);
        
        const gpErrorCounts: Record<string, number> = {};
        let totalErrorsCount = 0;

        // Find the Errors sheet (both Playgon and MG files have this sheet)
        const errorsSheet = workbook.getWorksheet('Errors');
        if (errorsSheet) {
          // GP Name is in column B (index 2), starting from row 3
          // Headers are in row 2: Nr, GP Name, GP Alias, Date, etc.
          errorsSheet.eachRow((row, rowNumber) => {
            if (rowNumber >= 3) { // Skip header rows (row 1 and 2)
              const gpNameCell = row.getCell(2);
              let gpName: string | null = null;
              
              // Handle different cell value types
              if (gpNameCell.value) {
                if (typeof gpNameCell.value === 'string') {
                  gpName = gpNameCell.value.trim();
                } else if (typeof gpNameCell.value === 'object' && 'text' in gpNameCell.value) {
                  // Rich text
                  gpName = (gpNameCell.value as any).text?.trim();
                } else if (typeof gpNameCell.value === 'object' && 'result' in gpNameCell.value) {
                  // Formula with cached result
                  const result = (gpNameCell.value as any).result;
                  if (typeof result === 'string') {
                    gpName = result.trim();
                  }
                }
              }
              
              // Validate that it looks like a name (not a formula, not empty)
              if (gpName && gpName.length > 0 && !gpName.startsWith('=') && gpName !== 'GP Name') {
                // Check if it looks like a real name (contains letters, possibly space)
                if (/^[A-Za-z\u00C0-\u024F\s'-]+$/.test(gpName) && gpName.length < 100) {
                  gpErrorCounts[gpName] = (gpErrorCounts[gpName] || 0) + 1;
                  totalErrorsCount++;
                }
              }
            }
          });
        } else {
          // Fallback: try to find GP names in any sheet
          workbook.eachSheet((worksheet) => {
            totalErrorsCount += Math.max(0, worksheet.rowCount - 1);
          });
        }

        // Save error file to database
        const errorFile = await db.createErrorFile({
          fileName: input.filename,
          fileUrl,
          fileKey,
          month: input.month,
          year: input.year,
          fileType: input.errorType,
          uploadedById: ctx.user.id,
        });

        // Save individual GP errors to database and update attendance
        for (const [gpName, count] of Object.entries(gpErrorCounts)) {
          // Create GP error records
          for (let i = 0; i < count; i++) {
            await db.createGpError({
              gpName,
              errorFileId: errorFile.id,
              errorDate: new Date(input.year, input.month - 1, 15), // Middle of month
            });
          }
        }

        // Update GP attendance with mistake counts
        await db.updateGPMistakesFromErrors(input.month, input.year);

        return { ...errorFile, parsedErrors: totalErrorsCount, gpErrorCounts };
      }),

    list: protectedProcedure.query(async () => {
      return await db.getAllErrorFiles();
    }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteErrorFile(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
