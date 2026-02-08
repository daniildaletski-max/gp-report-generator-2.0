import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import { sendReportEmail, sendEmail } from "./_core/email";
import { nanoid } from "nanoid";
import * as db from "./db";
import ExcelJS from "exceljs";
import XLSXChart from "xlsx-chart";
import { google } from "googleapis";
// Chart generation via QuickChart API
async function generateChartImage(
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
        labels: labels,
        datasets: [
          {
            label: 'Total Score (max 24)',
            data: totalScores,
            backgroundColor: 'rgba(54, 162, 235, 0.9)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.8,
            categoryPercentage: 0.9
          },
          {
            label: 'Appearance (max 12)',
            data: appearanceScores,
            backgroundColor: 'rgba(75, 192, 192, 0.9)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.8,
            categoryPercentage: 0.9
          },
          {
            label: 'Game Performance (max 10)',
            data: gamePerformanceScores,
            backgroundColor: 'rgba(255, 159, 64, 0.9)',
            borderColor: 'rgba(255, 159, 64, 1)',
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.8,
            categoryPercentage: 0.9
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 18, weight: 'bold' },
            padding: { bottom: 20 }
          },
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              font: { size: 12 }
            }
          },
          datalabels: {
            display: true,
            anchor: 'end',
            align: 'top',
            font: { size: 10, weight: 'bold' },
            formatter: (value: number) => value.toFixed(1)
          }
        },
        scales: {
          y: {
            min: 0,
            max: 25,
            grace: '0',
            ticks: {
              stepSize: 5
            },
            title: {
              display: true,
              text: 'Score',
              font: { size: 14, weight: 'bold' }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Game Presenters',
              font: { size: 14, weight: 'bold' }
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              font: { size: 11 }
            },
            grid: {
              display: false
            }
          }
        }
      }
    };

    const chartUrl = `https://quickchart.io/chart?v=3&c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=900&h=450&bkg=white`;
    
    const response = await fetch(chartUrl);
    if (!response.ok) {
      console.error('[generateChartImage] QuickChart API error:', response.status);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[generateChartImage] Error:', error);
    return null;
  }
}

// Generate comparison chart between current and previous month
async function generateComparisonChart(
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
        labels: labels,
        datasets: [
          {
            label: currentMonthName,
            data: currentScores,
            backgroundColor: 'rgba(54, 162, 235, 0.8)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          },
          {
            label: previousMonthName,
            data: previousScores,
            backgroundColor: 'rgba(255, 159, 64, 0.6)',
            borderColor: 'rgba(255, 159, 64, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16 }
          },
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 24,
            title: {
              display: true,
              text: 'Total Score'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Game Presenters'
            }
          }
        }
      }
    };

    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=700&h=350&bkg=white`;
    
    const response = await fetch(chartUrl);
    if (!response.ok) {
      console.error('[generateComparisonChart] QuickChart API error:', response.status);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[generateComparisonChart] Error:', error);
    return null;
  }
}

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
        content: `You are a highly accurate OCR assistant specialized in extracting structured data from Game Presenter evaluation screenshots.

IMPORTANT EXTRACTION RULES:
1. PRESENTER NAME: Extract the full name exactly as shown (First Name + Last Name). Look for labels like "Game Presenter", "GP Name", or similar.
2. EVALUATOR NAME: Extract the full name of the person who conducted the evaluation.
3. DATE: Extract the evaluation date. Common formats: "9 Jan 2026", "09/01/2026", "January 9, 2026".
4. GAME TYPE: Look for game names like Baccarat, Roulette, Blackjack, Dragon Tiger, etc.
5. SCORES: Each category shows a score in format "X/Y" where X is achieved score and Y is maximum possible.
   - Hair: Usually /3 max
   - Makeup: Usually /3 max
   - Outfit: Usually /3 max
   - Posture: Usually /3 max
   - Dealing Style: Usually /5 max
   - Game Performance/Game Commenting: Usually /5 max
6. COMMENTS: Extract any feedback text associated with each category.
7. TOTAL SCORE: Sum of all individual scores, typically out of 22.

