import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { cache, CacheKeys, CacheTTL } from "../services/cache";

export const dashboardRouter = router({
  stats: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12).optional(),
      year: z.number().optional(),
      teamId: z.number().positive().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const teamId = input?.teamId;
      const month = input?.month ?? new Date().getMonth() + 1;
      const year = input?.year ?? new Date().getFullYear();

      // User-based data isolation: each user sees only their own stats.
      // Cache key includes role + user/team scope so admins and tenants
      // never share entries.
      if (ctx.user.role !== 'admin') {
        if (teamId) {
          const team = await db.getFmTeamById(teamId);
          if (!team || team.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          }
          return cache.getOrSet(
            CacheKeys.dashboardStats(month, year, teamId),
            () => db.getDashboardStats(input?.month, input?.year, teamId),
            CacheTTL.DASHBOARD_STATS,
          );
        }
        return cache.getOrSet(
          CacheKeys.dashboardStatsByUser(month, year, ctx.user.id),
          () => db.getDashboardStatsByUser(input?.month, input?.year, ctx.user.id),
          CacheTTL.DASHBOARD_STATS,
        );
      }
      return cache.getOrSet(
        CacheKeys.dashboardStats(month, year, teamId),
        () => db.getDashboardStats(input?.month, input?.year, teamId),
        CacheTTL.DASHBOARD_STATS,
      );
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
      const userScope = ctx.user.role !== 'admin' ? ctx.user.id : undefined;
      return cache.getOrSet(
        CacheKeys.monthlyTrend(months, teamId, userScope),
        () => db.getMonthlyTrendData(months, teamId, userScope),
        CacheTTL.MONTHLY_TREND,
      );
    }),

  // Cross-team GP comparison
  teamComparison: protectedProcedure
    .input(z.object({
      teamIds: z.array(z.number().positive()).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const teamIds = input?.teamIds;
      // Cache only the parameter-less variant; teamId arrays vary too much
      // for a stable key and the underlying query is cheap with filters.
      if (teamIds && teamIds.length > 0) {
        return db.getTeamComparisonData(ctx.user.id, teamIds);
      }
      return cache.getOrSet(
        CacheKeys.teamComparison(ctx.user.id),
        () => db.getTeamComparisonData(ctx.user.id, teamIds),
        CacheTTL.TEAM_COMPARISON,
      );
    }),

  // Admin dashboard with system-wide stats
  adminStats: adminProcedure.query(async () => {
    return cache.getOrSet(
      CacheKeys.adminStats(),
      () => db.getAdminDashboardStats(),
      CacheTTL.ADMIN_STATS,
    );
  }),

  // Server health check (admin-only, calls /api/health internally)
  serverHealth: adminProcedure.query(async () => {
    const startTime = Date.now();
    try {
      // Get process-level metrics directly
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();
      const latency = Date.now() - startTime;

      // Test database connectivity
      let dbStatus = 'unknown';
      let dbLatency = 0;
      try {
        const dbStart = Date.now();
        await db.getAdminDashboardStats();
        dbLatency = Date.now() - dbStart;
        dbStatus = 'connected';
      } catch {
        dbStatus = 'error';
      }

      return {
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
        uptime,
        nodeVersion: process.version,
        latency,
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
        },
        database: {
          status: dbStatus,
          latency: dbLatency,
        },
        environment: process.env.NODE_ENV || 'development',
      };
    } catch (error) {
      return {
        status: 'error' as const,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        nodeVersion: process.version,
        latency: Date.now() - startTime,
        memory: { heapUsed: 0, heapTotal: 0, rss: 0 },
        database: { status: 'unknown', latency: 0 },
        environment: process.env.NODE_ENV || 'development',
      };
    }
  }),
});
