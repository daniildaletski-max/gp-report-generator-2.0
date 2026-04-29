import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { getBonusForGp } from "../services/bonusService";

export const gamePresenterRouter = router({
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

  // Get GP monthly history for comparison across months
  monthlyHistory: protectedProcedure
    .input(z.object({
      gpId: z.number().positive(),
      monthsBack: z.number().min(2).max(12).optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const gp = await db.getGamePresenterById(input.gpId);
      if (!gp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
      if (ctx.user.role !== 'admin' && gp.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      return await db.getGpMonthlyHistory(input.gpId, input.monthsBack || 6);
    }),

  // Get all GPs monthly comparison for a team
  teamMonthlyComparison: protectedProcedure
    .input(z.object({
      teamId: z.number().positive().optional(),
      monthsBack: z.number().min(2).max(12).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const monthsBack = input?.monthsBack || 6;
      // Get GPs for the team or all user's GPs
      let gps: { id: number; name: string; teamId: number | null }[];
      if (input?.teamId) {
        const allGps = ctx.user.role !== 'admin'
          ? await db.getAllGamePresentersByUser(ctx.user.id)
          : await db.getAllGamePresenters();
        gps = allGps.filter(g => g.teamId === input.teamId);
      } else {
        gps = ctx.user.role !== 'admin'
          ? await db.getAllGamePresentersByUser(ctx.user.id)
          : await db.getAllGamePresenters();
      }
      // Get monthly history for each GP (limit to 20 GPs for performance)
      const gpHistories = await Promise.all(
        gps.slice(0, 20).map(async (gp) => {
          const history = await db.getGpMonthlyHistory(gp.id, monthsBack);
          return {
            gpId: gp.id,
            gpName: gp.name,
            teamId: gp.teamId,
            months: history,
          };
        })
      );
      return gpHistories;
    }),

  /**
   * Aggregate profile for one GP — everything needed by the GP Detail
   * drawer in a single round-trip:
   *   - identity (name, team, attitude/mistakes for current month)
   *   - 6-month performance trend (from getGpMonthlyHistory)
   *   - 6-month bonus history (level + payout per month)
   *   - last 10 evaluations
   *   - last N errors and attitude entries from the last `monthsBack` months
   */
  profile: protectedProcedure
    .input(z.object({
      gpId: z.number().positive(),
      monthsBack: z.number().int().min(1).max(12).default(6),
    }))
    .query(async ({ ctx, input }) => {
      const gp = await db.getGamePresenterById(input.gpId);
      if (!gp) throw new TRPCError({ code: "NOT_FOUND", message: "GP not found" });
      // Ownership check for non-admin
      if (ctx.user.role !== "admin" && gp.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const team = gp.teamId ? await db.getFmTeamById(gp.teamId) : null;
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      // The N most-recent (month, year) tuples, oldest-first to match
      // getGpMonthlyHistory's ordering.
      const months: Array<{ month: number; year: number }> = [];
      for (let i = input.monthsBack - 1; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - 1 - i, 1);
        months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
      }

      const [
        currentStats,
        currentAttendance,
        trend,
        bonusHistory,
        recentEvaluations,
        errorsByMonth,
        attitudeByMonth,
      ] = await Promise.all([
        db.getMonthlyGpStats(gp.id, currentMonth, currentYear),
        db.getOrCreateAttendance(gp.id, currentMonth, currentYear),
        db.getGpMonthlyHistory(gp.id, input.monthsBack),
        Promise.all(months.map(async ({ month, year }) => {
          const r = await getBonusForGp(gp.id, month, year);
          return r ? {
            month, year,
            label: `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month-1]} ${year}`,
            bonusLevel: r.bonusLevel,
            bonusAmount: r.bonusAmount,
            achievedGGs: r.achievedGGs,
            totalGames: r.totalGames,
            errorCount: r.errorCount,
            hoursWorked: r.hoursWorked,
          } : null;
        })),
        // 10 most recent evaluations across all time
        db.getEvaluationsByGP(gp.id).then(rows => rows.slice(0, 10)),
        // Last N months of error screenshots
        Promise.all(months.map(({ month, year }) => db.getErrorScreenshotsForGP(gp.id, month, year))),
        Promise.all(months.map(({ month, year }) => db.getAttitudeScreenshotsForGP(gp.id, month, year))),
      ]);

      // Flatten + sort + limit to 15 most recent each
      const recentErrors = errorsByMonth.flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 15);
      const recentAttitude = attitudeByMonth.flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 15);

      return {
        gp: {
          id: gp.id,
          name: gp.name,
          teamId: gp.teamId,
          teamName: team?.teamName ?? null,
          floorManagerName: team?.floorManagerName ?? null,
          createdAt: gp.createdAt,
        },
        currentMonth: {
          month: currentMonth,
          year: currentYear,
          evalCount: recentEvaluations.filter(e => {
            if (!e.evaluationDate) return false;
            const d = new Date(e.evaluationDate);
            return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
          }).length,
          totalGames: currentStats?.totalGames ?? 0,
          mistakes: currentStats?.mistakes ?? 0,
          attitude: currentStats?.attitude ?? null,
          attendance: {
            extraShifts: currentAttendance.extraShifts ?? 0,
            lateToWork: currentAttendance.lateToWork ?? 0,
            missedDays: currentAttendance.missedDays ?? 0,
            sickLeaves: currentAttendance.sickLeaves ?? 0,
          },
        },
        trend,
        bonusHistory: bonusHistory.filter((b): b is NonNullable<typeof b> => b !== null),
        recentEvaluations,
        recentErrors,
        recentAttitude,
      };
    }),
});