Be precise and extract exactly what you see. If a field is not visible, use reasonable defaults (empty string for comments, 0 for missing scores).`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Carefully analyze this evaluation screenshot and extract ALL data. Pay special attention to:\n- The presenter's FULL NAME (first + last)\n- All score values (X/Y format)\n- Any comments or feedback for each category\n\nReturn a complete JSON object with: presenterName, evaluatorName, date, game, totalScore, and category objects (hair, makeup, outfit, posture, dealingStyle, gamePerformance) each containing score, maxScore, and comment."
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
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to extract data from image' });
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
      // Clear cookie with computed domain
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
      // Also clear without domain (covers localhost and direct access)
      ctx.res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'none', secure: true, maxAge: 0 });
      // Clear with hostname as domain
      const hostname = ctx.req.hostname;
      if (hostname) {
        ctx.res.clearCookie(COOKIE_NAME, { domain: hostname, path: '/', httpOnly: true, sameSite: 'none', secure: true, maxAge: 0 });
        ctx.res.clearCookie(COOKIE_NAME, { domain: `.${hostname}`, path: '/', httpOnly: true, sameSite: 'none', secure: true, maxAge: 0 });
      }
      // Set expired cookie header as additional fallback
      ctx.res.setHeader('Set-Cookie', [
        `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=None; Secure`,
        `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure`,
      ]);
      return { success: true } as const;
    }),
  }),

  // FM Teams management
  fmTeam: router({
    // List teams - for non-admin shows only their own teams, for admin shows all
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'admin') {
        return await db.getAllFmTeams();
      }
      // User sees only teams they created
      return await db.getFmTeamsByUser(ctx.user.id);
    }),

    // List all teams with stats (admin only)
    listWithStats: adminProcedure.query(async () => {
      return await db.getAllTeamsWithStats();
    }),

    // Get team details with users (admin only)
    getWithUsers: adminProcedure
      .input(z.object({ teamId: z.number() }))
      .query(async ({ input }) => {
        return await db.getTeamWithUsers(input.teamId);
      }),
    
    // Initialize default teams (admin only)
    initialize: adminProcedure.mutation(async () => {
      await db.initializeDefaultTeams();
      return { success: true };
    }),

    // Create new team - any authenticated user can create their own team
    create: protectedProcedure
      .input(z.object({
        teamName: z.string().min(1),
        floorManagerName: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const team = await db.createFmTeam({
          ...input,
          userId: ctx.user.id,
        });
        return team;
      }),

    // Update team - users can update their own teams, admin can update any
    update: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        teamName: z.string().min(1).optional(),
        floorManagerName: z.string().min(1).optional(),
        gpIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify ownership for non-admin users
        if (ctx.user.role !== 'admin') {
          const team = await db.getFmTeamById(input.teamId);
          if (!team || team.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only update your own teams' });
          }
        }
        const { teamId, gpIds, ...data } = input;
        if (gpIds !== undefined) {
          await db.updateTeamWithGPs(teamId, data, gpIds);
        } else {
          await db.updateFmTeam(teamId, data);
        }
        return { success: true };
      }),

    // Delete team - users can delete their own teams, admin can delete any
    delete: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Verify ownership for non-admin users
        if (ctx.user.role !== 'admin') {
          const team = await db.getFmTeamById(input.teamId);
          if (!team || team.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only delete your own teams' });
          }
        }
        await db.deleteFmTeam(input.teamId);
        return { success: true };
      }),

    // Get team with GPs - users see their own, admin sees all
    getWithGPs: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          const team = await db.getFmTeamById(input.teamId);
          if (!team || team.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only view your own teams' });
          }
        }
        return await db.getTeamWithGPs(input.teamId);
      }),

    // List teams with GPs - users see their own, admin sees all
    listWithGPs: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        return await db.getTeamsWithGPsByUser(ctx.user.id);
      }
      return await db.getAllTeamsWithGPs();
    }),

    // Assign GPs to team - users can assign to their own teams
    assignGPs: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        gpIds: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          const team = await db.getFmTeamById(input.teamId);
          if (!team || team.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only assign GPs to your own teams' });
          }
          // Verify GP ownership
          const verification = await db.verifyGpOwnershipByUser(input.gpIds, ctx.user.id);
          if (!verification.valid) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only assign your own GPs' });
          }
        }
        return await db.assignGPsToTeam(input.gpIds, input.teamId);
      }),

    // Remove GPs from team - users can remove from their own teams
    removeGPs: protectedProcedure
      .input(z.object({
        gpIds: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          const verification = await db.verifyGpOwnershipByUser(input.gpIds, ctx.user.id);
          if (!verification.valid) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only remove your own GPs from teams' });
          }
        }
        return await db.removeGPsFromTeam(input.gpIds);
      }),

    // Get unassigned GPs - users see their own unassigned GPs
    getUnassignedGPs: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        return await db.getUnassignedGPsByUser(ctx.user.id);
      }
      return await db.getUnassignedGPs();
    }),
  }),

  // Upload and process evaluation screenshots
  evaluation: router({
    uploadAndExtract: protectedProcedure
      .input(z.object({
        imageBase64: z.string().max(10 * 1024 * 1024), // Max 10MB base64
        filename: z.string().max(255).regex(/^[\w\-. ]+$/), // Safe filename
        mimeType: z.string().refine(m => ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(m), {
          message: 'Invalid image type. Allowed: PNG, JPEG, WebP'
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const fileKey = `evaluations/${ctx.user.id}/${nanoid()}-${db.sanitizeString(input.filename, 100)}`;
        const buffer = Buffer.from(input.imageBase64, "base64");
        const { url: imageUrl } = await storagePut(fileKey, buffer, input.mimeType);

        const extractedData = await extractEvaluationFromImage(imageUrl);
        const gp = await db.findOrCreateGamePresenter(extractedData.presenterName, undefined, ctx.user.id);
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
          userId: ctx.user.id, // For data isolation - user sees their own uploads
        });

        return {
          success: true,
          evaluation,
          extractedData,
          gamePresenter: gp,
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      // User-based data isolation: each user sees only their own data
      if (ctx.user.role !== 'admin') {
        return await db.getEvaluationsWithGPByUser(ctx.user.id);
      }
      // Admin sees all
      return await db.getEvaluationsWithGP();
    }),

    getByMonth: protectedProcedure
      .input(z.object({
        year: z.number(),
        month: z.number().min(1).max(12),
      }))
      .query(async ({ ctx, input }) => {
        // User-based data isolation
        if (ctx.user.role !== 'admin') {
          return await db.getEvaluationsByMonthAndUser(input.year, input.month, ctx.user.id);
        }
        return await db.getEvaluationsByMonth(input.year, input.month);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const evaluation = await db.getEvaluationWithGP(input.id);
        if (!evaluation) return null;
        
        // User-based data isolation: non-admin can only access their own evaluations
        if (ctx.user.role !== 'admin') {
          const evalUserId = evaluation.evaluation?.userId || evaluation.evaluation?.uploadedById;
          if (evalUserId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only view your own evaluations' });
          }
        }
        return evaluation;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number().positive(),
        evaluatorName: z.string().max(255).optional(),
        evaluationDate: z.date().optional(),
        game: z.string().max(100).optional(),
        totalScore: z.number().min(0).max(100).optional(),
        hairScore: z.number().min(0).max(5).optional(),
        makeupScore: z.number().min(0).max(5).optional(),
        outfitScore: z.number().min(0).max(5).optional(),
        postureScore: z.number().min(0).max(5).optional(),
        dealingStyleScore: z.number().min(0).max(10).optional(),
        gamePerformanceScore: z.number().min(0).max(10).optional(),
        hairComment: z.string().max(1000).optional(),
        makeupComment: z.string().max(1000).optional(),
        outfitComment: z.string().max(1000).optional(),
        postureComment: z.string().max(1000).optional(),
        dealingStyleComment: z.string().max(1000).optional(),
        gamePerformanceComment: z.string().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check ownership before update - user-based data isolation
        const evaluation = await db.getEvaluationWithGP(input.id);
        if (!evaluation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evaluation not found' });
        if (ctx.user.role !== 'admin') {
          const evalUserId = evaluation.evaluation?.userId || evaluation.evaluation?.uploadedById;
          if (evalUserId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only edit your own evaluations' });
          }
        }
        
        const { id, ...data } = input;
        // Sanitize text fields
        if (data.evaluatorName) data.evaluatorName = db.sanitizeString(data.evaluatorName, 255);
        if (data.game) data.game = db.sanitizeString(data.game, 100);
        if (data.hairComment) data.hairComment = db.sanitizeString(data.hairComment, 1000);
        if (data.makeupComment) data.makeupComment = db.sanitizeString(data.makeupComment, 1000);
        if (data.outfitComment) data.outfitComment = db.sanitizeString(data.outfitComment, 1000);
        if (data.postureComment) data.postureComment = db.sanitizeString(data.postureComment, 1000);
        if (data.dealingStyleComment) data.dealingStyleComment = db.sanitizeString(data.dealingStyleComment, 1000);
        if (data.gamePerformanceComment) data.gamePerformanceComment = db.sanitizeString(data.gamePerformanceComment, 1000);
        
        // Recalculate derived scores when individual scores change
        const updateData: any = { ...data };
        const hairS = data.hairScore ?? evaluation.evaluation?.hairScore ?? 0;
        const makeupS = data.makeupScore ?? evaluation.evaluation?.makeupScore ?? 0;
        const outfitS = data.outfitScore ?? evaluation.evaluation?.outfitScore ?? 0;
        const postureS = data.postureScore ?? evaluation.evaluation?.postureScore ?? 0;
        const dealingS = data.dealingStyleScore ?? evaluation.evaluation?.dealingStyleScore ?? 0;
        const gamePerfS = data.gamePerformanceScore ?? evaluation.evaluation?.gamePerformanceScore ?? 0;
        updateData.appearanceScore = (hairS || 0) + (makeupS || 0) + (outfitS || 0) + (postureS || 0);
        updateData.gamePerformanceTotalScore = (dealingS || 0) + (gamePerfS || 0);
        updateData.totalScore = updateData.appearanceScore + updateData.gamePerformanceTotalScore;
        
        const updated = await db.updateEvaluation(id, updateData);
        return { success: true, evaluation: updated };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().positive() }))
      .mutation(async ({ ctx, input }) => {
        // Check ownership before delete - user-based data isolation
        const evaluation = await db.getEvaluationWithGP(input.id);
        if (!evaluation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Evaluation not found' });
        if (ctx.user.role !== 'admin') {
          const evalUserId = evaluation.evaluation?.userId || evaluation.evaluation?.uploadedById;
          if (evalUserId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only delete your own evaluations' });
          }
        }
        
        await db.deleteEvaluation(input.id);
        return { success: true };
      }),

    deleteByMonth: protectedProcedure
      .input(z.object({
        year: z.number(),
        month: z.number().min(1).max(12),
      }))
      .mutation(async ({ ctx, input }) => {
        // User-based data isolation
        if (ctx.user.role !== 'admin') {
          const count = await db.deleteEvaluationsByMonthAndUser(input.year, input.month, ctx.user.id);
          return { success: true, deletedCount: count };
        }
        const count = await db.deleteEvaluationsByMonth(input.year, input.month);
        return { success: true, deletedCount: count };
      }),

    deleteByDateRange: protectedProcedure
      .input(z.object({
        startDate: z.date(),
        endDate: z.date(),
      }))
      .mutation(async ({ ctx, input }) => {
        // User-based data isolation
        if (ctx.user.role !== 'admin') {
          const count = await db.deleteEvaluationsByDateRangeAndUser(input.startDate, input.endDate, ctx.user.id);
          return { success: true, deletedCount: count };
        }
        const count = await db.deleteEvaluationsByDateRange(input.startDate, input.endDate);
        return { success: true, deletedCount: count };
      }),
  }),

  // Game Presenters management
  gamePresenter: router({
    // List all GPs (admin) or user's GPs (non-admin)
    list: protectedProcedure.query(async ({ ctx }) => {
      // User-based data isolation: each user sees only their own GPs
      if (ctx.user.role !== 'admin') {
        return await db.getAllGamePresentersByUser(ctx.user.id);
      }
      // Admin sees all
      return await db.getAllGamePresenters();
    }),

    // List GPs with monthly stats
    listWithStats: protectedProcedure
      .input(z.object({
        teamId: z.number().optional(),
        month: z.number().min(1).max(12),
        year: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        // User-based data isolation
        if (ctx.user.role !== 'admin') {
          const userGPs = await db.getAllGamePresentersByUser(ctx.user.id);
          const result = await Promise.all(userGPs.map(async (gp) => {
            const stats = await db.getMonthlyGpStats(gp.id, input.month, input.year);
            return { ...gp, stats };
          }));
          return result;
        }
        // Admin: use teamId if provided, otherwise all GPs
        const teamId = input.teamId;
        if (!teamId) {
          const allGPs = await db.getAllGamePresenters();
          const result = await Promise.all(allGPs.map(async (gp) => {
            const stats = await db.getMonthlyGpStats(gp.id, input.month, input.year);
            return { ...gp, stats };
          }));
          return result;
        }
        return await db.getGamePresentersByTeamWithStats(teamId, input.month, input.year);
      }),
    
    assignToTeam: protectedProcedure
      .input(z.object({
        gpId: z.number(),
        teamId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // User-based data isolation: verify GP ownership
        if (ctx.user.role !== 'admin') {
          const gp = await db.getGamePresenterById(input.gpId);
          if (!gp || gp.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only manage your own Game Presenters' });
          }
        }
        await db.updateGamePresenterTeam(input.gpId, input.teamId);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ gpId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const gp = await db.getGamePresenterById(input.gpId);
        if (!gp) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
        }
        // User-based data isolation: non-admin can only delete their own GPs
        if (ctx.user.role !== 'admin' && gp.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only delete your own Game Presenters' });
        }
        await db.deleteGamePresenter(input.gpId);
        return { success: true, deletedName: gp.name };
      }),

    // Fuzzy search for GP by name
    fuzzySearch: protectedProcedure
      .input(z.object({
        name: z.string(),
        threshold: z.number().min(0).max(1).default(0.5),
      }))
      .query(async ({ ctx, input }) => {
        // User-based data isolation
        const matches = ctx.user.role !== 'admin'
          ? await db.findAllMatchingGPsByUser(input.name, input.threshold, ctx.user.id)
          : await db.findAllMatchingGPs(input.name, input.threshold);
        return matches.map(m => ({
          id: m.gamePresenter.id,
          name: m.gamePresenter.name,
          teamId: m.gamePresenter.teamId,
          similarity: m.similarity,
          similarityPercent: Math.round(m.similarity * 100),
          isExactMatch: m.isExactMatch,
        }));
      }),

    // Find best match for GP name
    findBestMatch: protectedProcedure
      .input(z.object({
        name: z.string(),
        threshold: z.number().min(0).max(1).default(0.7),
      }))
      .query(async ({ ctx, input }) => {
        // User-based data isolation
        const match = ctx.user.role !== 'admin'
          ? await db.findBestMatchingGPByUser(input.name, input.threshold, ctx.user.id)
          : await db.findBestMatchingGP(input.name, input.threshold);
        if (!match) return null;
        return {
          id: match.gamePresenter.id,
          name: match.gamePresenter.name,
          teamId: match.gamePresenter.teamId,
          similarity: match.similarity,
          similarityPercent: Math.round(match.similarity * 100),
          isExactMatch: match.isExactMatch,
        };
      }),

    // Update attitude and mistakes for a GP
    updateStats: protectedProcedure
      .input(z.object({
        gpId: z.number(),
        month: z.number().min(1).max(12),
        year: z.number(),
        attitude: z.number().nullable().optional(),
        mistakes: z.number().min(0).optional(),
        totalGames: z.number().min(0).optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check GP ownership - user-based data isolation
        const gp = await db.getGamePresenterById(input.gpId);
        if (!gp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
        if (ctx.user.role !== 'admin' && gp.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only update your own GP stats' });
        }
        
        const { gpId, month, year, ...data } = input;
        const stats = await db.updateMonthlyGpStats(gpId, month, year, {
          ...data,
          updatedById: ctx.user.id,
          userId: ctx.user.id, // Set userId for data isolation
        });
        return { success: true, stats };
      }),

    // Bulk update stats for multiple GPs
    bulkUpdateStats: protectedProcedure
      .input(z.object({
        updates: z.array(z.object({
          gpId: z.number(),
          attitude: z.number().nullable().optional(),
          mistakes: z.number().min(0).optional(),
          notes: z.string().nullable().optional(),
        })),
        month: z.number().min(1).max(12),
        year: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const gpIds = input.updates.map(u => u.gpId);
        
        // User-based data isolation: verify GP ownership by userId
        if (ctx.user.role !== 'admin') {
          const verification = await db.verifyGpOwnershipByUser(gpIds, ctx.user.id);
          if (!verification.valid) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: Some GPs do not belong to you' });
          }
        }
        
        const result = await db.bulkUpdateMonthlyGpStats(
          input.updates,
          input.month,
          input.year,
          ctx.user.id
        );
        
        return result;
      }),

    // Bulk set attitude for multiple GPs
    bulkSetAttitude: protectedProcedure
      .input(z.object({
        gpIds: z.array(z.number().positive()).max(100), // Max 100 GPs at once
        attitude: z.number(),
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2100),
      }))
      .mutation(async ({ ctx, input }) => {
        // User-based data isolation: verify GP ownership by userId
        if (ctx.user.role !== 'admin') {
          const verification = await db.verifyGpOwnershipByUser(input.gpIds, ctx.user.id);
          if (!verification.valid) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: Some GPs do not belong to you' });
          }
        }
        
        const result = await db.bulkSetAttitude(
          input.gpIds,
          input.attitude,
          input.month,
          input.year,
          ctx.user.id
        );
        
        return result;
      }),

    // Bulk reset mistakes for multiple GPs
    bulkResetMistakes: protectedProcedure
      .input(z.object({
        gpIds: z.array(z.number().positive()).max(100),
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2100),
      }))
      .mutation(async ({ ctx, input }) => {
        // User-based data isolation: verify GP ownership by userId
        if (ctx.user.role !== 'admin') {
          const verification = await db.verifyGpOwnershipByUser(input.gpIds, ctx.user.id);
          if (!verification.valid) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: Some GPs do not belong to you' });
          }
        }
        
        const result = await db.bulkResetMistakes(
          input.gpIds,
          input.month,
          input.year,
          ctx.user.id
        );
        
        return result;
      }),

    // Get detailed GP information including evaluations, attitude, and errors
    getDetails: protectedProcedure
      .input(z.object({
        gpId: z.number(),
        month: z.number().min(1).max(12),
        year: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        // Get GP basic info
        const gp = await db.getGamePresenterById(input.gpId);
        if (!gp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
        
        // User-based data isolation
        if (ctx.user.role !== 'admin' && gp.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only view your own GP details' });
        }
        
        // Get team info
        const team = gp.teamId ? await db.getTeamById(gp.teamId) : null;
        
        // Get monthly stats
        const stats = await db.getMonthlyGpStats(input.gpId, input.month, input.year);
        
        // Get evaluations for this month - use date-filtered query for performance
        const monthlyEvaluations = await db.getEvaluationsByGPAndMonth(input.gpId, input.year, input.month);
        
        // Get errors from gpErrors table (parsed from Excel)
        const errors = await db.getGpErrorsForPortal(input.gpId, input.month, input.year);
        
        // Get attitude screenshots
        const attitudeScreenshots = await db.getAttitudeScreenshotsForGP(input.gpId, input.month, input.year);
        
        // Get error screenshots
        const errorScreenshots = await db.getErrorScreenshotsForGP(input.gpId, input.month, input.year);
        
        return {
          gp: {
            id: gp.id,
            name: gp.name,
            teamId: gp.teamId,
            teamName: team?.teamName || 'Unassigned',
            createdAt: gp.createdAt,
          },
          stats: stats || {
            attitude: 0,
            mistakes: 0,
            totalGames: 0,
            notes: null,
          },
          evaluations: monthlyEvaluations.map(e => ({
            id: e.id,
            date: e.evaluationDate,
            totalScore: e.totalScore,
            appearanceScore: e.appearanceScore,
            gamePerformanceScore: e.gamePerformanceTotalScore, // Use total (Dealing + GamePerf)
            comments: e.hairComment || e.makeupComment || e.outfitComment || e.postureComment || e.dealingStyleComment || e.gamePerformanceComment || null,
            evaluatedBy: e.evaluatorName,
          })),
          errors: errors.map(e => ({
            id: e.id,
            date: e.errorDate,
            description: e.errorDescription,
            errorCode: e.errorCode,
            gameType: e.gameType,
            tableId: e.tableId,
          })),
          attitudeScreenshots: attitudeScreenshots.map(s => ({
            id: s.id,
            url: s.screenshotUrl,
            extractedData: s.rawExtractedData,
            createdAt: s.createdAt,
            // Enhanced attitude entry data
            attitudeType: s.attitudeType,
            attitudeScore: s.attitudeScore,
            comment: s.comment,
            evaluationDate: s.evaluationDate,
          })),
          errorScreenshots: errorScreenshots.map(s => ({
            id: s.id,
            url: s.screenshotUrl,
            extractedData: s.rawExtractedData,
            createdAt: s.createdAt,
          })),
        };
      }),
  }),

  // User/FM management
  user: router({
    // Get current user with team info
    me: protectedProcedure.query(async ({ ctx }) => {
      const userWithTeam = await db.getUserWithTeam(ctx.user.id);
      return userWithTeam;
    }),

    // List all users (admin only)
    list: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    // Assign user to team (admin only)
    assignToTeam: adminProcedure
      .input(z.object({
        userId: z.number(),
        teamId: z.number().nullable(),
      }))
      .mutation(async ({ input }) => {
        await db.updateUserTeam(input.userId, input.teamId);
        return { success: true };
      }),

    // Update user role (admin only)
    updateRole: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['user', 'admin']),
      }))
      .mutation(async ({ input }) => {
        await db.updateUserRole(input.userId, input.role);
        return { success: true };
      }),

    // Delete user (admin only)
    delete: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Prevent admin from deleting themselves
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete your own account' });
        }
        await db.deleteUser(input.userId);
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
      .query(async ({ ctx, input }) => {
        // User-based data isolation: each user sees only their own stats
        if (ctx.user.role !== 'admin') {
          return await db.getDashboardStatsByUser(input?.month, input?.year, ctx.user.id);
        }
        // Admin sees all
        return await db.getDashboardStats(input?.month, input?.year, undefined);
      }),

    // Monthly trend data for comparative analytics
    monthlyTrend: protectedProcedure
      .input(z.object({
        months: z.number().min(2).max(12).optional(),
        teamId: z.number().positive().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const months = input?.months || 6;
        const teamId = input?.teamId;
        if (ctx.user.role !== 'admin') {
          return await db.getMonthlyTrendData(months, teamId, ctx.user.id);
        }
        return await db.getMonthlyTrendData(months, teamId);
      }),

    // Cross-team GP comparison
    teamComparison: protectedProcedure
      .input(z.object({
        teamIds: z.array(z.number().positive()).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const teamIds = input?.teamIds;
        if (ctx.user.role !== 'admin') {
          return await db.getTeamComparisonData(ctx.user.id, teamIds);
        }
        // Admin sees all teams - need a userId, use owner
        return await db.getTeamComparisonData(ctx.user.id, teamIds);
      }),

    // Admin dashboard with system-wide stats
    adminStats: adminProcedure.query(async () => {
      return await db.getAdminDashboardStats();
    }),
  }),

  // Report generation
  report: router({
    // Auto-fill text fields based on evaluation data using LLM
    autoFillFields: protectedProcedure
      .input(z.object({
        teamId: z.number().positive(),
        reportMonth: z.number().min(1).max(12),
        reportYear: z.number().min(2020).max(2100),
      }))
      .mutation(async ({ ctx, input }) => {
        // User-based data isolation: verify team belongs to user
        if (ctx.user.role !== 'admin') {
          const team = await db.getFmTeamById(input.teamId);
          if (!team || team.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only generate content for your own teams' });
          }
        }
        
        const team = await db.getFmTeamById(input.teamId);
        if (!team) throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });

        const monthName = MONTH_NAMES[input.reportMonth - 1];
        const stats = await db.getGPMonthlyStats(input.teamId, input.reportYear, input.reportMonth);
        const attendance = await db.getAttendanceByTeamMonth(input.teamId, input.reportMonth, input.reportYear);
        
        // Get error counts for each GP
        const errorCounts = await db.getErrorCountByGP(input.reportMonth, input.reportYear);
        
        // Get attitude data for each GP in the team
        const teamGPs = await db.getGamePresentersByTeam(input.teamId);
        const attitudeData: { gpName: string; positive: number; negative: number; total: number }[] = [];
        
        for (const gp of teamGPs) {
          const attitudes = await db.getAttitudeScreenshotsForGP(gp.id, input.reportMonth, input.reportYear);
          const positive = attitudes.filter(a => a.attitudeType === 'positive').length;
          const negative = attitudes.filter(a => a.attitudeType === 'negative').length;
          if (positive > 0 || negative > 0) {
            attitudeData.push({ gpName: gp.name, positive, negative, total: positive - negative });
          }
        }

        if (stats.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No evaluation data available for this month' });
        }

        // Prepare data summary for LLM
        const avgTotal = stats.reduce((sum, gp) => sum + Number(gp.avgTotalScore || 0), 0) / stats.length;
        const avgAppearance = stats.reduce((sum, gp) => sum + Number(gp.avgAppearanceScore || 0), 0) / stats.length;
        const avgGamePerf = stats.reduce((sum, gp) => sum + Number(gp.avgGamePerfScore || 0), 0) / stats.length;
        
        const topPerformers = [...stats]
          .sort((a, b) => Number(b.avgTotalScore || 0) - Number(a.avgTotalScore || 0))
          .slice(0, 3);
        
        const needsImprovement = stats.filter(gp => Number(gp.avgTotalScore || 0) < 18);
        
        // Calculate attendance stats
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
        
        // Identify GPs with most errors
        const gpsWithErrors = gpDetailedData.filter(gp => gp.errorCount > 0)
          .sort((a, b) => b.errorCount - a.errorCount);
        
        // Identify GPs with negative attitude
        const gpsWithNegativeAttitude = gpDetailedData.filter(gp => gp.attitudeNegative > 0)
          .sort((a, b) => b.attitudeNegative - a.attitudeNegative);
        
        // Identify GPs with positive attitude
        const gpsWithPositiveAttitude = gpDetailedData.filter(gp => gp.attitudePositive > 0)
          .sort((a, b) => b.attitudePositive - a.attitudePositive);

        const totalErrors = gpsWithErrors.reduce((sum, gp) => sum + gp.errorCount, 0);
        const totalPositiveAttitude = attitudeData.reduce((sum, a) => sum + a.positive, 0);
        const totalNegativeAttitude = attitudeData.reduce((sum, a) => sum + a.negative, 0);

        const formatGpLine = (gp: (typeof gpDetailedData)[number]) => (
          `${gp.name} | Score ${gp.avgScore}/24 | Appearance ${gp.appearanceScore}/12 | Game ${gp.gamePerformanceScore}/10 | ` +
          `Evals ${gp.evaluationCount} | Errors ${gp.errorCount} | Attitude +${gp.attitudePositive}/-${gp.attitudeNegative} | ` +
          `Late ${gp.lateArrivals} | Missed ${gp.missedDays}`
        );

        // Build comprehensive context for LLM
        const dataContext = `
Team: ${team.teamName}
Floor Manager: ${team.floorManagerName}
Period: ${monthName} ${input.reportYear}

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
- Total Team Errors: ${totalErrors}
${gpsWithErrors.length > 0 ? `GPs with errors:
${gpsWithErrors.slice(0, 5).map(gp => `- ${gp.name}: ${gp.errorCount} errors`).join("\n")}` : "No errors recorded this month"}

=== ATTITUDE ANALYSIS ===
- Total Positive Feedback: ${totalPositiveAttitude}
- Total Negative Feedback: ${totalNegativeAttitude}
${gpsWithPositiveAttitude.length > 0 ? `GPs with positive attitude feedback:
${gpsWithPositiveAttitude.slice(0, 3).map(gp => `- ${gp.name}: +${gp.attitudePositive}`).join("\n")}` : "No positive attitude feedback recorded"}
${gpsWithNegativeAttitude.length > 0 ? `GPs with negative attitude feedback:
${gpsWithNegativeAttitude.slice(0, 3).map(gp => `- ${gp.name}: -${gp.attitudeNegative}`).join("\n")}` : "No negative attitude feedback recorded"}

=== ATTENDANCE SUMMARY ===
- Total Mistakes/Errors: ${totalMistakes}
- Extra Shifts Worked: ${totalExtraShifts}
- Late Arrivals: ${totalLate}
- Missed Days: ${totalMissed}
- Sick Leaves: ${totalSick}

=== INDIVIDUAL GP BREAKDOWN ===
${gpDetailedData.map(formatGpLine).join("\n")}
`;

        const sharedPromptRules = `Rules:
- Use only facts present in the data context.
- Do NOT invent names, numbers, or events.
- If data is missing, state it is not available rather than guessing.
- Keep the tone professional and concise.`;

        // Generate FM Performance text
        const fmPerformanceResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an experienced Floor Manager writing a self-evaluation for a monthly casino operations report.

Guidelines:
- Write in first person, professionally and concisely
- Focus on: team management achievements, studio operations improvements, handling of challenges
- Reference specific metrics from the data (scores, error reduction, attitude improvements)
- Keep it to 3-4 sentences
- Do NOT use bullet points
- Be specific about what was accomplished this month

${sharedPromptRules}`
            },
            {
              role: "user",
              content: `Based on this comprehensive team data, write a brief FM self-evaluation that highlights your management achievements:\n${dataContext}`
            }
          ]
        });

        // Generate Goals text with enhanced prompt
        const goalsResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an experienced Floor Manager creating SMART goals for a monthly casino operations report.

Guidelines for writing optimal Team Goals:
1. Analyze the data to identify the TOP 3 priority areas:
   - GPs with low evaluation scores (< 18/24) need improvement plans
   - GPs with high error counts need error reduction targets
   - GPs with negative attitude feedback need behavior coaching
   - Attendance issues (late arrivals, missed days) need addressing

