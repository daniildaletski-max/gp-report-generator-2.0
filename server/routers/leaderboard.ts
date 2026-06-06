/**
 * Leaderboard router — company-wide GP ranking + analytics over the one
 * shared database. Any authenticated user can read it; GPs can see their
 * own standing through the public portal token.
 */
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { getLeaderboard } from "../services/leaderboardService";

const monthYear = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

export const leaderboardRouter = router({
  /** Full ranking + analytics for a month. */
  get: protectedProcedure
    .input(monthYear)
    .query(async ({ input }) => getLeaderboard(input.month, input.year)),

  /**
   * A single GP's standing for the public portal (resolved from the
   * access token). Returns the GP's rank, the field size, and their row.
   */
  rankForPortalToken: publicProcedure
    .input(monthYear.extend({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const tokenRecord = await db.getGpAccessTokenByToken(input.token);
      if (!tokenRecord || tokenRecord.isActive !== 1) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
      }
      const board = await getLeaderboard(input.month, input.year);
      const row = board.rows.find(r => r.gpId === tokenRecord.gamePresenterId) ?? null;
      return { rank: row?.rank ?? null, fieldSize: board.rows.length, row, companyAvg: board.analytics.avgTotal };
    }),
});
