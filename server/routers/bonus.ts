/**
 * Bonus Router — exposes the performance-bonus reports computed by
 * `bonusService` (which implements docs/bonus-calculation.md).
 *
 * Scope mirrors the rest of the app:
 *   - admin: all GPs (or one team via teamId)
 *   - FM: GPs they own (or their team via teamId)
 *   - GP: their own bonus via the public portal token
 */
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import {
  getBonusesAll,
  getBonusesForUser,
  getBonusesForTeam,
  getBonusForGp,
} from "../services/bonusService";

const monthYear = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

export const bonusRouter = router({
  /**
   * Bonus list for the caller's visible scope. Optional `teamId` narrows
   * to one team (ownership-checked for non-admins).
   */
  list: protectedProcedure
    .input(monthYear.extend({ teamId: z.number().int().positive().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.teamId) {
        if (ctx.user.role !== "admin") {
          const team = await db.getFmTeamById(input.teamId);
          if (!team) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
        }
        return getBonusesForTeam(input.teamId, input.month, input.year);
      }
      if (ctx.user.role === "admin") return getBonusesAll(input.month, input.year);
      return getBonusesForUser(ctx.user.id, input.month, input.year);
    }),

  /** Bonus for one GP (caller must own it, or be admin). */
  forGp: protectedProcedure
    .input(monthYear.extend({ gpId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const gp = await db.getGamePresenterById(input.gpId);
      if (!gp) throw new TRPCError({ code: "NOT_FOUND", message: "GP not found" });
      const report = await getBonusForGp(input.gpId, input.month, input.year);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "GP not found" });
      return report;
    }),

  /**
   * Bonus for a GP authenticated via portal token — lets a presenter see
   * their own monthly bonus on the public portal. We resolve the GP from
   * the token, never from caller-supplied ids.
   */
  forPortalToken: publicProcedure
    .input(monthYear.extend({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const tokenRecord = await db.getGpAccessTokenByToken(input.token);
      if (!tokenRecord || tokenRecord.isActive !== 1) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
      }
      await db.updateGpAccessTokenLastAccess(tokenRecord.id);
      const report = await getBonusForGp(tokenRecord.gamePresenterId, input.month, input.year);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "GP not found" });
      return report;
    }),
});