2. For each goal, be SPECIFIC:
   - Name the GPs who need improvement (if applicable)
   - Set measurable targets (e.g., "reduce errors by 50%", "improve score to 19+")
   - Focus on actionable improvements

3. Balance the goals:
   - 1 goal for maintaining/rewarding top performers
   - 1-2 goals for addressing weaknesses (errors, scores, attitude)
   - Consider team-wide improvements if no individual issues

4. Format: Write 3-4 concise sentences. Do NOT use bullet points.

IMPORTANT: Be specific with names and numbers from the data. Generic goals are not acceptable.

${sharedPromptRules}`
            },
            {
              role: "user",
              content: `Based on this comprehensive team performance data, create specific, actionable Team Goals for next month:\n${dataContext}`
            }
          ]
        });

        // Generate Team Overview text with enhanced prompt
        const teamOverviewResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an experienced Floor Manager writing a comprehensive Team Overview for a monthly casino operations report.

Guidelines for writing an optimal Team Overview:
1. Start with overall team performance assessment:
   - Team average score and what it indicates (Excellent/Good/Needs Work)
   - Compare appearance vs game performance scores

2. Highlight achievements:
   - Name top 2-3 performers with their scores
   - Mention any GPs with positive attitude feedback
   - Note extra shifts or exceptional dedication

3. Address concerns honestly:
   - Name GPs with scores below 18 and their specific issues
   - Mention error counts for GPs with multiple errors
   - Note any negative attitude feedback recipients
   - Address attendance issues (late arrivals, missed days)

4. Provide balanced perspective:
   - Acknowledge both strengths and areas for improvement
   - Be factual and data-driven

5. Format: Write 4-5 concise sentences. Do NOT use bullet points.

IMPORTANT: Use specific names and numbers from the data. A good overview is honest, specific, and actionable.

${sharedPromptRules}`
            },
            {
              role: "user",
              content: `Based on this comprehensive team performance data, write a detailed Team Overview that accurately reflects the team's performance this month:\n${dataContext}`
            }
          ]
        });

        const fmPerformanceContent = fmPerformanceResponse.choices[0]?.message?.content;
        const goalsContent = goalsResponse.choices[0]?.message?.content;
        const teamOverviewContent = teamOverviewResponse.choices[0]?.message?.content;
        
        // Ensure we extract string content from LLM response
        const fmPerformance = typeof fmPerformanceContent === 'string' ? fmPerformanceContent : '';
        const goalsThisMonth = typeof goalsContent === 'string' ? goalsContent : '';
        const teamOverview = typeof teamOverviewContent === 'string' ? teamOverviewContent : '';

        return {
          fmPerformance,
          goalsThisMonth,
          teamOverview,
          stats: {
            totalGPs: stats.length,
            avgTotal: avgTotal.toFixed(1),
            avgAppearance: avgAppearance.toFixed(1),
            avgGamePerf: avgGamePerf.toFixed(1),
            topPerformers: topPerformers.map(gp => ({
              name: gp.gpName,
              score: Number(gp.avgTotalScore || 0).toFixed(1)
            })),
            needsImprovement: needsImprovement.map(gp => ({
              name: gp.gpName,
              score: Number(gp.avgTotalScore || 0).toFixed(1)
            })),
            attendance: {
              totalMistakes,
              totalExtraShifts,
              totalLate,
              totalMissed,
              totalSick
            }
          }
        };
      }),

    generate: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        reportMonth: z.number().min(1).max(12),
        reportYear: z.number(),
        fmPerformance: z.string().optional(),
        goalsThisMonth: z.string().optional(),
        teamOverview: z.string().optional(),
        additionalComments: z.string().optional(),
        autoFill: z.boolean().optional().default(true), // Auto-fill empty fields by default
      }))
      .mutation(async ({ ctx, input }) => {
        // User-based data isolation: verify team belongs to user
        if (ctx.user.role !== 'admin') {
          const teamCheck = await db.getFmTeamById(input.teamId);
          if (!teamCheck || teamCheck.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only generate reports for your own teams' });
          }
        }
        
        const team = await db.getFmTeamById(input.teamId);
        if (!team) throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });

        const stats = await db.getGPMonthlyStats(input.teamId, input.reportYear, input.reportMonth);
        const attendance = await db.getAttendanceByTeamMonth(input.teamId, input.reportMonth, input.reportYear);
        const monthName = MONTH_NAMES[input.reportMonth - 1];
        
        // Get error counts for each GP
        const errorCounts = await db.getErrorCountByGP(input.reportMonth, input.reportYear);
        
        // Get attitude data for each GP in the team
        const teamGPs = await db.getGamePresentersByTeam(input.teamId);
        const attitudeData: { gpName: string; positive: number; negative: number; total: number }[] = [];
        
        for (const gp of teamGPs) {
          const attitudes = await db.getAttitudeScreenshotsForGP(gp.id, input.reportMonth, input.reportYear);
          const positive = attitudes.filter(a => a.attitudeType === 'positive').length;
          const negative = attitudes.filter(a => a.attitudeType === 'negative').length;
          if (positive > 0 || negative > 0) {
            attitudeData.push({ gpName: gp.name, positive, negative, total: positive - negative });
          }
        }

        // Auto-generate content if fields are empty and autoFill is enabled
        let fmPerformance = input.fmPerformance || null;
        let goalsThisMonth = input.goalsThisMonth || null;
        let teamOverview = input.teamOverview || null;

        if (input.autoFill && stats.length > 0) {
          // Calculate team statistics for auto-generation
          const avgTotal = stats.reduce((sum, gp) => sum + Number(gp.avgTotalScore || 0), 0) / stats.length;
          const avgAppearance = stats.reduce((sum, gp) => sum + Number(gp.avgAppearanceScore || 0), 0) / stats.length;
          const avgGamePerf = stats.reduce((sum, gp) => sum + Number(gp.avgGamePerfScore || 0), 0) / stats.length;
          
          const topPerformers = [...stats]
            .sort((a, b) => Number(b.avgTotalScore || 0) - Number(a.avgTotalScore || 0))
            .slice(0, 3);
          
          const needsImprovement = stats.filter(gp => Number(gp.avgTotalScore || 0) < 18);
          
          // Calculate attendance stats
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
          
          // Identify GPs with most errors
          const gpsWithErrors = gpDetailedData.filter(gp => gp.errorCount > 0)
            .sort((a, b) => b.errorCount - a.errorCount);
          
          // Identify GPs with negative attitude
          const gpsWithNegativeAttitude = gpDetailedData.filter(gp => gp.attitudeNegative > 0)
            .sort((a, b) => b.attitudeNegative - a.attitudeNegative);
          
          // Identify GPs with positive attitude
          const gpsWithPositiveAttitude = gpDetailedData.filter(gp => gp.attitudePositive > 0)
            .sort((a, b) => b.attitudePositive - a.attitudePositive);

          // Build comprehensive context for LLM
          const dataContext = `
Team: ${team.teamName}
Floor Manager: ${team.floorManagerName}
Period: ${monthName} ${input.reportYear}

=== EVALUATION STATISTICS ===
- Total GPs Evaluated: ${stats.length}
- Average Total Score: ${avgTotal.toFixed(1)}/24 (${avgTotal >= 20 ? 'Excellent' : avgTotal >= 18 ? 'Good' : avgTotal >= 16 ? 'Needs Improvement' : 'Critical'})
- Average Appearance Score: ${avgAppearance.toFixed(1)}/12
- Average Game Performance Score: ${avgGamePerf.toFixed(1)}/10

=== TOP PERFORMERS (by evaluation score) ===
${topPerformers.map((gp, i) => {
  const detail = gpDetailedData.find(d => d.name === gp.gpName);
  return `${i + 1}. ${gp.gpName} - ${Number(gp.avgTotalScore || 0).toFixed(1)}/24 (${detail?.evaluationCount || 0} evaluations, ${detail?.errorCount || 0} errors, attitude: +${detail?.attitudePositive || 0}/-${detail?.attitudeNegative || 0})`;
}).join('\n')}

${needsImprovement.length > 0 ? `=== GPs NEEDING IMPROVEMENT (score < 18) ===
${needsImprovement.map(gp => {
  const detail = gpDetailedData.find(d => d.name === gp.gpName);
  return `- ${gp.gpName}: ${Number(gp.avgTotalScore || 0).toFixed(1)}/24 (Appearance: ${detail?.appearanceScore}/12, Game Perf: ${detail?.gamePerformanceScore}/10)`;
}).join('\n')}` : '=== All GPs are performing well (score >= 18) ==='}

=== ERROR ANALYSIS ===
- Total Team Errors: ${gpsWithErrors.reduce((sum, gp) => sum + gp.errorCount, 0)}
${gpsWithErrors.length > 0 ? `GPs with errors:
${gpsWithErrors.slice(0, 5).map(gp => `- ${gp.name}: ${gp.errorCount} errors`).join('\n')}` : 'No errors recorded this month'}

=== ATTITUDE ANALYSIS ===
- Total Positive Feedback: ${attitudeData.reduce((sum, a) => sum + a.positive, 0)}
- Total Negative Feedback: ${attitudeData.reduce((sum, a) => sum + a.negative, 0)}
${gpsWithPositiveAttitude.length > 0 ? `GPs with positive attitude feedback:
${gpsWithPositiveAttitude.slice(0, 3).map(gp => `- ${gp.name}: +${gp.attitudePositive}`).join('\n')}` : ''}
${gpsWithNegativeAttitude.length > 0 ? `GPs with negative attitude feedback:
${gpsWithNegativeAttitude.slice(0, 3).map(gp => `- ${gp.name}: -${gp.attitudeNegative}`).join('\n')}` : ''}

=== ATTENDANCE SUMMARY ===
- Total Mistakes/Errors: ${totalMistakes}
- Extra Shifts Worked: ${totalExtraShifts}
- Late Arrivals: ${totalLate}
- Missed Days: ${totalMissed}
- Sick Leaves: ${totalSick}

=== INDIVIDUAL GP BREAKDOWN ===
${gpDetailedData.map(gp => 
  `${gp.name}: Score ${gp.avgScore}/24, Errors: ${gp.errorCount}, Attitude: +${gp.attitudePositive}/-${gp.attitudeNegative}, Late: ${gp.lateArrivals}`
).join('\n')}
`;

          // Auto-generate Team Overview if empty
          if (!teamOverview) {
            try {
              const teamOverviewResponse = await invokeLLM({
                messages: [
                  {
                    role: "system",
                    content: `You are an experienced Floor Manager writing a comprehensive Team Overview for a monthly casino operations report.

Guidelines for writing an optimal Team Overview:
1. Start with overall team performance assessment:
   - Team average score and what it indicates (Excellent/Good/Needs Work)
   - Compare appearance vs game performance scores

2. Highlight achievements:
   - Name top 2-3 performers with their scores
   - Mention any GPs with positive attitude feedback
   - Note extra shifts or exceptional dedication

3. Address concerns honestly:
   - Name GPs with scores below 18 and their specific issues
   - Mention error counts for GPs with multiple errors
   - Note any negative attitude feedback recipients
   - Address attendance issues (late arrivals, missed days)

4. Provide balanced perspective:
   - Acknowledge both strengths and areas for improvement
   - Be factual and data-driven

5. Format: Write 4-5 concise sentences. Do NOT use bullet points.

IMPORTANT: Use specific names and numbers from the data. A good overview is honest, specific, and actionable.`
                  },
                  {
                    role: "user",
                    content: `Based on this comprehensive team performance data, write a detailed Team Overview that accurately reflects the team's performance this month:\n${dataContext}`
                  }
                ]
              });
              const content = teamOverviewResponse.choices[0]?.message?.content;
              teamOverview = typeof content === 'string' ? content : null;
            } catch (e) {
              console.error('[generate] Failed to auto-generate teamOverview:', e);
            }
          }

          // Auto-generate Goals if empty
          if (!goalsThisMonth) {
            try {
              const goalsResponse = await invokeLLM({
                messages: [
                  {
                    role: "system",
                    content: `You are an experienced Floor Manager creating SMART goals for a monthly casino operations report.

Guidelines for writing optimal Team Goals:
1. Analyze the data to identify the TOP 3 priority areas:
   - GPs with low evaluation scores (< 18/24) need improvement plans
   - GPs with high error counts need error reduction targets
   - GPs with negative attitude feedback need behavior coaching
   - Attendance issues (late arrivals, missed days) need addressing

2. For each goal, be SPECIFIC:
   - Name the GPs who need improvement (if applicable)
   - Set measurable targets (e.g., "reduce errors by 50%", "improve score to 19+")
   - Focus on actionable improvements

3. Balance the goals:
   - 1 goal for maintaining/rewarding top performers
   - 1-2 goals for addressing weaknesses (errors, scores, attitude)
   - Consider team-wide improvements if no individual issues

4. Format: Write 3-4 concise sentences. Do NOT use bullet points.

IMPORTANT: Be specific with names and numbers from the data. Generic goals are not acceptable.`
                  },
                  {
                    role: "user",
                    content: `Based on this comprehensive team performance data, create specific, actionable Team Goals for next month:\n${dataContext}`
                  }
                ]
              });
              const content = goalsResponse.choices[0]?.message?.content;
              goalsThisMonth = typeof content === 'string' ? content : null;
            } catch (e) {
              console.error('[generate] Failed to auto-generate goalsThisMonth:', e);
            }
          }
        }

        const report = await db.createReport({
          teamId: input.teamId,
          reportMonth: input.reportMonth,
          reportYear: input.reportYear,
          fmPerformance: fmPerformance,
          goalsThisMonth: goalsThisMonth,
          teamOverview: teamOverview,
          additionalComments: input.additionalComments || null,
          reportData: { stats, attendance },
          status: "generated",
          generatedById: ctx.user.id,
        });

        await notifyOwner({
          title: "New Report Generated",
          content: `A new Team Monthly Overview report has been generated for ${team.teamName} - ${MONTH_NAMES[input.reportMonth - 1]} ${input.reportYear}`,
        });

        // Send email notification to user about the generated report
        let emailSent = false;
        if (ctx.user.email) {
          try {
            const monthName = MONTH_NAMES[input.reportMonth - 1];
            emailSent = await sendEmail({
              to: ctx.user.email,
              subject: `📊 Team Monthly Overview Generated: ${team.teamName} - ${monthName} ${input.reportYear}`,
              body: `Hello ${ctx.user.name || 'User'},\n\nYour Team Monthly Overview report has been generated successfully.\n\n📋 Report Details:\n• Team: ${team.teamName}\n• Period: ${monthName} ${input.reportYear}\n• Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}\n\n📊 Key Stats:\n• Total GPs: ${stats.length}\n• Average Score: ${stats.length > 0 ? (stats.reduce((sum, gp) => sum + Number(gp.avgTotalScore || 0), 0) / stats.length).toFixed(1) : 'N/A'}\n• Total Evaluations: ${stats.reduce((sum, gp) => sum + gp.evaluationCount, 0)}\n\nYou can view the full report and export it to Excel or Google Sheets from the GP Report Generator dashboard.\n\n---\nThis is an automated message from GP Report Generator.`,
            });
            console.log(`[report.generate] Email sent to ${ctx.user.email}: ${emailSent}`);
          } catch (emailError) {
            console.warn(`[report.generate] Failed to send email:`, emailError);
          }
        }

        return { ...report, emailSent, emailAddress: ctx.user.email || null };
      }),

    exportToExcel: protectedProcedure
      .input(z.object({
        reportId: z.number().positive(),
      }))
      .mutation(async ({ ctx, input }) => {
        console.log(`\n\n========== [exportToExcel] START ==========`);
        console.log(`[exportToExcel] Called with input.reportId=${input.reportId}`);
        const reportWithTeam = await db.getReportWithTeam(input.reportId);
        console.log(`[exportToExcel] getReportWithTeam returned:`, reportWithTeam ? { reportId: reportWithTeam.report.id, teamId: reportWithTeam.report.teamId } : null);
        if (!reportWithTeam) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });
        
        // User-based data isolation: non-admin can only export their own reports
        if (ctx.user.role !== 'admin' && reportWithTeam.report.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only export your own reports' });
        }

        const { report, team } = reportWithTeam;
        const teamName = team?.teamName || "Unknown Team";
        const fmName = team?.floorManagerName || "Unknown FM";
        const monthName = MONTH_NAMES[report.reportMonth - 1];

        // ALWAYS fetch fresh data from database for the most up-to-date information
        const freshAttendance = await db.getAttendanceByTeamMonth(
          report.teamId, 
          report.reportMonth, 
          report.reportYear
        );

        // Get attitude entries for all GPs in the team for this month
        const attitudeByGp: Record<number, { positive: number; negative: number; entries: Array<{ date: string; type: string; comment: string; score: number }> }> = {};
        for (const item of freshAttendance) {
          if (item.gamePresenter?.id) {
            const gpAttitudeEntries = await db.getAttitudeScreenshotsForGP(
              item.gamePresenter.id,
              report.reportMonth,
              report.reportYear
            );
            
            const positive = gpAttitudeEntries.filter(e => (e.attitudeScore || 0) > 0).length;
            const negative = gpAttitudeEntries.filter(e => (e.attitudeScore || 0) < 0).length;
            const entries = gpAttitudeEntries.map(e => ({
              date: e.evaluationDate ? new Date(e.evaluationDate).toLocaleDateString() : new Date(e.createdAt).toLocaleDateString(),
              type: (e.attitudeScore || 0) > 0 ? 'POSITIVE' : 'NEGATIVE',
              comment: e.comment || '',
              score: e.attitudeScore || 0
            }));
            
            attitudeByGp[item.gamePresenter.id] = { positive, negative, entries };
          }
        }
        console.log(`[exportToExcel] Loaded attitude data for ${Object.keys(attitudeByGp).length} GPs`);

        // Get detailed GP evaluations for Data sheet
        console.log(`[exportToExcel] reportId=${input.reportId}, teamId=${report.teamId}, year=${report.reportYear}, month=${report.reportMonth}`);
        const gpEvaluationsData = await db.getGPEvaluationsForDataSheet(
          report.teamId, 
          report.reportYear, 
          report.reportMonth
        );

        // Get previous month data for comparison chart
        const prevMonth = report.reportMonth === 1 ? 12 : report.reportMonth - 1;
        const prevYear = report.reportMonth === 1 ? report.reportYear - 1 : report.reportYear;
        const prevMonthEvaluations = await db.getGPEvaluationsForDataSheet(
          report.teamId,
          prevYear,
          prevMonth
        );
        console.log(`[exportToExcel] Previous month (${prevMonth}/${prevYear}) evaluations: ${prevMonthEvaluations.length} GPs`);

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

        // ===== Sheet 2: Chart Data (for native Excel/Sheets chart) =====
        const chartSheet = workbook.addWorksheet("Chart");
        
        // Set column widths for Chart sheet
        chartSheet.columns = [
          { width: 25 }, { width: 15 }, { width: 18 }, { width: 12 }
        ];
        
        // Title
        chartSheet.mergeCells("A1:D1");
        chartSheet.getCell("A1").value = `${teamName} Performance - ${monthName} ${report.reportYear}`;
        chartSheet.getCell("A1").font = { bold: true, size: 16 };
        chartSheet.getCell("A1").alignment = { horizontal: "center" };
        
        // Headers
        chartSheet.getCell("A3").value = "Game Presenter";
        chartSheet.getCell("B3").value = "Appearance";
        chartSheet.getCell("C3").value = "Game Performance";
        chartSheet.getCell("D3").value = "Total Score";
        
        ["A3", "B3", "C3", "D3"].forEach(cell => {
          chartSheet.getCell(cell).font = { bold: true };
          chartSheet.getCell(cell).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
          chartSheet.getCell(cell).font = { bold: true, color: { argb: "FFFFFFFF" } };
          chartSheet.getCell(cell).alignment = { horizontal: "center" };
        });
        
        // Data rows
        let chartDataRow = 4;
        for (const gp of gpEvaluationsData) {
          if (gp.evaluations.length > 0) {
            const avgAppearance = gp.evaluations.reduce((sum, e) => sum + (e.appearanceScore || 0), 0) / gp.evaluations.length;
            const avgGamePerf = gp.evaluations.reduce((sum, e) => sum + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
            const total = avgAppearance + avgGamePerf;
            
            chartSheet.getCell(`A${chartDataRow}`).value = gp.gpName;
            chartSheet.getCell(`B${chartDataRow}`).value = Number(avgAppearance.toFixed(1));
            chartSheet.getCell(`C${chartDataRow}`).value = Number(avgGamePerf.toFixed(1));
            chartSheet.getCell(`D${chartDataRow}`).value = Number(total.toFixed(1));
            
            // Color code total score
            if (total >= 18) {
              chartSheet.getCell(`D${chartDataRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
            } else if (total >= 15) {
              chartSheet.getCell(`D${chartDataRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
            } else {
              chartSheet.getCell(`D${chartDataRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6B6B" } };
            }
            chartSheet.getCell(`D${chartDataRow}`).font = { bold: true };
            
            chartDataRow++;
          }
        }
        
        // Add instructions for creating chart
        const instructionRow = chartDataRow + 2;
        chartSheet.mergeCells(`A${instructionRow}:D${instructionRow}`);
        chartSheet.getCell(`A${instructionRow}`).value = "📊 To create a chart: Select data A3:D" + (chartDataRow - 1) + " → Insert → Chart → Bar Chart";
        chartSheet.getCell(`A${instructionRow}`).font = { italic: true, color: { argb: "FF666666" } };
        
        // Add summary statistics
        const summaryRow = instructionRow + 2;
        chartSheet.getCell(`A${summaryRow}`).value = "Summary Statistics";
        chartSheet.getCell(`A${summaryRow}`).font = { bold: true };
        
        chartSheet.getCell(`A${summaryRow + 1}`).value = "Average Appearance:";
        chartSheet.getCell(`B${summaryRow + 1}`).value = { formula: `AVERAGE(B4:B${chartDataRow - 1})` };
        
        chartSheet.getCell(`A${summaryRow + 2}`).value = "Average Game Perf:";
        chartSheet.getCell(`B${summaryRow + 2}`).value = { formula: `AVERAGE(C4:C${chartDataRow - 1})` };
        
        chartSheet.getCell(`A${summaryRow + 3}`).value = "Average Total:";
        chartSheet.getCell(`B${summaryRow + 3}`).value = { formula: `AVERAGE(D4:D${chartDataRow - 1})` };
        chartSheet.getCell(`B${summaryRow + 3}`).font = { bold: true };
        
        chartSheet.getCell(`A${summaryRow + 4}`).value = "Top Score:";
        chartSheet.getCell(`B${summaryRow + 4}`).value = { formula: `MAX(D4:D${chartDataRow - 1})` };
        
        chartSheet.getCell(`A${summaryRow + 5}`).value = "Lowest Score:";
        chartSheet.getCell(`B${summaryRow + 5}`).value = { formula: `MIN(D4:D${chartDataRow - 1})` };

        // ===== Sheet 3: Monthly Report (matching template format) =====
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
        // Use freshAttendance from database for the most current data
        const attendanceData = freshAttendance;
        let gpRow = 6;
        
        for (const item of attendanceData) {
          if (gpRow > 34) break; // Max 15 GPs (rows 6-35)
          
          mainSheet.mergeCells(`N${gpRow}:P${gpRow + 1}`);
          mainSheet.getCell(`N${gpRow}`).value = item.gamePresenter?.name || "";
          mainSheet.getCell(`N${gpRow}`).alignment = { vertical: "middle" };

          mainSheet.mergeCells(`Q${gpRow}:R${gpRow + 1}`);
          // Use monthlyStats.mistakes if available, fallback to attendance.mistakes
          mainSheet.getCell(`Q${gpRow}`).value = item.monthlyStats?.mistakes ?? item.attendance?.mistakes ?? 0;
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
          // Combine attitude entries with remarks
          const gpId = item.gamePresenter?.id;
          const gpAttitude = gpId ? attitudeByGp[gpId] : null;
          
          let attitudeText = "";
          if (gpAttitude && gpAttitude.entries.length > 0) {
            // Format: "Attitude: +X/-Y" followed by entry comments
            attitudeText = `Attitude: +${gpAttitude.positive}/-${gpAttitude.negative}`;
            // Add first 2 comments if available
            const comments = gpAttitude.entries.slice(0, 2).map(e => 
              `${e.type === 'POSITIVE' ? '+' : '-'} ${e.comment.substring(0, 50)}${e.comment.length > 50 ? '...' : ''}`
            );
            if (comments.length > 0) {
              attitudeText += " | " + comments.join("; ");
            }
          } else if (item.monthlyStats?.attitude) {
            attitudeText = `Attitude: ${item.monthlyStats.attitude}/5`;
          }
          
          const remarksText = item.attendance?.remarks || item.monthlyStats?.notes || "";
          mainSheet.getCell(`AA${gpRow}`).value = [attitudeText, remarksText].filter(Boolean).join(" | ");
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

        // ===== PERFORMANCE ANALYSIS SECTION =====
        // Calculate team performance statistics from evaluations
        let totalEvaluations = 0;
        let totalAppearance = 0;
        let totalGamePerf = 0;
        let topPerformers: { name: string; score: number }[] = [];
        let needsImprovement: { name: string; score: number }[] = [];

        for (const gp of gpEvaluationsData) {
          if (gp.evaluations.length > 0) {
            const avgAppearance = gp.evaluations.reduce((sum, e) => sum + (e.appearanceScore || 0), 0) / gp.evaluations.length;
            const avgGamePerf = gp.evaluations.reduce((sum, e) => sum + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
            const avgTotal = avgAppearance + avgGamePerf;
            
            totalEvaluations += gp.evaluations.length;
            totalAppearance += avgAppearance * gp.evaluations.length;
            totalGamePerf += avgGamePerf * gp.evaluations.length;
            
            topPerformers.push({ name: gp.gpName, score: avgTotal });
          }
        }

        // Sort and get top 3 and bottom 3
        topPerformers.sort((a, b) => b.score - a.score);
        const top3 = topPerformers.slice(0, 3);
        const bottom3 = topPerformers.slice(-3).reverse();
        
        const teamAvgAppearance = totalEvaluations > 0 ? (totalAppearance / totalEvaluations).toFixed(1) : 'N/A';
        const teamAvgGamePerf = totalEvaluations > 0 ? (totalGamePerf / totalEvaluations).toFixed(1) : 'N/A';

        // Add Performance Analysis section to Monthly sheet (rows 55-65)
        mainSheet.mergeCells("A55:H56");
        mainSheet.getCell("A55").value = "Performance Analysis (Auto-generated)";
        mainSheet.getCell("A55").font = { bold: true };
        mainSheet.getCell("A55").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
        mainSheet.getCell("A55").font = { bold: true, color: { argb: "FFFFFFFF" } };

        // Team Statistics
        mainSheet.mergeCells("A57:D57");
        mainSheet.getCell("A57").value = "Team Statistics";
        mainSheet.getCell("A57").font = { bold: true };

        mainSheet.getCell("A58").value = "Total Evaluations:";
        mainSheet.getCell("B58").value = totalEvaluations;
        mainSheet.getCell("A59").value = "Avg Appearance:";
        mainSheet.getCell("B59").value = teamAvgAppearance;
        mainSheet.getCell("A60").value = "Avg Game Performance:";
        mainSheet.getCell("B60").value = teamAvgGamePerf;

        // Top Performers
        mainSheet.mergeCells("E57:H57");
        mainSheet.getCell("E57").value = "Top Performers";
        mainSheet.getCell("E57").font = { bold: true };
        mainSheet.getCell("E57").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };

        for (let i = 0; i < Math.min(3, top3.length); i++) {
          mainSheet.getCell(`E${58 + i}`).value = `${i + 1}. ${top3[i].name}`;
          mainSheet.getCell(`H${58 + i}`).value = top3[i].score.toFixed(1);
        }

        // Needs Improvement
        mainSheet.mergeCells("A62:D62");
        mainSheet.getCell("A62").value = "Needs Improvement";
        mainSheet.getCell("A62").font = { bold: true };
        mainSheet.getCell("A62").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6B6B" } };

        for (let i = 0; i < Math.min(3, bottom3.length); i++) {
          mainSheet.getCell(`A${63 + i}`).value = `${i + 1}. ${bottom3[i].name}`;
          mainSheet.getCell(`D${63 + i}`).value = bottom3[i].score.toFixed(1);
        }

        // ===== PERFORMANCE CHART DATA (rows 67-80) =====
        // Add a data table that can be used to create a chart in Excel
        mainSheet.mergeCells("A67:H68");
        mainSheet.getCell("A67").value = "Monthly Performance Data (for Chart)";
        mainSheet.getCell("A67").font = { bold: true };
        mainSheet.getCell("A67").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
        mainSheet.getCell("A67").font = { bold: true, color: { argb: "FFFFFFFF" } };

        // Chart data headers
        mainSheet.getCell("A69").value = "GP Name";
        mainSheet.getCell("A69").font = { bold: true };
        mainSheet.getCell("B69").value = "Appearance";
        mainSheet.getCell("B69").font = { bold: true };
        mainSheet.getCell("C69").value = "Game Perf";
        mainSheet.getCell("C69").font = { bold: true };
        mainSheet.getCell("D69").value = "Total";
        mainSheet.getCell("D69").font = { bold: true };

        // Add GP performance data for chart
        let chartRow = 70;
        for (const gp of gpEvaluationsData) {
          if (gp.evaluations.length > 0 && chartRow <= 85) {
            const avgAppearance = gp.evaluations.reduce((sum, e) => sum + (e.appearanceScore || 0), 0) / gp.evaluations.length;
            const avgGamePerf = gp.evaluations.reduce((sum, e) => sum + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
            
            mainSheet.getCell(`A${chartRow}`).value = gp.gpName;
            mainSheet.getCell(`B${chartRow}`).value = Number(avgAppearance.toFixed(1));
            mainSheet.getCell(`C${chartRow}`).value = Number(avgGamePerf.toFixed(1));
            mainSheet.getCell(`D${chartRow}`).value = Number((avgAppearance + avgGamePerf).toFixed(1));
            
            // Add conditional formatting colors
            const total = avgAppearance + avgGamePerf;
            if (total >= 18) {
              mainSheet.getCell(`D${chartRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
            } else if (total >= 15) {
              mainSheet.getCell(`D${chartRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
            } else {
              mainSheet.getCell(`D${chartRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6B6B" } };
            }
            
            chartRow++;
          }
        }

        // Add team average row
        mainSheet.getCell(`A${chartRow}`).value = "TEAM AVERAGE";
        mainSheet.getCell(`A${chartRow}`).font = { bold: true };
        mainSheet.getCell(`B${chartRow}`).value = teamAvgAppearance;
        mainSheet.getCell(`B${chartRow}`).font = { bold: true };
        mainSheet.getCell(`C${chartRow}`).value = teamAvgGamePerf;
        mainSheet.getCell(`C${chartRow}`).font = { bold: true };
        if (typeof teamAvgAppearance === 'string' || typeof teamAvgGamePerf === 'string') {
          mainSheet.getCell(`D${chartRow}`).value = 'N/A';
        } else {
          mainSheet.getCell(`D${chartRow}`).value = (parseFloat(teamAvgAppearance) + parseFloat(teamAvgGamePerf)).toFixed(1);
        }
        mainSheet.getCell(`D${chartRow}`).font = { bold: true };

        // ===== ADD EXCEL CHART =====
        // Create a bar chart for GP performance visualization
        const chartDataEndRow = chartRow - 1; // Last row with GP data (before TEAM AVERAGE)
        const chartDataStartRow = 70;
        
        if (chartDataEndRow >= chartDataStartRow) {
          // Add chart to the worksheet
          // ExcelJS chart support - create a bar chart
          mainSheet.addImage = mainSheet.addImage || (() => {});
          
          // Add a visual chart indicator section
          const chartStartRow = chartRow + 3;
          mainSheet.mergeCells(`A${chartStartRow}:H${chartStartRow + 1}`);
          mainSheet.getCell(`A${chartStartRow}`).value = "📊 GP Performance Chart (Visual Representation)";
          mainSheet.getCell(`A${chartStartRow}`).font = { bold: true, size: 12 };
          mainSheet.getCell(`A${chartStartRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
          mainSheet.getCell(`A${chartStartRow}`).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
          mainSheet.getCell(`A${chartStartRow}`).alignment = { horizontal: "center", vertical: "middle" };

          // Create visual bar chart using cells (since ExcelJS chart support is limited)
          let visualRow = chartStartRow + 3;
          mainSheet.getCell(`A${visualRow}`).value = "GP Name";
          mainSheet.getCell(`A${visualRow}`).font = { bold: true };
          mainSheet.getCell(`B${visualRow}`).value = "Appearance (max 12)";
          mainSheet.getCell(`B${visualRow}`).font = { bold: true };
          mainSheet.getCell(`E${visualRow}`).value = "Game Perf (max 10)";
          mainSheet.getCell(`E${visualRow}`).font = { bold: true };
          mainSheet.getCell(`H${visualRow}`).value = "Total";
          mainSheet.getCell(`H${visualRow}`).font = { bold: true };
          visualRow++;

          // Add visual bars for each GP
          for (const gp of gpEvaluationsData) {
            if (gp.evaluations.length > 0 && visualRow <= chartStartRow + 20) {
              const avgAppearance = gp.evaluations.reduce((sum, e) => sum + (e.appearanceScore || 0), 0) / gp.evaluations.length;
              const avgGamePerf = gp.evaluations.reduce((sum, e) => sum + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
              const total = avgAppearance + avgGamePerf;
              
              mainSheet.getCell(`A${visualRow}`).value = gp.gpName;
              
              // Appearance bar (scale to 3 cells, max 12)
              const appBarWidth = Math.round((avgAppearance / 12) * 3);
              for (let i = 0; i < 3; i++) {
                const col = String.fromCharCode(66 + i); // B, C, D
                if (i < appBarWidth) {
                  mainSheet.getCell(`${col}${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B9BD5" } };
                }
                mainSheet.getCell(`${col}${visualRow}`).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
              }
              mainSheet.getCell(`D${visualRow}`).value = avgAppearance.toFixed(1);
              
              // Game Performance bar (scale to 3 cells, max 10)
              const gpBarWidth = Math.round((avgGamePerf / 10) * 3);
              for (let i = 0; i < 3; i++) {
                const col = String.fromCharCode(69 + i); // E, F, G
                if (i < gpBarWidth) {
                  mainSheet.getCell(`${col}${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF70AD47" } };
                }
                mainSheet.getCell(`${col}${visualRow}`).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
              }
              mainSheet.getCell(`G${visualRow}`).value = avgGamePerf.toFixed(1);
              
              // Total with color coding
              mainSheet.getCell(`H${visualRow}`).value = total.toFixed(1);
              if (total >= 18) {
                mainSheet.getCell(`H${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
              } else if (total >= 15) {
                mainSheet.getCell(`H${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
              } else {
                mainSheet.getCell(`H${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6B6B" } };
              }
              mainSheet.getCell(`H${visualRow}`).font = { bold: true };
              
              visualRow++;
            }
          }

          // Add legend
          visualRow += 2;
          mainSheet.getCell(`A${visualRow}`).value = "Legend:";
          mainSheet.getCell(`A${visualRow}`).font = { bold: true };
          mainSheet.getCell(`B${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B9BD5" } };
          mainSheet.getCell(`C${visualRow}`).value = "Appearance";
          mainSheet.getCell(`D${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF70AD47" } };
          mainSheet.getCell(`E${visualRow}`).value = "Game Performance";
          
          visualRow++;
          mainSheet.getCell(`A${visualRow}`).value = "Score colors:";
          mainSheet.getCell(`B${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
          mainSheet.getCell(`C${visualRow}`).value = "≥18 (Excellent)";
          mainSheet.getCell(`D${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
          mainSheet.getCell(`E${visualRow}`).value = "≥15 (Good)";
          mainSheet.getCell(`F${visualRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6B6B" } };
          mainSheet.getCell(`G${visualRow}`).value = "<15 (Needs Improvement)";
        }

        // ===== GENERATE CHART DATA FOR EXCEL =====
        // Prepare chart data
        const chartLabels: string[] = [];
        const appearanceScores: number[] = [];
        const gamePerformanceScores: number[] = [];
        const totalScores: number[] = [];

        for (const gp of gpEvaluationsData) {
          if (gp.evaluations.length > 0) {
            const avgAppearance = gp.evaluations.reduce((sum, e) => sum + (e.appearanceScore || 0), 0) / gp.evaluations.length;
            const avgGamePerf = gp.evaluations.reduce((sum, e) => sum + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
            
            const gpName = gp.gpName; // Full name (first + last)
            chartLabels.push(gpName);
            appearanceScores.push(Number(avgAppearance.toFixed(1)));
            gamePerformanceScores.push(Number(avgGamePerf.toFixed(1)));
            totalScores.push(Number((avgAppearance + avgGamePerf).toFixed(1)));
          }
        }

        console.log("[exportToExcel] Chart labels:", chartLabels.length, chartLabels);

        // ===== GENERATE CHART IMAGE AND ADD TO MONTH SHEET =====
        if (chartLabels.length > 0) {
          // Generate chart image using QuickChart API
          const chartTitle = `${teamName} Performance - ${monthName} ${report.reportYear}`;
          const chartImageBuffer = await generateChartImage(
            chartLabels,
            appearanceScores,
            gamePerformanceScores,
            totalScores,
            chartTitle
          );

          if (chartImageBuffer) {
            // Add chart image to the main month sheet below attendance table
            const imageId = workbook.addImage({
              buffer: chartImageBuffer as any,
              extension: 'png',
            });

            // Position the chart image below attendance table (row 50)
            // Column N (13, 0-indexed) to align with attendance section
            mainSheet.addImage(imageId, {
              tl: { col: 13, row: 40 },
              ext: { width: 700, height: 350 }
            });

            console.log('[exportToExcel] Chart image added to month sheet below attendance');
          } else {
            // Fallback: Add text note if chart generation fails
            mainSheet.mergeCells("N42:AA45");
            mainSheet.getCell("N42").value = 
              "Chart could not be generated. Please check the Data sheet for performance data.";
            mainSheet.getCell("N42").alignment = { wrapText: true, vertical: "top" };
            mainSheet.getCell("N42").font = { italic: true, color: { argb: "FF666666" } };
          }

          // ===== GENERATE COMPARISON CHART WITH PREVIOUS MONTH =====
          // Build previous month scores map
          const prevMonthScoresMap = new Map<string, number>();
          for (const gp of prevMonthEvaluations) {
            if (gp.evaluations.length > 0) {
              const avgAppearance = gp.evaluations.reduce((sum, e) => sum + (e.appearanceScore || 0), 0) / gp.evaluations.length;
              const avgGamePerf = gp.evaluations.reduce((sum, e) => sum + (e.gamePerformanceScore || 0), 0) / gp.evaluations.length;
              const gpName = gp.gpName; // Full name (first + last)
              prevMonthScoresMap.set(gpName, Number((avgAppearance + avgGamePerf).toFixed(1)));
            }
          }

          // Only generate comparison if we have previous month data
          if (prevMonthScoresMap.size > 0) {
            // Get scores for GPs that exist in both months
            const comparisonLabels: string[] = [];
            const currentMonthScores: number[] = [];
            const previousMonthScores: number[] = [];

            for (let i = 0; i < chartLabels.length; i++) {
              const gpName = chartLabels[i];
              const prevScore = prevMonthScoresMap.get(gpName);
              if (prevScore !== undefined) {
                comparisonLabels.push(gpName);
                currentMonthScores.push(totalScores[i]);
                previousMonthScores.push(prevScore);
              }
            }

            if (comparisonLabels.length > 0) {
              const prevMonthName = MONTH_NAMES[prevMonth - 1];
              const comparisonTitle = `Performance Comparison: ${monthName} vs ${prevMonthName}`;
              
              const comparisonChartBuffer = await generateComparisonChart(
                comparisonLabels,
                currentMonthScores,
                previousMonthScores,
                monthName,
                prevMonthName,
                comparisonTitle
              );

              if (comparisonChartBuffer) {
                const comparisonImageId = workbook.addImage({
                  buffer: comparisonChartBuffer as any,
                  extension: 'png',
                });

                // Position comparison chart below the main chart (row 62)
                mainSheet.addImage(comparisonImageId, {
                  tl: { col: 13, row: 62 },
                  ext: { width: 700, height: 350 }
                });

                console.log('[exportToExcel] Comparison chart added to month sheet');
              }
            } else {
              console.log('[exportToExcel] No matching GPs between months for comparison chart');
            }
          } else {
            console.log('[exportToExcel] No previous month data available for comparison');
          }
        }

        // ===== Sheet 4: Attitude Entries (detailed attitude data) =====
        const hasAttitudeData = Object.values(attitudeByGp).some(a => a.entries.length > 0);
        if (hasAttitudeData) {
          const attitudeSheet = workbook.addWorksheet("Attitude Entries");
          
          // Set column widths
          attitudeSheet.columns = [
            { width: 25 }, // GP Name
            { width: 18 }, // Date
            { width: 12 }, // Type
            { width: 60 }, // Comment
            { width: 8 },  // Score
          ];
          
          // Header row
          attitudeSheet.getRow(1).values = ["GP Name", "Date", "Type", "Comment", "Score"];
          attitudeSheet.getRow(1).font = { bold: true };
          attitudeSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
          attitudeSheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
          
          // Data rows
          let attRow = 2;
          for (const item of freshAttendance) {
            const gpId = item.gamePresenter?.id;
            const gpName = item.gamePresenter?.name || "Unknown";
            const gpAttitude = gpId ? attitudeByGp[gpId] : null;
            
            if (gpAttitude && gpAttitude.entries.length > 0) {
              for (const entry of gpAttitude.entries) {
                attitudeSheet.getRow(attRow).values = [
                  gpName,
                  entry.date,
                  entry.type,
                  entry.comment,
                  entry.score
                ];
                
                // Color code type column
                const typeCell = attitudeSheet.getCell(`C${attRow}`);
                if (entry.type === 'POSITIVE') {
                  typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4EDDA" } };
                  typeCell.font = { color: { argb: "FF155724" } };
                } else {
                  typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8D7DA" } };
                  typeCell.font = { color: { argb: "FF721C24" } };
                }
                
                // Color code score column
                const scoreCell = attitudeSheet.getCell(`E${attRow}`);
                if (entry.score > 0) {
                  scoreCell.font = { color: { argb: "FF155724" }, bold: true };
                } else {
                  scoreCell.font = { color: { argb: "FF721C24" }, bold: true };
                }
                
                attRow++;
              }
            }
          }
          
          // Add summary row
          attRow++;
          const totalPositive = Object.values(attitudeByGp).reduce((sum, a) => sum + a.positive, 0);
          const totalNegative = Object.values(attitudeByGp).reduce((sum, a) => sum + a.negative, 0);
          attitudeSheet.getRow(attRow).values = ["TOTAL", "", `+${totalPositive} / -${totalNegative}`, "", ""];
          attitudeSheet.getRow(attRow).font = { bold: true };
          attitudeSheet.getRow(attRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
          
          console.log(`[exportToExcel] Added Attitude Entries sheet with ${attRow - 2} entries`);
        }

        // Generate main report buffer
        const buffer = await workbook.xlsx.writeBuffer();
        
        // Upload both files to S3
        const fileKey = `reports/${report.id}/${nanoid()}-TeamOverview_${teamName.replace(/\s+/g, '_')}_${monthName}${report.reportYear}.xlsx`;
        const { url: excelUrl } = await storagePut(fileKey, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        // Chart is now embedded as image in the main Excel file
        // No separate chart file needed

        await db.updateReport(report.id, {
          excelFileUrl: excelUrl,
          excelFileKey: fileKey,
          status: "finalized",
        });

        // Send email with report to user if they have an email
        let emailSent = false;
        if (ctx.user.email) {
          emailSent = await sendReportEmail({
            userEmail: ctx.user.email,
            userName: ctx.user.name || 'Floor Manager',
            teamName,
            monthName,
            year: report.reportYear,
            excelUrl,
          });
          console.log(`[exportToExcel] Email sent to ${ctx.user.email}: ${emailSent}`);
        } else {
          console.log(`[exportToExcel] User has no email configured, skipping email notification`);
        }

        return {
          success: true,
          excelUrl,
          emailSent,
          emailAddress: ctx.user.email || null,
        };
      }),

    exportToGoogleSheets: protectedProcedure
      .input(z.object({
        reportId: z.number().positive(),
      }))
      .mutation(async ({ ctx, input }) => {
        console.log(`\n\n========== [exportToGoogleSheets] START ==========`);
        
        // Check if Google Drive config exists
        const fsCheck = await import('fs/promises');
        try {
          await fsCheck.access('/home/ubuntu/.gdrive-rclone.ini');
        } catch {
          throw new Error("Google Drive is not configured. Please set up rclone with Google Drive credentials first. Contact your administrator.");
        }
        
        const reportWithTeam = await db.getReportWithTeam(input.reportId);
        if (!reportWithTeam) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found' });
        
        // User-based data isolation: non-admin can only export their own reports
        if (ctx.user.role !== 'admin' && reportWithTeam.report.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only export your own reports' });
        }

        const { report, team } = reportWithTeam;
        const teamName = team?.teamName || "Unknown Team";
        const monthNames = ["January", "February", "March", "April", "May", "June", 
                          "July", "August", "September", "October", "November", "December"];
        const monthName = monthNames[report.reportMonth - 1];

        // Get GP evaluations data
        const gpEvaluationsData = await db.getGPEvaluationsForDataSheet(
          report.teamId, 
          report.reportYear, 
          report.reportMonth
        );

        // Get previous month data for comparison
        const prevMonth = report.reportMonth === 1 ? 12 : report.reportMonth - 1;
        const prevYear = report.reportMonth === 1 ? report.reportYear - 1 : report.reportYear;
        const prevMonthEvaluations = await db.getGPEvaluationsForDataSheet(
          report.teamId,
          prevYear,
          prevMonth
        );

        // Get attendance data
        const attendanceData = await db.getMonthlyGpStatsByTeam(report.teamId, report.reportYear, report.reportMonth);

        // Build previous month lookup
        const prevMonthLookup: Record<string, number> = {};
        for (const gpData of prevMonthEvaluations) {
          const evals = gpData.evaluations;
          if (evals.length > 0) {
            const avgTotal = evals.reduce((sum, e) => 
              sum + (e.gamePerformanceScore || 0) + (e.appearanceScore || 0), 0) / evals.length;
            prevMonthLookup[gpData.gpName] = Math.round(avgTotal * 10) / 10;
          }
        }

        // Prepare GP data for Python script
        const gpDataForPython = gpEvaluationsData.map(gpData => {
          const evals = gpData.evaluations;
          const avgTotal = evals.length > 0 
            ? evals.reduce((sum, e) => sum + (e.gamePerformanceScore || 0) + (e.appearanceScore || 0), 0) / evals.length 
            : 0;
          const prevTotal = prevMonthLookup[gpData.gpName] || 0;
          
          // Find attendance data for this GP
          const attData = attendanceData.find(a => a.gp?.name === gpData.gpName);
          
          return {
            name: gpData.gpName,
            score: Math.round(avgTotal * 10) / 10,
            prevScore: prevTotal,
            mistakes: attData?.stats?.mistakes || 0,
            extraShifts: 0,
            lateness: 0,
            missedDays: 0,
            sickLeave: 0,
            attitude: attData?.stats?.attitude ? `${attData.stats.attitude}/5` : '',
            remarks: ''
          };
        });

        // Prepare JSON data for Python script
        const pythonData = {
          teamName,
          monthName,
          year: report.reportYear,
          gpData: gpDataForPython,
          fmPerformance: report.fmPerformance || '',
          goalsThisMonth: report.goalsThisMonth || '',
          teamOverview: report.teamOverview || '',
          additionalNotes: ''
        };

        const fs = await import('fs/promises');
        const { spawn } = await import('child_process');
        const { promisify } = await import('util');
        const { exec } = await import('child_process');
        const execAsync = promisify(exec);

        // Generate Excel file with chart using Python script
        const fileName = `${monthName}_${report.reportYear}_${teamName.replace(/\s+/g, '_')}_Report.xlsx`;
        const filePath = `/tmp/${fileName}`;
        
        // Write JSON data to temp file to avoid shell escaping issues
        const jsonFilePath = `/tmp/report_data_${Date.now()}.json`;
        await fs.writeFile(jsonFilePath, JSON.stringify(pythonData, null, 2));
        
        console.log('[exportToGoogleSheets] Calling Python script to generate Excel with chart...');
        console.log('[exportToGoogleSheets] JSON file:', jsonFilePath);
        console.log('[exportToGoogleSheets] Output file:', filePath);
        
        try {
          // Use spawn with explicit PATH to avoid Python version conflicts
          const pythonResult = await new Promise<{stdout: string, stderr: string}>((resolve, reject) => {
            const pythonProcess = spawn('/usr/bin/python3.11', [
              '/home/ubuntu/gp-report-generator/server/generate_excel_chart.py',
              jsonFilePath,
              filePath
            ], {
              // Completely isolated environment to avoid Python version conflicts
              env: {
                PATH: '/usr/bin:/bin:/usr/local/bin',
                HOME: '/home/ubuntu',
                PYTHONPATH: '',
                PYTHONHOME: ''
              },
              cwd: '/home/ubuntu/gp-report-generator'
            });
            
            let stdout = '';
            let stderr = '';
            
            pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
            pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });
            
            pythonProcess.on('close', (code) => {
              if (code === 0) {
                resolve({ stdout, stderr });
              } else {
                reject(new Error(`Python exited with code ${code}: ${stderr}`));
              }
            });
            
            pythonProcess.on('error', (err) => reject(err));
          });
          
          console.log('[exportToGoogleSheets] Python output:', pythonResult.stdout);
          if (pythonResult.stderr) console.log('[exportToGoogleSheets] Python stderr:', pythonResult.stderr);
          
          // Clean up JSON temp file
          await fs.unlink(jsonFilePath).catch(() => {});
        } catch (pythonError) {
          console.error('[exportToGoogleSheets] Python script failed:', pythonError);
          await fs.unlink(jsonFilePath).catch(() => {});
          throw new Error(`Failed to generate Excel with chart: ${pythonError instanceof Error ? pythonError.message : 'Unknown error'}`);
        }

        // Upload to Google Drive
        const gdrivePath = `manus_google_drive:GP_Reports/${teamName}/${report.reportYear}`;
        
        try {
          console.log(`[exportToGoogleSheets] Uploading to Google Sheets: ${gdrivePath}/${fileName}`);
          await execAsync(`rclone copyto "${filePath}" "${gdrivePath}/${fileName}" --drive-import-formats xlsx --config /home/ubuntu/.gdrive-rclone.ini`);
          
          // Wait for Google Drive to process conversion
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Get shareable link
          let googleSheetsUrl = '';
          
          try {
            const { stdout: linkOutput } = await execAsync(
              `rclone link "${gdrivePath}/${fileName}" --config /home/ubuntu/.gdrive-rclone.ini -v`
            );
            googleSheetsUrl = linkOutput.trim();
            console.log(`[exportToGoogleSheets] Got link: ${googleSheetsUrl}`);
          } catch (linkError) {
            console.log('[exportToGoogleSheets] Link failed, trying to find file...');
            try {
              const { stdout: lsOutput } = await execAsync(
                `rclone lsjson "${gdrivePath}" --config /home/ubuntu/.gdrive-rclone.ini`
              );
              const files = JSON.parse(lsOutput);
              const targetFile = files.find((f: any) => f.Name.includes(monthName) && f.Name.includes('Report'));
              if (targetFile && targetFile.ID) {
                googleSheetsUrl = `https://docs.google.com/spreadsheets/d/${targetFile.ID}/edit`;
                console.log(`[exportToGoogleSheets] Found file ID: ${targetFile.ID}`);
              }
            } catch (e) {
              console.error('[exportToGoogleSheets] Failed to find file:', e);
            }
          }

          // Clean up temp file
          await fs.unlink(filePath).catch(() => {});

          // Update report with Google Sheets URL
          await db.updateReport(report.id, {
            excelFileUrl: googleSheetsUrl,
            status: "finalized",
          });

          console.log(`[exportToGoogleSheets] Uploaded to Google Drive: ${googleSheetsUrl}`);

          // Send email with report to user if they have an email
          let emailSent = false;
          if (ctx.user.email) {
            emailSent = await sendReportEmail({
              userEmail: ctx.user.email,
              userName: ctx.user.name || 'Floor Manager',
              teamName,
              monthName,
              year: report.reportYear,
              excelUrl: googleSheetsUrl,
            });
            console.log(`[exportToGoogleSheets] Email sent to ${ctx.user.email}: ${emailSent}`);
          }

          return {
            success: true,
            googleSheetsUrl,
            message: `Report with chart uploaded to Google Drive: ${gdrivePath}/${fileName}`,
            emailSent,
            emailAddress: ctx.user.email || null,
          };
        } catch (error) {
          console.error('[exportToGoogleSheets] Google Drive upload failed:', error);
          await fs.unlink(filePath).catch(() => {});
          throw new Error(`Failed to upload to Google Drive: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      // User-based data isolation: each user sees only their own reports
      if (ctx.user.role !== 'admin') {
        return await db.getReportsWithTeamsByUser(ctx.user.id);
      }
      // Admin sees all
      return await db.getReportsWithTeams();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const report = await db.getReportWithTeam(input.id);
        if (!report) return null;
        
        // User-based data isolation: non-admin can only access their own reports
        if (ctx.user.role !== 'admin' && report.report.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only view your own reports' });
        }
        return report;
      }),

    // Admin: list all reports with team info
    listAll: adminProcedure.query(async () => {
      return await db.getAllReportsWithTeam();
    }),

    // Delete report with ownership check - user-based data isolation
    delete: protectedProcedure
      .input(z.object({ id: z.number().positive() }))
      .mutation(async ({ ctx, input }) => {
        const isAdmin = ctx.user.role === 'admin';
        
        const success = await db.deleteReportWithCheckByUser(
          input.id,
          ctx.user.id,
          isAdmin
        );
        if (!success) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found or access denied' });
        }
        
        return { success: true };
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

        // Parse Excel file to extract GP errors from "Error Count" sheet
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(fileBuffer as any);
        
        const gpErrorCounts: Record<string, number> = {};
        const gpErrorDetails: Record<string, Array<{ date?: Date; description?: string; errorCode?: string; gameType?: string; tableId?: string }>> = {};
        let totalErrorsCount = 0;

        // Helper to extract cell value
        const getCellValue = (cell: any): string | null => {
          if (!cell.value) return null;
          if (typeof cell.value === 'string') return cell.value.trim();
          if (typeof cell.value === 'object' && 'text' in cell.value) return (cell.value as any).text?.trim();
          if (typeof cell.value === 'object' && 'result' in cell.value) {
            const result = (cell.value as any).result;
            return typeof result === 'string' ? result.trim() : String(result);
          }
          return String(cell.value).trim();
        };

        const getNumericValue = (cell: any): number => {
          if (cell.value === null || cell.value === undefined) return 0;
          if (typeof cell.value === 'number') return Math.round(cell.value);
          if (typeof cell.value === 'object' && 'result' in cell.value) {
            const result = (cell.value as any).result;
            return typeof result === 'number' ? Math.round(result) : 0;
          }
          const parsed = parseInt(String(cell.value), 10);
          return isNaN(parsed) ? 0 : parsed;
        };

        const isValidGpName = (name: string | null): boolean => {
          if (!name || name.length === 0 || name.startsWith('=')) return false;
          if (['GP Name', 'Name', 'Total', 'Grand Total'].includes(name)) return false;
          return /^[A-Za-z\u00C0-\u024F\s'-]+$/.test(name) && name.length < 100;
        };

        // First, try to parse detailed errors from "Errors" sheet (individual error records)
        const errorsSheet = workbook.getWorksheet('Errors');
        if (errorsSheet) {
          // Based on actual file structure:
          // Row 2 is the header row with: Nr(A), GP Name(B), GP Alias(C), Date(D), Timestamp(E), Table ID(F), 
          // Shoe ID(G), SystemRound ID(H), Error code(I), Game Type(J), Error description(K), Solution(L), etc.
          let headerRow = 2; // Header is in row 2
          let gpNameCol = 2; // Column B - GP Name
          let dateCol = 4;   // Column D - Date
          let descCol = 11;  // Column K - Error description
          let codeCol = 9;   // Column I - Error code
          let gameTypeCol = 10; // Column J - Game Type
          let tableIdCol = 6;  // Column F - Table ID
          
          // Check first few rows for headers to auto-detect if structure is different
          for (let r = 1; r <= 3; r++) {
            const row = errorsSheet.getRow(r);
            row.eachCell((cell, colNumber) => {
              const val = getCellValue(cell)?.toLowerCase() || '';
              if (val === 'gp name' || (val.includes('gp') && val.includes('name'))) { gpNameCol = colNumber; headerRow = r; }
              else if (val === 'date') { dateCol = colNumber; }
              else if (val === 'error description' || val.includes('error description')) { descCol = colNumber; }
              else if (val === 'error code' || val.includes('error code')) { codeCol = colNumber; }
              else if (val === 'game type' || (val.includes('game') && val.includes('type'))) { gameTypeCol = colNumber; }
              else if (val === 'table id' || val.includes('table id')) { tableIdCol = colNumber; }
            });
          }
          
          console.log(`[Error Parsing] Detected columns - Header row: ${headerRow}, GP Name: ${gpNameCol}, Date: ${dateCol}, Description: ${descCol}, Code: ${codeCol}, Game Type: ${gameTypeCol}, Table ID: ${tableIdCol}`);
          
          // Parse error records starting after header
          errorsSheet.eachRow((row, rowNumber) => {
            if (rowNumber <= headerRow) return;
            
            const gpName = getCellValue(row.getCell(gpNameCol));
            if (!isValidGpName(gpName)) return;
            
            // Extract error details
            const errorDetail: { date?: Date; description?: string; errorCode?: string; gameType?: string; tableId?: string } = {};
            
            const dateCell = row.getCell(dateCol);
            if (dateCell.value instanceof Date) {
              errorDetail.date = dateCell.value;
            } else if (typeof dateCell.value === 'number') {
              // Excel serial date
              errorDetail.date = new Date((dateCell.value - 25569) * 86400 * 1000);
            } else if (typeof dateCell.value === 'string') {
              // Parse string date like '01.01.2026' or '2026-01-01'
              const dateStr = dateCell.value.trim();
              if (dateStr.includes('.')) {
                // DD.MM.YYYY format
                const parts = dateStr.split('.');
                if (parts.length === 3) {
                  const [day, month, year] = parts.map(p => parseInt(p, 10));
                  errorDetail.date = new Date(year, month - 1, day);
                }
              } else if (dateStr.includes('-')) {
                // YYYY-MM-DD format
                errorDetail.date = new Date(dateStr);
              }
            }
            
            errorDetail.description = getCellValue(row.getCell(descCol)) || undefined;
            errorDetail.errorCode = getCellValue(row.getCell(codeCol)) || undefined;
            errorDetail.gameType = getCellValue(row.getCell(gameTypeCol)) || undefined;
            errorDetail.tableId = getCellValue(row.getCell(tableIdCol)) || undefined;
            
            // Add to counts and details
            gpErrorCounts[gpName!] = (gpErrorCounts[gpName!] || 0) + 1;
            if (!gpErrorDetails[gpName!]) gpErrorDetails[gpName!] = [];
            gpErrorDetails[gpName!].push(errorDetail);
            totalErrorsCount++;
          });
        }

        // Also check "Error Count" sheet for summary counts (may have different/additional GPs)
        const errorCountSheet = workbook.getWorksheet('Error Count');
        if (errorCountSheet) {
          errorCountSheet.eachRow((row, rowNumber) => {
            if (rowNumber < 2) return; // Skip header
            
            const gpName = getCellValue(row.getCell(2)); // Column B
            const errorCount = getNumericValue(row.getCell(4)); // Column D
            
            if (!isValidGpName(gpName)) return;
            
            // If we didn't get details from Errors sheet, use count from Error Count sheet
            if (!gpErrorCounts[gpName!] || gpErrorCounts[gpName!] === 0) {
              gpErrorCounts[gpName!] = errorCount;
              totalErrorsCount += errorCount;
            }
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

        // Delete any existing error records for this month/year to prevent duplicates
        await db.deleteGpErrorsByMonthYear(input.month, input.year);
        
        // Update GP mistakes directly from parsed error counts
        const notFoundGPs: string[] = [];
        const updatedGPs: string[] = [];
        const createdErrorRecords: number[] = [];
        
        for (const [gpName, count] of Object.entries(gpErrorCounts)) {
          // Find GP by name and update their mistakes count
          const updated = await db.updateGPMistakesDirectly(gpName, count, input.month, input.year);
          if (updated) {
            updatedGPs.push(gpName);
          } else {
            notFoundGPs.push(gpName);
          }
          
          // Create individual error records with descriptions if available
          const details = gpErrorDetails[gpName] || [];
          if (details.length > 0) {
            // Create individual error records with full details
            for (const detail of details) {
              const errorRecord = await db.createGpError({
                gpName,
                errorFileId: errorFile.id,
                errorDate: detail.date || new Date(input.year, input.month - 1, 15),
                errorDescription: detail.description,
                errorCode: detail.errorCode,
                gameType: detail.gameType,
                tableId: detail.tableId,
              });
              createdErrorRecords.push(errorRecord.id);
            }
          } else if (count > 0) {
            // Fallback: create summary record without details
            const errorRecord = await db.createGpError({
              gpName,
              errorFileId: errorFile.id,
              errorDate: new Date(input.year, input.month - 1, 15),
              errorDescription: `${count} error(s) recorded`,
            });
            createdErrorRecords.push(errorRecord.id);
          }
        }

        return { 
          ...errorFile, 
          parsedErrors: totalErrorsCount, 
          gpErrorCounts,
          gpErrorDetails,
          updatedGPs,
          notFoundGPs,
          createdErrorRecords: createdErrorRecords.length
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      // User-based data isolation: each user sees only their own error files
      if (ctx.user.role !== 'admin') {
        return await db.getErrorFilesByUser(ctx.user.id);
      }
      return await db.getAllErrorFiles();
    }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // User-based data isolation
        if (ctx.user.role !== 'admin') {
          await db.deleteErrorFileByUser(input.id, ctx.user.id);
        } else {
          await db.deleteErrorFile(input.id);
        }
        return { success: true };
      }),
  }),

  // GP Access Token management
  gpAccess: router({
    // Generate a new access token for a GP
    generateToken: protectedProcedure
      .input(z.object({ gpId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Check if GP exists
        const gp = await db.getGamePresenterById(input.gpId);
        if (!gp) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
        }
        
        // User-based data isolation
        if (ctx.user.role !== 'admin' && gp.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only generate tokens for your own Game Presenters' });
        }

        // Deactivate any existing tokens for this GP
        const existingToken = await db.getGpAccessTokenByGpId(input.gpId);
        if (existingToken) {
          await db.deactivateGpAccessToken(existingToken.id);
        }

        // Generate new token
        const token = nanoid(32);
        const accessToken = await db.createGpAccessToken({
          gamePresenterId: input.gpId,
          token,
          createdById: ctx.user.id,
        });

        return { ...accessToken, gpName: gp.name };
      }),

    // Generate tokens for all GPs without active tokens
    generateAllTokens: protectedProcedure
      .input(z.object({ teamId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        // Get all GPs (filtered by user for non-admin)
        let allGps;
        if (ctx.user.role !== 'admin') {
          allGps = await db.getAllGamePresentersByUser(ctx.user.id);
        } else if (input.teamId) {
          allGps = await db.getGamePresentersByTeam(input.teamId);
        } else {
          allGps = await db.getAllGamePresenters();
        }
        
        const generated: { gpId: number; gpName: string; token: string }[] = [];
        const skipped: { gpId: number; gpName: string; reason: string }[] = [];
        
        for (const gp of allGps) {
          // Check if GP already has an active token
          const existingToken = await db.getGpAccessTokenByGpId(gp.id);
          if (existingToken && existingToken.isActive) {
            skipped.push({ gpId: gp.id, gpName: gp.name, reason: 'Already has active token' });
            continue;
          }
          
          // Deactivate old token if exists
          if (existingToken) {
            await db.deactivateGpAccessToken(existingToken.id);
          }
          
          // Generate new token
          const token = nanoid(32);
          await db.createGpAccessToken({
            gamePresenterId: gp.id,
            token,
            createdById: ctx.user.id,
          });
          
          generated.push({ gpId: gp.id, gpName: gp.name, token });
        }
        
        return { generated, skipped, totalGenerated: generated.length, totalSkipped: skipped.length };
      }),

    // Get all GP access tokens (for FM management)
    list: protectedProcedure.query(async ({ ctx }) => {
      // User-based data isolation: each user sees only their own GP tokens
      if (ctx.user.role !== 'admin') {
        return await db.getGpAccessTokensByUser(ctx.user.id);
      }
      // Admin sees all
      return await db.getAllGpAccessTokens();
    }),

    // Deactivate a token
    deactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Get token to check ownership
        const token = await db.getGpAccessTokenById(input.id);
        if (!token) throw new TRPCError({ code: 'NOT_FOUND', message: 'Token not found' });
        
        // User-based data isolation: non-admin can only manage their own GP tokens
        if (ctx.user.role !== 'admin') {
          const gp = await db.getGamePresenterById(token.gamePresenterId);
          if (gp && gp.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only manage your own GP tokens' });
          }
        }
        
        await db.deactivateGpAccessToken(input.id);
        return { success: true };
      }),

    // Public endpoint: Get GP evaluations by token (no auth required)
    getEvaluationsByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        // Find the token
        const accessToken = await db.getGpAccessTokenByToken(input.token);
        if (!accessToken) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid or expired access link' });
        }

        // Update last accessed time
        await db.updateGpAccessTokenLastAccess(accessToken.id);

        // Get GP info
        const gp = await db.getGamePresenterById(accessToken.gamePresenterId);
        if (!gp) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
        }

        // Get all evaluations for this GP
        const evaluations = await db.getGpEvaluationsForPortal(accessToken.gamePresenterId);

        // Get monthly stats for current month
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        
        // Get stats for current and previous month
        const currentMonthStats = await db.getMonthlyGpStats(accessToken.gamePresenterId, currentMonth, currentYear);
        const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
        const prevMonthStats = await db.getMonthlyGpStats(accessToken.gamePresenterId, prevMonth, prevYear);

        // Calculate bonus status based on GGs (Good Games)
        // GGs = Total games / mistakes (first mistake is free)
        const calculateBonusStatus = (stats: typeof currentMonthStats) => {
          if (!stats) return { eligible: false, level: 0, ggs: 0, reason: 'No data available' };
          
          const totalGames = stats.totalGames || 0;
          const mistakes = stats.mistakes || 0;
          
          // First mistake is free: 0 or 1 mistake = all games count
          const effectiveMistakes = mistakes <= 1 ? 1 : mistakes;
          const ggs = Math.floor(totalGames / effectiveMistakes);
          
          // Level 2: minimum 5,000 GGs → €2.50/hour
          // Level 1: minimum 2,500 GGs → €1.50/hour
          if (ggs >= 5000) {
            return { eligible: true, level: 2, ggs, rate: 2.50, reason: 'Level 2 - Excellent performance!' };
          } else if (ggs >= 2500) {
            return { eligible: true, level: 1, ggs, rate: 1.50, reason: 'Level 1 - Good performance!' };
          } else {
            const needed = 2500 - ggs;
            return { eligible: false, level: 0, ggs, rate: 0, reason: `Need ${needed} more GGs for Level 1` };
          }
        };

        // Get monthly history for trend charts (last 6 months)
        const monthlyHistory = await db.getGpMonthlyHistory(accessToken.gamePresenterId, 6);

        // Get detailed error screenshots for current month
        const errorScreenshots = await db.getErrorScreenshotsForGP(accessToken.gamePresenterId, currentMonth, currentYear);
        const attitudeDetails = await db.getAttitudeScreenshotsForGP(accessToken.gamePresenterId, currentMonth, currentYear);
        
        // Also get GP errors from Excel file parsing
        const gpErrors = await db.getGpErrorsForPortal(accessToken.gamePresenterId, currentMonth, currentYear);
        
        // Combine error sources: screenshots and Excel-parsed errors
        const errorDetails = [
          ...errorScreenshots.map(e => ({
            id: e.id,
            source: 'screenshot' as const,
            errorType: e.errorType,
            errorDescription: e.errorDescription,
            errorCategory: e.errorCategory,
            severity: e.severity,
            gameType: e.gameType,
            tableId: e.tableId,
            screenshotUrl: e.screenshotUrl,
            createdAt: e.createdAt,
          })),
          ...gpErrors.map(e => ({
            id: `excel-${e.id}`, // Unique string ID to avoid collision with screenshot IDs
            source: 'excel' as const,
            errorType: e.errorCode || 'excel_error',
            errorDescription: e.errorDescription,
            errorCategory: null,
            severity: 'medium' as const,
            gameType: e.gameType,
            tableId: e.tableId,
            screenshotUrl: null,
            createdAt: e.createdAt,
            errorDate: e.errorDate,
          })),
        ];

        return {
          gpName: gp.name,
          gpId: gp.id,
          evaluations,
          monthlyStats: {
            current: currentMonthStats ? {
              month: currentMonth,
              year: currentYear,
              attitude: currentMonthStats.attitude,
              mistakes: currentMonthStats.mistakes,
              totalGames: currentMonthStats.totalGames,
              bonus: calculateBonusStatus(currentMonthStats),
            } : null,
            previous: prevMonthStats ? {
              month: prevMonth,
              year: prevYear,
              attitude: prevMonthStats.attitude,
              mistakes: prevMonthStats.mistakes,
              totalGames: prevMonthStats.totalGames,
              bonus: calculateBonusStatus(prevMonthStats),
            } : null,
          },
          errorDetails: errorDetails.map(e => ({
            id: e.id,
            source: e.source,
            errorType: e.errorType,
            errorDescription: e.errorDescription,
            errorCategory: e.errorCategory,
            severity: e.severity,
            gameType: e.gameType,
            tableId: e.tableId,
            screenshotUrl: e.screenshotUrl,
            createdAt: e.createdAt,
            errorDate: 'errorDate' in e ? e.errorDate : null,
          })),
          attitudeDetails: attitudeDetails.map(a => ({
            id: a.id,
            attitudeScore: a.attitudeScore,
            attitudeType: a.attitudeType,
            attitudeCategory: a.attitudeCategory,
            comment: a.comment || a.description,
            description: a.description,
            evaluationDate: a.evaluationDate,
            evaluatorName: a.evaluatorName,
            screenshotUrl: a.screenshotUrl,
            createdAt: a.createdAt,
          })),
          monthlyHistory,
        };
      }),
  }),

  // Invitation management (admin only)
  invitation: router({
    // Create new invitation
    create: adminProcedure
      .input(z.object({
        email: z.string().email(),
        teamId: z.number().optional(),
        role: z.enum(['user', 'admin']).default('user'),
        expiresInDays: z.number().min(1).max(30).default(7),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if invitation already exists for this email
        const existing = await db.getInvitationByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'An active invitation already exists for this email' });
        }
        
        const token = nanoid(32);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
        
        const invitation = await db.createInvitation({
          email: input.email.toLowerCase(),
          token,
          teamId: input.teamId || null,
          role: input.role,
          status: 'pending',
          expiresAt,
          createdById: ctx.user.id,
        });
        
        return invitation;
      }),

    // List all invitations
    list: adminProcedure.query(async () => {
      // First expire old invitations
      await db.expireOldInvitations();
      return await db.getAllInvitations();
    }),

    // Get invitation stats
    stats: adminProcedure.query(async () => {
      await db.expireOldInvitations();
      return await db.getInvitationStats();
    }),

    // Revoke invitation
    revoke: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateInvitationStatus(input.id, 'revoked');
        return { success: true };
      }),

    // Delete invitation
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteInvitation(input.id);
        return { success: true };
      }),

    // Resend invitation (create new token)
    resend: adminProcedure
      .input(z.object({
        id: z.number(),
        expiresInDays: z.number().min(1).max(30).default(7),
      }))
      .mutation(async ({ ctx, input }) => {
        const invitations = await db.getAllInvitations();
        const existing = invitations.find(i => i.id === input.id);
        
        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
        }
        
        // Delete old invitation
        await db.deleteInvitation(input.id);
        
        // Create new one with same details
        const token = nanoid(32);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
        
        const newInvitation = await db.createInvitation({
          email: existing.email,
          token,
          teamId: existing.teamId,
          role: existing.role,
          status: 'pending',
          expiresAt,
          createdById: ctx.user.id,
        });
        
        return newInvitation;
      }),

    // Validate invitation token (public)
    validate: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const invitation = await db.getInvitationByToken(input.token);
        
        if (!invitation) {
          return { valid: false, reason: 'Invitation not found' };
        }
        
        if (invitation.status === 'accepted') {
          return { valid: false, reason: 'Invitation already used' };
        }
        
        if (invitation.status === 'revoked') {
          return { valid: false, reason: 'Invitation has been revoked' };
        }
        
        if (invitation.status === 'expired' || invitation.expiresAt < new Date()) {
          return { valid: false, reason: 'Invitation has expired' };
        }
        
        // Get team info
        const team = invitation.teamId ? await db.getFmTeamById(invitation.teamId) : null;
        
        return {
          valid: true,
          invitation: {
            email: invitation.email,
            role: invitation.role,
            teamId: invitation.teamId,
            teamName: team?.teamName || null,
            expiresAt: invitation.expiresAt,
          },
        };
      }),

    // Accept invitation (called after OAuth login)
    accept: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const invitation = await db.getInvitationByToken(input.token);
        
        if (!invitation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
        }
        
        if (invitation.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation is no longer valid' });
        }
        
        if (invitation.expiresAt < new Date()) {
          await db.updateInvitationStatus(invitation.id, 'expired');
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation has expired' });
        }
        
        // Check if email matches (optional - can be removed for flexibility)
        // if (ctx.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
        //   throw new Error('Email does not match invitation');
        // }
        
        // Update user with team and role from invitation
        await db.updateUserFromInvitation(ctx.user.id, invitation.teamId, invitation.role);
        
        // Mark invitation as accepted
        await db.updateInvitationStatus(invitation.id, 'accepted', ctx.user.id);
        
        return { success: true };
      }),

    // Bulk create invitations
    bulkCreate: adminProcedure
      .input(z.object({
        emails: z.array(z.string().email()),
        teamId: z.number().optional(),
        role: z.enum(['user', 'admin']).default('user'),
        expiresInDays: z.number().min(1).max(30).default(7),
      }))
      .mutation(async ({ ctx, input }) => {
        const results: { email: string; success: boolean; error?: string; token?: string }[] = [];
        
        for (const email of input.emails) {
          try {
            // Check if invitation already exists
            const existing = await db.getInvitationByEmail(email);
            if (existing) {
              results.push({ email, success: false, error: 'Invitation already exists' });
              continue;
            }
            
            const token = nanoid(32);
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
            
            await db.createInvitation({
              email: email.toLowerCase(),
              token,
              teamId: input.teamId || null,
              role: input.role,
              status: 'pending',
              expiresAt,
              createdById: ctx.user.id,
            });
            
            results.push({ email, success: true, token });
          } catch (error: any) {
            results.push({ email, success: false, error: error.message });
          }
        }
        
        return {
          total: input.emails.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results,
        };
      }),
  }),

  // Error Screenshots - individual error screenshot uploads with AI analysis
  errorScreenshot: router({
    // Upload and analyze error screenshot
    upload: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
        filename: z.string(),
        mimeType: z.string().optional(),
        gpId: z.number().optional(), // Optional GP ID for direct linking
      }))
      .mutation(async ({ ctx, input }) => {
        // Auto-detect month and year from current date
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        
        // Decode and upload image to S3
        const imageBuffer = Buffer.from(input.imageBase64, 'base64');
        const fileKey = `error-screenshots/${year}/${month}/${Date.now()}-${input.filename}`;
        const contentType = input.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        
        const { url: screenshotUrl } = await storagePut(fileKey, imageBuffer, contentType);
        
        // Use AI to analyze the error screenshot
        const analysisPrompt = `Analyze this error screenshot from a casino game presenter evaluation system.

Extract the following information:
1. GP Name (Game Presenter name) - the person who made the error
2. Error Type - classify as one of: dealing_error, procedure_error, game_rules_error, communication_error, appearance_error, technical_error, other
3. Error Category - more specific sub-category
4. Error Description - detailed description of what went wrong
5. Severity - classify as: low, medium, high, or critical
6. Game Type - if visible (e.g., Blackjack, Roulette, Baccarat)
7. Table ID - if visible
8. Error Date - if visible

Respond in JSON format:
{
  "gpName": "string or null",
  "errorType": "string",
  "errorCategory": "string",
  "errorDescription": "string",
  "severity": "low|medium|high|critical",
  "gameType": "string or null",
  "tableId": "string or null",
  "errorDate": "YYYY-MM-DD or null"
}`;

        const llmResponse = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are an expert at analyzing casino game presenter error reports. Extract information accurately from screenshots.' },
            { 
              role: 'user', 
              content: [
                { type: 'text', text: analysisPrompt },
                { type: 'image_url', image_url: { url: `data:${contentType};base64,${input.imageBase64}` } }
              ]
            }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'error_analysis',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  gpName: { type: ['string', 'null'] },
                  errorType: { type: 'string' },
                  errorCategory: { type: 'string' },
                  errorDescription: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  gameType: { type: ['string', 'null'] },
                  tableId: { type: ['string', 'null'] },
                  errorDate: { type: ['string', 'null'] }
                },
                required: ['gpName', 'errorType', 'errorCategory', 'errorDescription', 'severity', 'gameType', 'tableId', 'errorDate'],
                additionalProperties: false
              }
            }
          }
        });

        let extractedData: any = {};
        try {
          const message = llmResponse?.choices?.[0]?.message;
          const content = message?.content;
          if (content) {
            extractedData = JSON.parse(typeof content === 'string' ? content : '{}');
          }
        } catch (e) {
          console.error('Failed to parse LLM response:', e);
          // Continue with default empty data
        }

        // Use provided GP ID directly if available, otherwise try to match by name
        let gamePresenterId: number | null = input.gpId || null;
        let gpNameToUse: string | null = null;

        // User-scoped GP matching for data isolation
        const userGps = ctx.user.role !== 'admin' 
          ? await db.getAllGamePresentersByUser(ctx.user.id) 
          : await db.getAllGamePresenters();

        if (input.gpId) {
          // Get GP name from ID
          const gp = userGps.find(g => g.id === input.gpId);
          gpNameToUse = gp?.name || null;
        } else if (extractedData.gpName) {
          // Fallback to name matching
          gpNameToUse = extractedData.gpName;
          const matchedGp = userGps.find(gp => 
            gp.name.toLowerCase() === extractedData.gpName.toLowerCase() ||
            gp.name.toLowerCase().includes(extractedData.gpName.toLowerCase()) ||
            extractedData.gpName.toLowerCase().includes(gp.name.toLowerCase())
          );
          if (matchedGp) {
            gamePresenterId = matchedGp.id;
          }
        }

        // Save to database
        const errorScreenshot = await db.createErrorScreenshot({
          gamePresenterId,
          gpName: gpNameToUse || extractedData.gpName || 'Unknown',
          errorDate: extractedData.errorDate ? new Date(extractedData.errorDate) : null,
          errorType: extractedData.errorType || 'other',
          errorCategory: extractedData.errorCategory || '',
          errorDescription: extractedData.errorDescription || '',
          severity: extractedData.severity || 'medium',
          gameType: extractedData.gameType || null,
          tableId: extractedData.tableId || null,
          screenshotUrl,
          screenshotKey: fileKey,
          rawExtractedData: extractedData,
          month,
          year,
          uploadedById: ctx.user.id,
          processedAt: new Date(),
        });

        // Update monthly stats if GP was matched
        if (gamePresenterId) {
          await db.incrementGPMistakes(gamePresenterId, month, year);
        }

        return {
          ...errorScreenshot,
          extractedData,
          gpMatched: !!gamePresenterId,
        };
      }),

    // List error screenshots for a month
    list: protectedProcedure
      .input(z.object({
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2030),
        gamePresenterId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        // User-based data isolation
        if (ctx.user.role !== 'admin') {
          return await db.getErrorScreenshotsByUser(input.month, input.year, ctx.user.id, input.gamePresenterId);
        }
        return await db.getErrorScreenshots(input.month, input.year, input.gamePresenterId);
      }),

    // Delete error screenshot
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // User-based data isolation
        if (ctx.user.role !== 'admin') {
          await db.deleteErrorScreenshotByUser(input.id, ctx.user.id);
        } else {
          await db.deleteErrorScreenshot(input.id);
        }
        return { success: true };
      }),

    // Get error statistics by type
    stats: protectedProcedure
      .input(z.object({
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2030),
      }))
      .query(async ({ ctx, input }) => {
        // User-based data isolation
        if (ctx.user.role !== 'admin') {
          return await db.getErrorScreenshotStatsByUser(input.month, input.year, ctx.user.id);
        }
        return await db.getErrorScreenshotStats(input.month, input.year);
      }),
  }),

  // Attitude Screenshots - attitude evaluation screenshot uploads with AI analysis
  attitudeScreenshot: router({
    // Upload and analyze attitude screenshot
    upload: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
        filename: z.string(),
        mimeType: z.string().optional(),
        gpName: z.string().optional(), // Optional GP name if known
        gpId: z.number().optional(), // Optional GP ID for direct linking
      }))
      .mutation(async ({ ctx, input }) => {
        // Auto-detect month and year from current date
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        
        // Decode and upload image to S3
        const imageBuffer = Buffer.from(input.imageBase64, 'base64');
        const fileKey = `attitude-screenshots/${year}/${month}/${Date.now()}-${input.filename}`;
        const contentType = input.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        
        const { url: screenshotUrl } = await storagePut(fileKey, imageBuffer, contentType);
        
        // Use AI to analyze the attitude screenshot - extract ALL entries
        const analysisPrompt = `Analyze this attitude evaluation screenshot from a casino game presenter evaluation system.

This screenshot shows an attitude entry table with columns: Date, Type (POSITIVE/NEGATIVE), Comment, Score.

IMPORTANT: Extract ALL attitude entries visible in the screenshot, not just one.

For EACH entry in the table, extract:
1. Date - the date and time of the entry (e.g., "3 Jan 2026, 21:00")
2. Type - POSITIVE or NEGATIVE (look for badges/labels)
3. Comment - the full text description
4. Score - the score value (+1 for positive, -1 for negative)

Also look for the GP Name (Game Presenter name) in the page header, title, or breadcrumb.

Respond with a JSON object containing an array of ALL entries found:
{
  "gpName": "string or null - the Game Presenter name from header/title",
  "entries": [
    {
      "date": "3 Jan 2026, 21:00",
      "type": "NEGATIVE",
      "comment": "Was late to the studio...",
      "score": -1
    }
  ],
  "totalEntries": number,
  "totalNegative": number,
  "totalPositive": number
}`;

        const llmResponse = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are an expert at analyzing casino game presenter attitude evaluations. Extract ALL entries from screenshots accurately. Return data as a JSON array.' },
            { 
              role: 'user', 
              content: [
                { type: 'text', text: analysisPrompt },
                { type: 'image_url', image_url: { url: `data:${contentType};base64,${input.imageBase64}` } }
              ]
            }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'attitude_analysis',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  gpName: { type: ['string', 'null'], description: 'Game Presenter name from header/title' },
                  entries: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        date: { type: 'string', description: 'Date and time of entry' },
                        type: { type: 'string', enum: ['POSITIVE', 'NEGATIVE'], description: 'Entry type' },
                        comment: { type: 'string', description: 'Full comment text' },
                        score: { type: 'integer', description: '+1 or -1' }
                      },
                      required: ['date', 'type', 'comment', 'score'],
                      additionalProperties: false
                    }
                  },
                  totalEntries: { type: 'integer' },
                  totalNegative: { type: 'integer' },
                  totalPositive: { type: 'integer' }
                },
                required: ['gpName', 'entries', 'totalEntries', 'totalNegative', 'totalPositive'],
                additionalProperties: false
              }
            }
          }
        });

        let extractedData: any = { gpName: null, entries: [], totalEntries: 0, totalNegative: 0, totalPositive: 0 };
        try {
          const message = llmResponse?.choices?.[0]?.message;
          const content = message?.content;
          if (content) {
            extractedData = JSON.parse(typeof content === 'string' ? content : '{}');
          }
        } catch (e) {
          console.error('Failed to parse LLM response:', e);
          // Continue with default empty data
        }

        // Use provided GP ID directly if available, otherwise try to match by name
        let gamePresenterId: number | null = input.gpId || null;
        let gpNameToUse: string | null = null;

        // User-scoped GP matching for data isolation
        const userGps = ctx.user.role !== 'admin' 
          ? await db.getAllGamePresentersByUser(ctx.user.id) 
          : await db.getAllGamePresenters();

        if (input.gpId) {
          // Get GP name from ID
          const gp = userGps.find(g => g.id === input.gpId);
          gpNameToUse = gp?.name || null;
        } else {
          // Fallback to name matching
          gpNameToUse = input.gpName || extractedData.gpName;
          if (gpNameToUse) {
            const matchedGp = userGps.find(gp => 
              gp.name.toLowerCase() === gpNameToUse!.toLowerCase() ||
              gp.name.toLowerCase().includes(gpNameToUse!.toLowerCase()) ||
              gpNameToUse!.toLowerCase().includes(gp.name.toLowerCase())
            );
            if (matchedGp) {
              gamePresenterId = matchedGp.id;
            }
          }
        }

        // Save each attitude entry to database
        const savedEntries: any[] = [];
        const entries = extractedData.entries || [];
        
        for (const entry of entries) {
          const attitudeScreenshot = await db.createAttitudeScreenshot({
            gamePresenterId,
            evaluationId: null,
            gpName: gpNameToUse || 'Unknown',
            evaluationDate: entry.date ? new Date(entry.date.replace(/^(\d+)\s+(\w+)\s+(\d+),?\s*(\d+:\d+)?$/, (_: string, d: string, m: string, y: string, t: string) => {
              const months: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
              return `${y}-${months[m] || '01'}-${d.padStart(2, '0')}${t ? 'T' + t : ''}`;
            })) : null,
            attitudeType: entry.type?.toLowerCase() === 'positive' ? 'positive' : 'negative',
            attitudeScore: entry.score || (entry.type === 'POSITIVE' ? 1 : -1),
            attitudeCategory: entry.type?.toLowerCase() === 'positive' ? 'positive' : 'negative',
            comment: entry.comment || '',
            description: entry.comment || '',
            evaluatorName: null,
            screenshotUrl,
            screenshotKey: fileKey,
            rawExtractedData: entry,
            month,
            year,
            uploadedById: ctx.user.id,
            processedAt: new Date(),
          });
          savedEntries.push(attitudeScreenshot);
        }

        // Update monthly stats if GP was matched - cumulative +1/-1 system
        if (gamePresenterId && entries.length > 0) {
          // Sum all attitude scores from entries (+1 for positive, -1 for negative)
          const totalScore = entries.reduce((sum: number, e: any) => sum + (e.score || 0), 0);
          // Add cumulative score to GP's monthly attitude
          await db.updateGPAttitude(gamePresenterId, month, year, totalScore);
        }

        return {
          screenshotUrl,
          screenshotKey: fileKey,
          extractedData,
          gpName: gpNameToUse,
          gpMatched: !!gamePresenterId,
          gamePresenterId,
          entriesCount: entries.length,
          savedEntries,
        };
      }),

    // List attitude screenshots for a month
    list: protectedProcedure
      .input(z.object({
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2030),
        gamePresenterId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        // User-based data isolation
        if (ctx.user.role !== 'admin') {
          return await db.getAttitudeScreenshotsByUser(input.month, input.year, ctx.user.id, input.gamePresenterId);
        }
        return await db.getAttitudeScreenshots(input.month, input.year, input.gamePresenterId);
      }),

    // List all attitude screenshots with optional filters
    listAll: protectedProcedure
      .input(z.object({
        month: z.number().min(1).max(12).optional(),
        year: z.number().min(2020).max(2030).optional(),
        gamePresenterId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const month = input?.month;
        const year = input?.year;
        const gpId = input?.gamePresenterId;
        
        // User-based data isolation
        let allEntries;
        let gps;
        if (ctx.user.role !== 'admin') {
          allEntries = await db.getAllAttitudeScreenshotsByUser(ctx.user.id, month, year, gpId);
          gps = await db.getAllGamePresentersByUser(ctx.user.id);
        } else {
          allEntries = await db.getAllAttitudeScreenshots(month, year, gpId);
          gps = await db.getAllGamePresenters();
        }
        
        const gpMap = new Map(gps.map(gp => [gp.id, gp]));
        
        return allEntries.map(entry => ({
          ...entry,
          gamePresenter: entry.gamePresenterId ? gpMap.get(entry.gamePresenterId) || null : null,
        }));
      }),

    // Delete attitude screenshot
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // User-based data isolation
        if (ctx.user.role !== 'admin') {
          await db.deleteAttitudeScreenshotByUser(input.id, ctx.user.id);
        } else {
          await db.deleteAttitudeScreenshot(input.id);
        }
        return { success: true };
      }),
  }),

  // Smart Upload - auto-detect screenshot type (errors vs attitude)
  smartUpload: router({
    // Analyze and upload screenshot with auto-detection
    upload: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
        filename: z.string(),
        mimeType: z.string().optional(),
        gpId: z.number().optional(),
        gpName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const contentType = input.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        
        // First, detect the screenshot type using AI
        const detectionPrompt = `Analyze this screenshot and determine its type.

This is from a casino game presenter evaluation system. Screenshots can be one of two types:

1. **ATTITUDE** - Shows attitude/behavior entries with columns like:
   - Date, Type (POSITIVE/NEGATIVE), Comment, Score
   - Contains behavioral feedback like "late to studio", "wearing headphones", "good attitude"
   - Usually has +1 or -1 scores
   - May have GP name in header

2. **ERROR** - Shows game errors/incidents with:
   - Error codes like SC_BAC, SC_RO, SC_BJ
   - Technical descriptions like "Interface error", "Ball falls out", "Card misread"
   - Game-related incidents (voided rounds, technical issues)
   - System error reports

KEY INDICATORS:
- If you see error codes (SC_XXX), technical terms, "System Void", "Interface error" → ERROR
- If you see behavioral comments, attitude feedback, personal conduct issues → ATTITUDE

Respond with JSON:
{
  "screenshotType": "ATTITUDE" or "ERROR",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation of why this type was detected"
}`;

        const detectionResponse = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are an expert at classifying casino evaluation screenshots. Distinguish between attitude/behavior feedback and game error reports.' },
            { 
              role: 'user', 
              content: [
                { type: 'text', text: detectionPrompt },
                { type: 'image_url', image_url: { url: `data:${contentType};base64,${input.imageBase64}` } }
              ]
            }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'screenshot_detection',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  screenshotType: { type: 'string', enum: ['ATTITUDE', 'ERROR'] },
                  confidence: { type: 'number' },
                  reason: { type: 'string' }
                },
                required: ['screenshotType', 'confidence', 'reason'],
                additionalProperties: false
              }
            }
          }
        });

        let detectedType = 'ATTITUDE';
        let detectionConfidence = 0.5;
        let detectionReason = 'Default';
        
        try {
          const message = detectionResponse?.choices?.[0]?.message;
          const content = message?.content;
          if (content) {
            const detection = JSON.parse(typeof content === 'string' ? content : '{}');
            detectedType = detection.screenshotType || 'ATTITUDE';
            detectionConfidence = detection.confidence || 0.5;
            detectionReason = detection.reason || '';
          }
        } catch (e) {
          console.error('Failed to parse detection response:', e);
        }

        // Now process based on detected type
        if (detectedType === 'ERROR') {
          // Process as error screenshot
          const imageBuffer = Buffer.from(input.imageBase64, 'base64');
          const fileKey = `error-screenshots/${year}/${month}/${Date.now()}-${input.filename}`;
          const { url: screenshotUrl } = await storagePut(fileKey, imageBuffer, contentType);

          const analysisPrompt = `Analyze this error screenshot from a casino game presenter evaluation system.

Extract the following information:
1. GP Name (Game Presenter name) - the person who made the error
2. Error Type - classify as one of: dealing_error, procedure_error, game_rules_error, communication_error, appearance_error, technical_error, other
3. Error Category - more specific sub-category
4. Error Description - detailed description of what went wrong
5. Severity - classify as: low, medium, high, or critical
6. Game Type - if visible (e.g., Blackjack, Roulette, Baccarat)
7. Table ID - if visible
8. Error Date - if visible

Respond in JSON format:
{
  "gpName": "string or null",
  "errorType": "string",
  "errorCategory": "string",
  "errorDescription": "string",
  "severity": "low|medium|high|critical",
  "gameType": "string or null",
  "tableId": "string or null",
  "errorDate": "YYYY-MM-DD or null"
}`;

          const llmResponse = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are an expert at analyzing casino game presenter error reports. Extract information accurately from screenshots.' },
              { 
                role: 'user', 
                content: [
                  { type: 'text', text: analysisPrompt },
                  { type: 'image_url', image_url: { url: `data:${contentType};base64,${input.imageBase64}` } }
                ]
              }
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'error_analysis',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    gpName: { type: ['string', 'null'] },
                    errorType: { type: 'string' },
                    errorCategory: { type: 'string' },
                    errorDescription: { type: 'string' },
                    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                    gameType: { type: ['string', 'null'] },
                    tableId: { type: ['string', 'null'] },
                    errorDate: { type: ['string', 'null'] }
                  },
                  required: ['gpName', 'errorType', 'errorCategory', 'errorDescription', 'severity', 'gameType', 'tableId', 'errorDate'],
                  additionalProperties: false
                }
              }
            }
          });

          let extractedData: any = {};
          try {
            const message = llmResponse?.choices?.[0]?.message;
            const content = message?.content;
            if (content) {
              extractedData = JSON.parse(typeof content === 'string' ? content : '{}');
            }
          } catch (e) {
            console.error('Failed to parse LLM response:', e);
          }

          let gamePresenterId: number | null = input.gpId || null;
          let gpNameToUse: string | null = null;

          // User-scoped GP matching for data isolation
          const userGps = ctx.user.role !== 'admin' 
            ? await db.getAllGamePresentersByUser(ctx.user.id) 
            : await db.getAllGamePresenters();

          if (input.gpId) {
            const gp = userGps.find(g => g.id === input.gpId);
            gpNameToUse = gp?.name || null;
          } else if (extractedData.gpName) {
            gpNameToUse = extractedData.gpName;
            const matchedGp = userGps.find(gp => 
              gp.name.toLowerCase() === extractedData.gpName.toLowerCase() ||
              gp.name.toLowerCase().includes(extractedData.gpName.toLowerCase()) ||
              extractedData.gpName.toLowerCase().includes(gp.name.toLowerCase())
            );
            if (matchedGp) {
              gamePresenterId = matchedGp.id;
            }
          }

          const errorScreenshot = await db.createErrorScreenshot({
            gamePresenterId,
            gpName: gpNameToUse || extractedData.gpName || 'Unknown',
            errorDate: extractedData.errorDate ? new Date(extractedData.errorDate) : null,
            errorType: extractedData.errorType || 'other',
            errorCategory: extractedData.errorCategory || '',
            errorDescription: extractedData.errorDescription || '',
            severity: extractedData.severity || 'medium',
            gameType: extractedData.gameType || null,
            tableId: extractedData.tableId || null,
            screenshotUrl,
            screenshotKey: fileKey,
            rawExtractedData: extractedData,
            month,
            year,
            uploadedById: ctx.user.id,
            processedAt: new Date(),
          });

          if (gamePresenterId) {
            await db.incrementGPMistakes(gamePresenterId, month, year);
          }

          return {
            type: 'ERROR' as const,
            detectedType,
            detectionConfidence,
            detectionReason,
            screenshotUrl,
            screenshotKey: fileKey,
            extractedData,
            gpName: gpNameToUse,
            gpMatched: !!gamePresenterId,
            gamePresenterId,
            entriesCount: 1,
            savedEntries: [errorScreenshot],
          };
        } else {
          // Process as attitude screenshot
          const imageBuffer = Buffer.from(input.imageBase64, 'base64');
          const fileKey = `attitude-screenshots/${year}/${month}/${Date.now()}-${input.filename}`;
          const { url: screenshotUrl } = await storagePut(fileKey, imageBuffer, contentType);

          const analysisPrompt = `Analyze this attitude evaluation screenshot from a casino game presenter evaluation system.

This screenshot shows an attitude entry table with columns: Date, Type (POSITIVE/NEGATIVE), Comment, Score.

IMPORTANT: Extract ALL attitude entries visible in the screenshot, not just one.

For EACH entry in the table, extract:
1. Date - the date and time of the entry (e.g., "3 Jan 2026, 21:00")
2. Type - POSITIVE or NEGATIVE (look for badges/labels)
3. Comment - the full text description
4. Score - the score value (+1 for positive, -1 for negative)

Also look for the GP Name (Game Presenter name) in the page header, title, or breadcrumb.

Respond with a JSON object containing an array of ALL entries found:
{
  "gpName": "string or null - the Game Presenter name from header/title",
  "entries": [
    {
      "date": "3 Jan 2026, 21:00",
      "type": "NEGATIVE",
      "comment": "Was late to the studio...",
      "score": -1
    }
  ],
  "totalEntries": number,
  "totalNegative": number,
  "totalPositive": number
}`;

          const llmResponse = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are an expert at analyzing casino game presenter attitude evaluations. Extract ALL entries from screenshots accurately. Return data as a JSON array.' },
              { 
                role: 'user', 
                content: [
                  { type: 'text', text: analysisPrompt },
                  { type: 'image_url', image_url: { url: `data:${contentType};base64,${input.imageBase64}` } }
                ]
              }
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'attitude_analysis',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    gpName: { type: ['string', 'null'], description: 'Game Presenter name from header/title' },
                    entries: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          date: { type: 'string', description: 'Date and time of entry' },
                          type: { type: 'string', enum: ['POSITIVE', 'NEGATIVE'], description: 'Entry type' },
                          comment: { type: 'string', description: 'Full comment text' },
                          score: { type: 'integer', description: '+1 or -1' }
                        },
                        required: ['date', 'type', 'comment', 'score'],
                        additionalProperties: false
                      }
                    },
                    totalEntries: { type: 'integer' },
                    totalNegative: { type: 'integer' },
                    totalPositive: { type: 'integer' }
                  },
                  required: ['gpName', 'entries', 'totalEntries', 'totalNegative', 'totalPositive'],
                  additionalProperties: false
                }
              }
            }
          });

          let extractedData: any = { gpName: null, entries: [], totalEntries: 0, totalNegative: 0, totalPositive: 0 };
          try {
            const message = llmResponse?.choices?.[0]?.message;
            const content = message?.content;
            if (content) {
              extractedData = JSON.parse(typeof content === 'string' ? content : '{}');
            }
          } catch (e) {
            console.error('Failed to parse LLM response:', e);
          }

          let gamePresenterId: number | null = input.gpId || null;
          let gpNameToUse: string | null = null;

          // User-scoped GP matching for data isolation
          const userGps = ctx.user.role !== 'admin' 
            ? await db.getAllGamePresentersByUser(ctx.user.id) 
            : await db.getAllGamePresenters();

          if (input.gpId) {
            const gp = userGps.find(g => g.id === input.gpId);
            gpNameToUse = gp?.name || null;
          } else {
            gpNameToUse = input.gpName || extractedData.gpName;
            if (gpNameToUse) {
              const matchedGp = userGps.find(gp => 
                gp.name.toLowerCase() === gpNameToUse!.toLowerCase() ||
                gp.name.toLowerCase().includes(gpNameToUse!.toLowerCase()) ||
                gpNameToUse!.toLowerCase().includes(gp.name.toLowerCase())
              );
              if (matchedGp) {
                gamePresenterId = matchedGp.id;
              }
            }
          }

          const savedEntries: any[] = [];
          const entries = extractedData.entries || [];
          
          for (const entry of entries) {
            const attitudeScreenshot = await db.createAttitudeScreenshot({
              gamePresenterId,
              evaluationId: null,
              gpName: gpNameToUse || 'Unknown',
              evaluationDate: entry.date ? new Date(entry.date.replace(/^(\d+)\s+(\w+)\s+(\d+),?\s*(\d+:\d+)?$/, (_: string, d: string, m: string, y: string, t: string) => {
                const months: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
                return `${y}-${months[m] || '01'}-${d.padStart(2, '0')}${t ? 'T' + t : ''}`;
              })) : null,
              attitudeType: entry.type?.toLowerCase() === 'positive' ? 'positive' : 'negative',
              attitudeScore: entry.score || (entry.type === 'POSITIVE' ? 1 : -1),
              attitudeCategory: entry.type?.toLowerCase() === 'positive' ? 'positive' : 'negative',
              comment: entry.comment || '',
              description: entry.comment || '',
              evaluatorName: null,
              screenshotUrl,
              screenshotKey: fileKey,
              rawExtractedData: entry,
              month,
              year,
              uploadedById: ctx.user.id,
              processedAt: new Date(),
            });
            savedEntries.push(attitudeScreenshot);
          }

          if (gamePresenterId && entries.length > 0) {
            // Use cumulative +1/-1 system consistent with attitudeScreenshot.upload
            const totalScore = entries.reduce((sum: number, e: any) => sum + (e.score || (e.type === 'POSITIVE' ? 1 : -1)), 0);
            await db.updateGPAttitude(gamePresenterId, month, year, totalScore);
          }

          return {
            type: 'ATTITUDE' as const,
            detectedType,
            detectionConfidence,
            detectionReason,
            screenshotUrl,
            screenshotKey: fileKey,
            extractedData,
            gpName: gpNameToUse,
            gpMatched: !!gamePresenterId,
            gamePresenterId,
            entriesCount: entries.length,
            savedEntries,
          };
        }
      }),
  }),

});

export type AppRouter = typeof appRouter;
