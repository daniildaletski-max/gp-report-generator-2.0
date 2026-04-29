import { router, protectedProcedure, adminProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import {
  getBonusesForTeam,
  getBonusesForUser,
  getBonusesAll,
  getBonusForGp,
} from "../services/bonusService";

const monthYear = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

export const bonusRouter = router({
  /**
   * Bonuses for the user's visible scope:
   *   - admin: all GPs (or filtered by teamId)
   *   - non-admin: GPs the user owns (or filtered by their team)
   * Returns the per-GP report from bonusService.
   */
  list: protectedProcedure
    .input(monthYear.extend({ teamId: z.number().positive().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.teamId) {
        if (ctx.user.role !== "admin") {
          const team = await db.getFmTeamById(input.teamId);
          if (!team || team.userId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
        }
        return getBonusesForTeam(input.teamId, input.month, input.year);
      }
      if (ctx.user.role === "admin") {
        return getBonusesAll(input.month, input.year);
      }
      return getBonusesForUser(ctx.user.id, input.month, input.year);
    }),

  /**
   * Bonus for a specific GP — used by the GP Portal so a presenter can see
   * their own bonus standing. Caller must have access to that GP (admin,
   * the user who owns the GP, or the GP themselves via portal token —
   * this endpoint requires the caller to already have authenticated access
   * via the bearer flow upstream).
   */
  forGp: protectedProcedure
    .input(monthYear.extend({ gpId: z.number().positive() }))
    .query(async ({ ctx, input }) => {
      const gp = await db.getGamePresenterById(input.gpId);
      if (!gp) throw new TRPCError({ code: "NOT_FOUND", message: "GP not found" });
      if (ctx.user.role !== "admin" && gp.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const report = await getBonusForGp(input.gpId, input.month, input.year);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "GP not found" });
      return report;
    }),

  /**
   * Bonus for a GP authenticated via portal token — used by the public
   * GP Portal so a presenter sees their own monthly bonus on their landing
   * page. We resolve the GP from the token instead of trusting any input.
   */
  forPortalToken: publicProcedure
    .input(monthYear.extend({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const tokenRecord = await db.getGpAccessTokenByToken(input.token);
      if (!tokenRecord || !tokenRecord.isActive) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
      }
      // Touch last-access so admins can see when a GP last looked at the portal.
      await db.updateGpAccessTokenLastAccess(tokenRecord.id);
      const report = await getBonusForGp(tokenRecord.gamePresenterId, input.month, input.year);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "GP not found" });
      return report;
    }),
});
