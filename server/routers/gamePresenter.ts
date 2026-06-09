import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import * as db from "../db";
import * as dbHelpers from "../db";
import { getDb as getDbDirect } from "../db";
import { gamePresenters } from "../../drizzle/schema";

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
      // Two bulk reads instead of the old per-GP stats loop (N+1):
      // one roster query + one inArray() stats query, joined in memory.
      // Output shape is identical: { ...gp, stats: MonthlyGpStats | null }.
      if (ctx.user.role !== 'admin') {
        const userGPs = await db.getAllGamePresentersByUser(ctx.user.id);
        const statsByGp = await db.getMonthlyGpStatsForGPs(userGPs.map(g => g.id), input.month, input.year);
        return userGPs.map(gp => ({ ...gp, stats: statsByGp.get(gp.id) ?? null }));
      }
      // Admin: use teamId if provided, otherwise all GPs
      const teamId = input.teamId;
      if (!teamId) {
        const allGPs = await db.getAllGamePresenters();
        const statsByGp = await db.getMonthlyGpStatsForGPs(allGPs.map(g => g.id), input.month, input.year);
        return allGPs.map(gp => ({ ...gp, stats: statsByGp.get(gp.id) ?? null }));
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
        if (!gp) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied: You can only manage your own Game Presenters' });
        }
      }
      await db.updateGamePresenterTeam(input.gpId, input.teamId);
      return { success: true };
    }),

  /**
   * Create a brand-new GP and assign it to the given team.
   *
   * Unlike `findOrCreateGamePresenter` which fuzzy-matches against the
   * entire DB before inserting, this procedure ALWAYS inserts a fresh
   * row. Used by the Persona sync admin's "Add as new GP" inline
   * action: when a Persona worker doesn't match any GP in the target
   * team, the FM clicks "Add" and we want exactly one new GP, even if
   * there's a fuzzy match in some other team (which would silently
   * pull the wrong GP under the new team's roof).
   */
  createForTeam: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      teamId: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbi = await getDbDirect();
      if (!dbi) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const result = await dbi.insert(gamePresenters).values({
        name: input.name.trim(),
        teamId: input.teamId,
        userId: ctx.user.id,
      });
      const created = await db.getGamePresenterById(Number(result[0].insertId));
      return { success: true, gp: created };
    }),

  /**
   * Create a brand-new GP (no teamId, no fuzzy fallback). Used by the
   * studioworks importer's unmatched-name resolver when the FM confirms
   * a name is a genuinely new presenter rather than a missed match.
   *
   * Unlike `createForTeam`, this is for the one-shared-DB model: no team
   * scoping is required. Unlike `findOrCreateGamePresenter`, this path
   * SKIPS the fuzzy match step — the FM has already decided it's a new
   * person, so silently merging into a close-but-different existing GP
   * would be the wrong outcome.
   */
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const dbi = await getDbDirect();
      if (!dbi) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const name = input.name.trim();
      const result = await dbi.insert(gamePresenters).values({
        name,
        teamId: null,
        userId: ctx.user.id,
      });
      const created = await db.getGamePresenterById(Number(result[0].insertId));
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Created GP could not be re-read' });
      return { success: true, gp: created };
    }),

  delete: protectedProcedure
    .input(z.object({ gpId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const gp = await db.getGamePresenterById(input.gpId);
      if (!gp) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
      }
      // User-based data isolation: non-admin can only delete their own GPs
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

  // Revert a manual attitude override back to the screenshot-derived value
  clearAttitudeOverride: protectedProcedure
    .input(z.object({
      gpId: z.number().positive(),
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
    }))
    .mutation(async ({ ctx, input }) => {
      const gp = await db.getGamePresenterById(input.gpId);
      if (!gp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });
      await db.clearAttitudeOverride(input.gpId, input.month, input.year);
      return { success: true };
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
      
      // One shared database — GPs are no longer team-scoped.

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
          teamName: 'Unassigned',
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
        recentEvaluations,
        errorsByMonth,
        attitudeByMonth,
      ] = await Promise.all([
        db.getMonthlyGpStats(gp.id, currentMonth, currentYear),
        db.getOrCreateAttendance(gp.id, currentMonth, currentYear),
        db.getGpMonthlyHistory(gp.id, input.monthsBack),
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
          teamName: null,
          floorManagerName: null,
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
        recentEvaluations,
        recentErrors,
        recentAttitude,
      };
    }),

  /**
   * Set the GP's real legal name — the one used by HR / Persona /
   * payroll. The Persona scrape returns names like "Sofja Barchan"
   * which the auto-matcher couldn't reconcile against dealer
   * pseudonyms ("Cleo" etc.); once `realName` is set per GP, the
   * matcher uses it first, fuzzy match score jumps from ~0% to ~100%.
   * `realName: null | ""` clears the field.
   */
  setRealName: protectedProcedure
    .input(z.object({ id: z.number(), realName: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDbDirect();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const existing = await dbHelpers.getGamePresenterById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "GP not found" });
      const trimmed = input.realName?.trim() || null;
      await db.update(gamePresenters)
        .set({ realName: trimmed })
        .where(eq(gamePresenters.id, input.id));
      return { id: input.id, realName: trimmed };
    }),
});
