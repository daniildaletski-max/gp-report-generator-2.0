import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { nanoid } from "nanoid";
import { invokeLLM } from "../_core/llm";
import { createLogger } from "../services/logger";
import { isTechnicalError, dedupeErrorDetails } from "@shared/errorClassification";

const log = createLogger("gpAccess");

/**
 * In-memory daily cache for AI Coach insights, keyed by `${gpId}-YYYY-MM-DD`.
 * Each GP gets at most one LLM round-trip per UTC day; the portal polls
 * every 30s but the cached insights are returned for free in between.
 * Restarts wipe it — that's intentional, the cache is a cost-saver, not
 * authoritative storage.
 */
const insightsCache = new Map<string, { generatedAt: Date; insights: CoachInsights }>();

interface CoachInsights {
  headline: string;
  strength: string;
  focus: string;
  motivation: string;
}

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

      // Get stats for selected month. `mistakes` here comes directly from
      // the Excel "Error Count Analysis" sheet column E (set at upload time).
      // We trust it as-is — no filtering, no dedup, no cross-source merge.
      const stats = await db.getMonthlyGpStats(accessToken.gamePresenterId, input.month, input.year);

      // Filter technical / TV / SYS errors out of the detail list so
      // the GP only sees mistakes that count against them — matches
      // the "Error Count Analysis" sheet column E count semantics.
      // Cross-source dedup also collapses the case where the FM
      // uploaded a screenshot AND the monthly Excel parsed the same
      // mistake.
      const errorScreenshotsRaw = await db.getErrorScreenshotsForGP(accessToken.gamePresenterId, input.month, input.year);
      const errorScreenshots = errorScreenshotsRaw.filter(e => !isTechnicalError({
        errorType: e.errorType,
        errorCategory: e.errorCategory,
        errorDescription: e.errorDescription,
      }));
      const attitudeDetails = await db.getAttitudeScreenshotsForGP(accessToken.gamePresenterId, input.month, input.year);
      const gpErrorsRaw = await db.getGpErrorsForPortal(accessToken.gamePresenterId, input.month, input.year);
      const gpErrors = gpErrorsRaw.filter(e => !isTechnicalError({
        errorCode: e.errorCode,
        errorDescription: e.errorDescription,
      }));

      // Get evaluations for this specific month
      const allEvals = await db.getGpEvaluationsForPortal(accessToken.gamePresenterId);
      const monthEvals = allEvals.filter(e => {
        if (!e.evaluationDate) return false;
        const d = new Date(e.evaluationDate);
        return d.getMonth() + 1 === input.month && d.getFullYear() === input.year;
      });

      const errorDetailsRaw = [
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
      // Collapse cross-source dupes (FM uploaded a screenshot + the
      // same row appears in the monthly Excel) plus byte-identical
      // same-source dupes (parse-noise from re-uploads).
      const errorDetails = dedupeErrorDetails(errorDetailsRaw);

      const reportedMistakes = stats?.mistakes ?? 0;

      // When the count is zero, give the FM something actionable rather
      // than a generic "no errors" message — list the latest uploaded
      // Playgon/MG files for the month and show how many gpErrors rows
      // exist for THIS GP across the month under any name. Lets them
      // see at a glance whether the file isn't uploaded vs the file
      // exists but the GP's name didn't match anything in it.
      let diagnostics: {
        gpName: string;
        latestErrorFiles: Array<{ id: number; fileName: string; fileType: string; uploadedAt: Date | string | null }>;
      } | null = null;
      if (reportedMistakes === 0) {
        const allFiles = await db.getAllErrorFiles();
        const latestErrorFiles = allFiles
          .filter(f => f.month === input.month && f.year === input.year)
          .slice(0, 4)
          .map(f => ({
            id: f.id,
            fileName: f.fileName,
            fileType: f.fileType,
            uploadedAt: f.createdAt,
          }));
        diagnostics = {
          gpName: gp.name,
          latestErrorFiles,
        };
      }

      return {
        month: input.month,
        year: input.year,
        stats: stats ? {
          attitude: attitudeDetails.reduce((s: number, a: any) => s + (a.attitudeScore || 0), 0),
          mistakes: reportedMistakes,
          totalGames: stats.totalGames,
        } : null,
        // Kept for client compatibility; we no longer hide any errors
        // from the count, so these are always 0 / empty.
        technicalErrorsHidden: 0,
        hiddenTechnicalErrors: [] as Array<never>,
        diagnostics,
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


      // Get monthly history for trend charts (last 6 months)
      const monthlyHistory = await db.getGpMonthlyHistory(accessToken.gamePresenterId, 6);

      // Same TV/technical filter + dedupe path as getMonthDetails so
      // both endpoints surface the exact same set of "real" mistakes
      // — what the GP sees in the Errors & Mistakes section matches
      // the count derived from the Excel "Error Count Analysis" sheet.
      const errorScreenshotsRaw = await db.getErrorScreenshotsForGP(accessToken.gamePresenterId, currentMonth, currentYear);
      const errorScreenshots = errorScreenshotsRaw.filter(e => !isTechnicalError({
        errorType: e.errorType,
        errorCategory: e.errorCategory,
        errorDescription: e.errorDescription,
      }));
      const attitudeDetails = await db.getAttitudeScreenshotsForGP(accessToken.gamePresenterId, currentMonth, currentYear);
      const gpErrorsRaw = await db.getGpErrorsForPortal(accessToken.gamePresenterId, currentMonth, currentYear);
      const gpErrors = gpErrorsRaw.filter(e => !isTechnicalError({
        errorCode: e.errorCode,
        errorDescription: e.errorDescription,
      }));

      const errorDetailsRaw = [
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
          errorDate: (e as any).errorDate ?? null,
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
          createdAt: e.createdAt,
          errorDate: e.errorDate,
        })),
      ];
      const errorDetails = dedupeErrorDetails(errorDetailsRaw);

      // Peer benchmark — compute the GP's percentile rank within
      // their own team for the last 6 months of avg scores. Anonymous
      // (only the GP's own rank surfaces; no individual peer data
      // leaks). Used by the GP Portal to show "you're top X% in
      // Dealing Style this month" — gentle motivator without
      // shaming. Best-effort: failures are swallowed so the portal
      // always renders.
      let peerBenchmark: {
        teamSize: number;
        total: { rank: number; percentile: number } | null;
        appearance: { rank: number; percentile: number } | null;
        performance: { rank: number; percentile: number } | null;
      } | null = null;
      try {
        if (gp.teamId) {
          const teamGps = await db.getGamePresentersByTeam(gp.teamId);
          if (teamGps.length > 1) {
            // Fetch avg scores for everyone on the team (last 6 months).
            const teamAvgs = await Promise.all(teamGps.map(async (peer) => {
              const hist = await db.getGpMonthlyHistory(peer.id, 6).catch(() => [] as any[]);
              const withData = hist.filter((m: any) => Number(m.evalCount || 0) > 0);
              if (withData.length === 0) return { id: peer.id, total: 0, appearance: 0, performance: 0, hasData: false };
              const avg = (key: string) =>
                withData.reduce((s: number, m: any) => s + Number(m[key] || 0), 0) / withData.length;
              return {
                id: peer.id,
                total: avg("avgTotal"),
                appearance: avg("avgAppearance"),
                performance: avg("avgPerformance"),
                hasData: true,
              };
            }));
            const ranked = teamAvgs.filter(t => t.hasData);
            // Percentile: how many peers does this GP outrank
            // (higher score = better). Uses standard "percentile of"
            // formula: (count below + 0.5 × count tied) / total.
            const pctOf = (key: "total" | "appearance" | "performance") => {
              const me = ranked.find(t => t.id === gp.id);
              if (!me) return null;
              const myScore = me[key];
              const peers = ranked.filter(t => t.id !== gp.id);
              if (peers.length === 0) return null;
              const below = peers.filter(t => t[key] < myScore).length;
              const tied = peers.filter(t => t[key] === myScore).length;
              // Denominator must match the population we're scoring
              // against. Both `below` and `tied` exclude the current
              // GP, so the denominator must too — otherwise the top
              // GP in a 2-person team gets capped at 50% instead of
              // 100% (Codex P1 on PR #78).
              const pct = Math.round(((below + 0.5 * tied) / peers.length) * 100);
              const rank = ranked.filter(t => t[key] > myScore).length + 1;
              return { rank, percentile: pct };
            };
            peerBenchmark = {
              teamSize: ranked.length,
              total: pctOf("total"),
              appearance: pctOf("appearance"),
              performance: pctOf("performance"),
            };
          }
        }
      } catch (e) {
        log.warn(`peerBenchmark failed for gp ${gp.id}: ${e instanceof Error ? e.message : String(e)}`);
      }

      return {
        gpName: gp.name,
        gpId: gp.id,
        evaluations,
        peerBenchmark,
        monthlyStats: {
          current: currentMonthStats ? {
            month: currentMonth,
            year: currentYear,
            attitude: attitudeDetails.reduce((s: number, a: any) => s + (a.attitudeScore || 0), 0),
            // Trust the Excel "Error Count Analysis" column E value as-is.
            mistakes: currentMonthStats.mistakes ?? 0,
            totalGames: currentMonthStats.totalGames,
          } : null,
          previous: prevMonthStats ? {
            month: prevMonth,
            year: prevYear,
            attitude: prevMonthStats.attitude,
            mistakes: prevMonthStats.mistakes,
            totalGames: prevMonthStats.totalGames,
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

  /**
   * AI Coach insights — three short personalised lines for the hero card.
   *
   * Reads the GP's recent performance history (last 5 evaluations,
   * current monthly stats, recent action items, recent attitude) and asks
   * the LLM for a one-line headline + strength + focus + motivational
   * closer. Cached per-GP per-UTC-day in-memory so the portal's 30s
   * polling doesn't re-burn LLM credits.
   *
   * The prompt is intentionally narrow — three lines, plain casino-team
   * vocabulary, no fluff — so output stays useful and short.
   */
  getCoachInsights: publicProcedure
    .input(z.object({ token: z.string(), refresh: z.boolean().optional() }))
    .query(async ({ input }) => {
      const accessToken = await db.getGpAccessTokenByToken(input.token);
      if (!accessToken) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid or expired access link' });
      const gp = await db.getGamePresenterById(accessToken.gamePresenterId);
      if (!gp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game Presenter not found' });

      const today = new Date().toISOString().slice(0, 10);
      const cacheKey = `${gp.id}-${today}`;
      if (!input.refresh) {
        const cached = insightsCache.get(cacheKey);
        if (cached) return { ...cached.insights, cached: true, generatedAt: cached.generatedAt };
      }

      const evaluations = await db.getGpEvaluationsForPortal(gp.id);
      const recent = (evaluations as any[])
        .sort((a, b) => new Date(b.evaluationDate || 0).getTime() - new Date(a.evaluationDate || 0).getTime())
        .slice(0, 5);

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const stats = await db.getMonthlyGpStats(gp.id, month, year);

      const summary = {
        gpName: gp.name,
        evaluationsTotal: evaluations.length,
        currentMonth: { mistakes: stats?.mistakes ?? 0, attitude: stats?.attitude ?? 0, totalGames: stats?.totalGames ?? 0 },
        recentEvaluations: recent.map(e => ({
          date: e.evaluationDate,
          totalScore: e.totalScore,
          appearance: e.appearanceScore,
          gamePerformance: e.gamePerformanceTotalScore,
          hairComment: e.hairComment ?? undefined,
          makeupComment: e.makeupComment ?? undefined,
          outfitComment: e.outfitComment ?? undefined,
          postureComment: e.postureComment ?? undefined,
          dealingStyleComment: e.dealingStyleComment ?? undefined,
          gamePerformanceComment: e.gamePerformanceComment ?? undefined,
          generalComment: e.generalComment ?? undefined,
        })),
      };

      const prompt = `You are a kind, succinct casino game-presenter coach.
You are speaking directly to ${gp.name}, a Game Presenter, on their personal performance dashboard.

Here is their data (JSON):
${JSON.stringify(summary, null, 2)}

Write four short lines, second person ("you"), warm but professional, no emoji, no markdown:
1. "headline" — a single 5-9 word sentence that captures momentum (e.g., "Strong April so far — keep stacking it.")
2. "strength" — one sentence naming the strongest concrete thing they're doing well based on the actual evaluation data and comments. Be specific to a skill.
3. "focus" — one sentence naming the single most useful thing to work on next, with a concrete action. Reference their actual scores/comments where possible.
4. "motivation" — a one-sentence motivational closer tied to a real number from the data.

Avoid generalities. If the data is sparse (under 3 evaluations), say so naturally.

Respond as strict JSON with keys: headline, strength, focus, motivation.`;

      try {
        const llm = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are a concise, encouraging game-presenter coach. You always return strict JSON.' },
            { role: 'user', content: prompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'coach_insights',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  headline: { type: 'string' },
                  strength: { type: 'string' },
                  focus: { type: 'string' },
                  motivation: { type: 'string' },
                },
                required: ['headline', 'strength', 'focus', 'motivation'],
                additionalProperties: false,
              },
            },
          },
        });
        const content = llm?.choices?.[0]?.message?.content;
        const parsed = JSON.parse(typeof content === 'string' ? content : '{}') as CoachInsights;
        const generatedAt = new Date();
        insightsCache.set(cacheKey, { generatedAt, insights: parsed });
        return { ...parsed, cached: false, generatedAt };
      } catch (e) {
        log.error('AI Coach insights failed', e instanceof Error ? e : new Error(String(e)));
        // Fail soft — return a static fallback so the UI doesn't go blank.
        const fallback: CoachInsights = {
          headline: `${evaluations.length} evaluation${evaluations.length === 1 ? '' : 's'} on record`,
          strength: 'You have a track record to build on — keep showing up.',
          focus: 'Open the Trend tab to see which category is moving most.',
          motivation: 'One good shift at a time. You\'ve got this.',
        };
        return { ...fallback, cached: false, generatedAt: new Date() };
      }
    }),
});
