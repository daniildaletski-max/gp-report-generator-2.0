/**
 * FM Copilot tRPC Router
 *
 * Surfaces the AI automation service to the client. The daily briefing
 * is cached for 8 hours per (userId, day) — short enough that the FM
 * sees fresh data after a major change, long enough that re-opening
 * the page during the day doesn't burn LLM calls.
 *
 * applyCoachingActions writes the FM-approved AI suggestions into the
 * action_items table — the bridge between "AI suggested" and "real
 * thing the FM is committed to doing".
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import {
  generateDailyBriefing,
  generateCoachingBrief,
  generateMonthlyReviewDraft,
} from "../services/aiCoachService";
import { cache } from "../services/cache";
import { createLogger } from "../services/logger";

const log = createLogger("AICoachRouter");

const BRIEFING_TTL_MS = 8 * 60 * 60 * 1000; // 8h

export const aiCoachRouter = router({
  /**
   * Daily morning briefing — cached for 8h per (userId, ISO date).
   * Use `force: true` to bust the cache.
   */
  dailyBriefing: protectedProcedure
    .input(z.object({
      teamId: z.number().positive().optional(),
      force: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const dateKey = new Date().toISOString().slice(0, 10);
      const cacheKey = `aiCoach:dailyBriefing:${ctx.user.id}:${input.teamId ?? "all"}:${dateKey}`;
      if (input.force) cache.invalidate(cacheKey);
      try {
        return await cache.getOrSet(
          cacheKey,
          () => generateDailyBriefing({
            userId: ctx.user.id,
            userRole: ctx.user.role,
            teamId: input.teamId,
          }),
          BRIEFING_TTL_MS,
        );
      } catch (err) {
        log.error("dailyBriefing failed", err instanceof Error ? err : new Error(String(err)), { userId: ctx.user.id });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to generate briefing",
        });
      }
    }),

  /**
   * Per-GP 1:1 coaching brief — uncached on purpose; the FM is reading
   * it right before sitting down with the GP, and we want fresh data.
   */
  coachingBrief: protectedProcedure
    .input(z.object({ gpId: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      // Ownership check — non-admins can only brief their own GPs.
      if (ctx.user.role !== "admin") {
        const gp = await db.getGamePresenterById(input.gpId);
        if (!gp || gp.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this GP" });
        }
      }
      try {
        return await generateCoachingBrief(input.gpId);
      } catch (err) {
        log.error("coachingBrief failed", err instanceof Error ? err : new Error(String(err)), { gpId: input.gpId });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to generate coaching brief",
        });
      }
    }),

  /**
   * Monthly review draft — generates the narrative + strengths +
   * growth areas + deltas + next-month goal so the FM only has to
   * edit and approve.
   */
  draftMonthlyReview: protectedProcedure
    .input(z.object({
      gpId: z.number().positive(),
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        const gp = await db.getGamePresenterById(input.gpId);
        if (!gp || gp.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this GP" });
        }
      }
      try {
        return await generateMonthlyReviewDraft({
          gpId: input.gpId, month: input.month, year: input.year,
        });
      } catch (err) {
        log.error("draftMonthlyReview failed", err instanceof Error ? err : new Error(String(err)), { gpId: input.gpId });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to draft review",
        });
      }
    }),

  /**
   * Save AI-suggested actions as real action items.
   *
   * The FM picks which suggestions to keep (typically all of them) and
   * we batch-insert them into the action_items table. The `source` is
   * tagged "ai_insight" so the Inbox / dashboard can label them as
   * AI-originated.
   */
  applyCoachingActions: protectedProcedure
    .input(z.object({
      gpId: z.number().positive(),
      actions: z.array(z.object({
        title: z.string().min(1).max(255),
        description: z.string().max(2000),
        category: z.enum(["appearance", "performance", "attitude", "attendance", "errors", "general"]),
        priority: z.enum(["low", "medium", "high"]),
      })).min(1).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const gp = await db.getGamePresenterById(input.gpId);
      if (!gp) throw new TRPCError({ code: "NOT_FOUND", message: "GP not found" });
      if (ctx.user.role !== "admin" && gp.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this GP" });
      }
      let created = 0;
      for (const a of input.actions) {
        await db.createActionItem({
          gamePresenterId: input.gpId,
          userId: gp.userId ?? null,
          createdById: ctx.user.id,
          title: a.title,
          description: a.description,
          category: a.category,
          priority: a.priority,
          status: "open",
          source: "ai_insight",
        });
        created++;
      }
      return { success: true, created };
    }),
});
