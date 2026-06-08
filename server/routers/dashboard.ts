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

  /**
   * Auto-generated insights — the "Operations Brain". Looks at the
   * caller's data and surfaces the top items that need attention,
   * each with a clear next-step action. Replaces the FM having to
   * manually check 5 different pages to figure out what's gone stale,
   * what's regressed, and what's missing this month.
   *
   * Company-wide insight kinds:
   *   - missing_report     — last month has no company report (recommendation)
   *   - score_regression   — avg dropped >2 pts vs prior month (alert)
   *   - score_improvement  — avg improved >2 pts (celebration)
   *   - top_performer      — highest average last month (celebration)
   *   - sustained_decline  — avg down 3 months running (alert, predictive)
   *   - coverage_gap       — >50% of GPs unevaluated this month (warning)
   *   - evaluation_stale   — a GP not evaluated in 35+ days (warning)
   *   - attendance_risk    — high missed days / late arrivals this month (alert)
   *   - error_spike        — mistakes climbing month-over-month (warning)
   *
   * Sorted by severity (alert > warning > recommendation > celebration > info)
   * then by recency. Capped so the UI doesn't drown the FM.
   */
  insights: protectedProcedure
    .input(z.object({
      teamId: z.number().positive().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const teamId = input?.teamId;
      const userScope = ctx.user.role !== 'admin' ? ctx.user.id : undefined;

      // Tenant scope — same pattern as dashboard.stats: when a non-admin
      // explicitly passes a teamId, verify that team belongs to them so a
      // crafted request can't read another tenant's insights. The DB
      // layer also filters by userId as defense in depth, but failing
      // FAST here gives a clean 403 instead of silently returning [].
      return await db.computeDashboardInsights({
        teamId,
        userId: userScope,
        userRole: ctx.user.role,
      });
    }),

  /**
   * Recent activity feed — the most recent 20 events across:
   *   - Persona sync runs (success / partial / failed)
   *   - Generated reports
   *   - New evaluations
   *   - Uploaded error files
   * — so the FM can see what's been happening on the system at a glance,
   * without bouncing between five admin tabs.
   *
   * Accepts an optional teamId so the dashboard can keep the feed
   * synchronised with the team selector at the top of the page —
   * showing all-team activity when the FM has "All teams" selected
   * and only the active team's activity when they pick one.
   */
  activityFeed: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).default(20),
      teamId: z.number().positive().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const teamId = input?.teamId;
      const userScope = ctx.user.role !== 'admin' ? ctx.user.id : undefined;

      // Same tenant-scope check as insights — non-admin must own the
      // team they're querying about.
      return await db.getDashboardActivityFeed({
        limit,
        userId: userScope,
        teamId,
        userRole: ctx.user.role,
      });
    }),

  // Admin dashboard with system-wide stats
  adminStats: adminProcedure.query(async () => {
    return cache.getOrSet(
      CacheKeys.adminStats(),
      () => db.getAdminDashboardStats(),
      CacheTTL.ADMIN_STATS,
    );
  }),

  /**
   * Onboarding status — single lightweight endpoint for the Dashboard
   * OnboardingChecklist. Returns boolean existence flags for every
   * setup milestone (team / GP / assigned GP / first eval / first
   * report / persona sync / studioworks import).
   *
   * Implementation: each flag is a `SELECT id ... LIMIT 1` against
   * the relevant table — O(1) regardless of evaluation history size.
   * Replaces the previous path that called dashboard.stats twice and
   * scanned every evaluation row in memory.
   *
   * Tenant scope: non-admin users see only their own data; admins
   * see tenant-wide.
   */
  onboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const status = await db.getOnboardingStatus({
      userId: ctx.user.id,
      isAdmin: ctx.user.role === "admin",
    });
    return {
      ...status,
      // Convenience: integration is "done" when either backend signal
      // fires — kept here to keep the client simple.
      hasIntegration: status.hasPersonaSync || status.hasStudioworksImport,
    };
  }),

  // Server health check (admin-only, calls /api/health internally)
  serverHealth: adminProcedure.query(async () => {
    const startTime = Date.now();
    try {
      // Get process-level metrics directly
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();
      // V8 max-old-space cap. Without this the dashboard percent
      // (heapUsed / heapTotal) is misleading: heapTotal is the
      // current V8 allocation, not the ceiling — so 95% there can
      // mean "V8 hasn't grown the heap any more yet", not "we're
      // out of memory". `heap_size_limit` is the actual cap that
      // matters; surface it so the UI can compute a meaningful %.
      const v8 = await import("v8");
      const heapStats = v8.getHeapStatistics();
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
          heapLimit: Math.round(heapStats.heap_size_limit / 1024 / 1024),
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
        memory: { heapUsed: 0, heapTotal: 0, heapLimit: 0, rss: 0 },
        database: { status: 'unknown', latency: 0 },
        environment: process.env.NODE_ENV || 'development',
      };
    }
  }),
});
