import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { nanoid } from "nanoid";

export const gpAccessRouter = router({
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

  // Public endpoint: Get errors/attitudes for a specific month (GP portal)
  getMonthDetails: publicProcedure
    .input(z.object({ token: z.string(), month: z.number().min(1).max(12), year: z.number() }))
    .query(async ({ input }) => {
      const accessToken = await db.getGpAccessTokenByToken(input.token);
      if (!accessToken) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid or expired access link' });
      }
      await db.updateGpAccessTokenLastAccess(accessToken.id);

      const gp = await db.getGamePresenterById(accessToken.gamePresenterId);
      if (!gp) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
      }

      // Get stats for selected month
      const stats = await db.getMonthlyGpStats(accessToken.gamePresenterId, input.month, input.year);

      // Get error screenshots for selected month
      const errorScreenshots = await db.getErrorScreenshotsForGP(accessToken.gamePresenterId, input.month, input.year);
      const attitudeDetails = await db.getAttitudeScreenshotsForGP(accessToken.gamePresenterId, input.month, input.year);
      const gpErrors = await db.getGpErrorsForPortal(accessToken.gamePresenterId, input.month, input.year);

      // Get evaluations for this specific month
      const allEvals = await db.getGpEvaluationsForPortal(accessToken.gamePresenterId);
      const monthEvals = allEvals.filter(e => {
        if (!e.evaluationDate) return false;
        const d = new Date(e.evaluationDate);
        return d.getMonth() + 1 === input.month && d.getFullYear() === input.year;
      });

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
          errorDate: e.errorDate,
          createdAt: e.createdAt,
        })),
        ...gpErrors.map(e => ({
          id: `excel-${e.id}`,
          source: 'excel' as const,
          errorType: e.errorCode || 'excel_error',
          errorDescription: e.errorDescription,
          errorCategory: null,
          severity: 'medium' as const,
          gameType: e.gameType,
          tableId: e.tableId,
          screenshotUrl: null,
          errorDate: e.errorDate,
          createdAt: e.createdAt,
        })),
      ];

      return {
        month: input.month,
        year: input.year,
        stats: stats ? {
          attitude: stats.attitude,
          mistakes: stats.mistakes,
          totalGames: stats.totalGames,
        } : null,
        evaluations: monthEvals,
        errorDetails,
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
      };
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
});
