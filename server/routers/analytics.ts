import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getAnalyticsOverview } from "../db/analytics";

/**
 * Analytics router — company-wide deep-dive intelligence (per-criterion,
 * per-game, per-evaluator, distribution). One shared database, so any
 * authenticated user sees the same company view; no per-team scoping.
 */
export const analyticsRouter = router({
  overview: protectedProcedure
    .input(
      z.object({
        month: z.number().min(1).max(12).optional(),
        year: z.number().optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      const now = new Date();
      const month = input?.month ?? now.getMonth() + 1;
      const year = input?.year ?? now.getFullYear();
      return getAnalyticsOverview(month, year);
    }),
});
