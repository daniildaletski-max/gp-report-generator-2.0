import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { generateExcelAndEmail, extractEvaluationFromImage, parseEvaluationDate, EvaluationDataSchema } from "./_shared";

export const evaluationRouter = router({
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
});
