import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";

/**
 * Company goals — monthly management targets + live progress. One shared
 * database: a single set of targets covers every GP, so any authenticated
 * user can read the overview; only admins set targets.
 */
export const goalsRouter = router({
  /** Targets + live actuals + per-metric progress/status for a month. */
  overview: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12).optional(),
      year: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const now = new Date();
      const month = input?.month ?? now.getMonth() + 1;
      const year = input?.year ?? now.getFullYear();
      return db.getGoalsOverview(month, year, now);
    }),

  /** Create or update the month's targets. Null clears a target
   *  (= stop tracking that metric); omitted fields stay unchanged. */
  update: adminProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2100),
      targetAvgScore: z.number().min(1).max(22).nullable().optional(),
      targetCoveragePct: z.number().int().min(1).max(100).nullable().optional(),
      targetEvalsPerGp: z.number().int().min(1).max(100).optional(),
      targetMaxMistakes: z.number().int().min(0).max(100).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { month, year, ...patch } = input;
      const saved = await db.upsertCompanyGoals(month, year, patch, ctx.user.id);
      return { success: !!saved, goals: saved };
    }),
});
