/**
 * Action Items / Coaching Plans router
 *
 * - list: scoped by GP/team/user, optionally include closed items
 * - stats: aggregate counts (open/in-progress/done/overdue/dueThisWeek)
 * - create / update / delete / complete with ownership checks
 * - generateSuggestions: calls the LLM-backed insights service
 * - listForPortalToken: read-only for the GP's public portal
 */
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { generateInsights } from "../services/insightsService";

const categoryEnum = z.enum(["appearance", "performance", "attitude", "attendance", "errors", "general"]);
const statusEnum = z.enum(["open", "in_progress", "done", "cancelled"]);
const priorityEnum = z.enum(["low", "medium", "high"]);

async function ensureCanReadGp(ctx: { user: { id: number; role: string } }, gpId: number) {
  const gp = await db.getGamePresenterById(gpId);
  if (!gp) throw new TRPCError({ code: "NOT_FOUND", message: "GP not found" });
  if (ctx.user.role !== "admin" && gp.userId !== ctx.user.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  }
  return gp;
}

async function ensureCanModify(ctx: { user: { id: number; role: string } }, itemId: number) {
  if (ctx.user.role === "admin") return;
  const ok = await db.verifyActionItemOwnership(itemId, ctx.user.id);
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
}

export const actionItemsRouter = router({
  /**
   * List items in the caller's scope. Default: open + in_progress only.
   * Pass `gpId` to scope to one GP, or `teamId`, or neither (admin: all,
   * non-admin: their own).
   */
  list: protectedProcedure
    .input(z.object({
      gpId: z.number().positive().nullish(),
      teamId: z.number().positive().nullish(),
      includeAllStatuses: z.boolean().default(false),
    }).optional())
    .query(async ({ ctx, input }) => {
      const gpId = input?.gpId ?? undefined;
      const teamId = input?.teamId ?? undefined;
      if (gpId) await ensureCanReadGp(ctx, gpId);

      return db.listActionItems({
        gpId,
        teamId,
        userId: ctx.user.role === "admin" ? undefined : ctx.user.id,
        includeAllStatuses: input?.includeAllStatuses,
      });
    }),

  stats: protectedProcedure
    .input(z.object({
      gpId: z.number().positive().nullish(),
      teamId: z.number().positive().nullish(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return db.getActionItemStats({
        gpId: input?.gpId ?? undefined,
        teamId: input?.teamId ?? undefined,
        userId: ctx.user.role === "admin" ? undefined : ctx.user.id,
      });
    }),

  create: protectedProcedure
    .input(z.object({
      gpId: z.number().positive(),
      title: z.string().trim().min(1).max(255),
      description: z.string().trim().optional(),
      category: categoryEnum.default("general"),
      priority: priorityEnum.default("medium"),
      source: z.enum(["manual", "ai_insight"]).default("manual"),
      dueDate: z.coerce.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureCanReadGp(ctx, input.gpId);
      return db.createActionItem({
        gamePresenterId: input.gpId,
        userId: ctx.user.id,
        createdById: ctx.user.id,
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        priority: input.priority,
        source: input.source,
        dueDate: input.dueDate ?? null,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().positive(),
      title: z.string().trim().min(1).max(255).optional(),
      description: z.string().trim().nullable().optional(),
      category: categoryEnum.optional(),
      status: statusEnum.optional(),
      priority: priorityEnum.optional(),
      dueDate: z.coerce.date().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureCanModify(ctx, input.id);
      const { id, ...patch } = input;
      const updated = await db.updateActionItem(id, patch);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  complete: protectedProcedure
    .input(z.object({
      id: z.number().positive(),
      note: z.string().trim().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureCanModify(ctx, input.id);
      const updated = await db.completeActionItem(input.id, input.note);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ensureCanModify(ctx, input.id);
      await db.deleteActionItem(input.id);
      return { success: true };
    }),

  /**
   * Run the LLM insights service for a GP. Returns suggestions which
   * the FM can save into actual action items via `create`.
   */
  generateSuggestions: protectedProcedure
    .input(z.object({ gpId: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ensureCanReadGp(ctx, input.gpId);
      return generateInsights(input.gpId);
    }),

  /**
   * Public read-only listing for the GP portal. Resolves the GP from
   * the access token so we never trust client-supplied gpId.
   */
  listForPortalToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const tokenRecord = await db.getGpAccessTokenByToken(input.token);
      if (!tokenRecord || !tokenRecord.isActive) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
      }
      try {
        return await db.listActionItems({
          gpId: tokenRecord.gamePresenterId,
          includeAllStatuses: false,
        });
      } catch {
        // GP may have been deleted; return empty list gracefully
        return [];
      }
    }),
});
