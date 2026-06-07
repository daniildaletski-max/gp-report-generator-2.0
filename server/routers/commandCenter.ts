/**
 * Command Center — the operations cockpit's server side.
 *
 *   - briefing:  a cached, LLM-written executive summary of the studio's
 *                current state (reuses the company report data context +
 *                the auto-detected insight signals).
 *   - bulkCoach: turn a multi-selection of GPs into saved AI coaching
 *                plans in one action (generateInsights → action items).
 *
 * One shared database — everything here is company-wide.
 */
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { buildCompanyReportContext } from "./_shared";
import { generateInsights } from "../services/insightsService";
import { COMPANY_NAME } from "@shared/const";
import { createLogger } from "../services/logger";

const log = createLogger("Router");

/**
 * Daily in-memory cache for the executive briefing. One LLM round-trip
 * per (month, year, UTC-day); the dashboard can poll/refetch for free in
 * between. Restarts wipe it — it's a cost-saver, not storage.
 */
type Briefing = {
  generatedAt: Date;
  briefing: string;
  dataMonth: number;
  dataYear: number;
  insightCount: number;
};
const briefingCache = new Map<string, Briefing>();

export const commandCenterRouter = router({
  /**
   * Executive briefing — a 4–6 sentence narrative of where the studio
   * stands right now, synthesised from the month's company-wide data and
   * the auto-detected insight signals. Cached per day.
   */
  briefing: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12).optional(),
      year: z.number().min(2020).max(2100).optional(),
    }).optional())
    .query(async ({ input }): Promise<Briefing> => {
      const now = new Date();
      let month = input?.month ?? (now.getMonth() + 1);
      let year = input?.year ?? now.getFullYear();

      const dayStamp = now.toISOString().slice(0, 10);
      const cacheKey = `${year}-${month}-${dayStamp}`;
      const cached = briefingCache.get(cacheKey);
      if (cached) return cached;

      let context = await buildCompanyReportContext(month, year);
      // Early in a fresh month there may be no data yet — fall back to the
      // previous month so the briefing isn't empty (only when the caller
      // didn't pin a specific month).
      if (context.stats.length === 0 && input?.month == null) {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        month = lm.getMonth() + 1;
        year = lm.getFullYear();
        context = await buildCompanyReportContext(month, year);
      }

      const insights = await db.computeDashboardInsights({});
      const insightLines = insights.slice(0, 10).map(i => `- [${i.severity}] ${i.title}`).join("\n");

      let briefing = "";
      try {
        const res = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are the operations director of ${COMPANY_NAME}, a live-casino game-presenter studio. Write a sharp executive briefing on the studio's current state for the management team.

Guidelines:
- 4-6 sentences. No bullet points. No preamble like "Here is" — start with the substance.
- Lead with the single most important thing right now.
- Cover: the overall performance trend, who is excelling, and what or who needs attention (scores, errors, attitude, attendance, evaluation coverage). End with the one action to take this week.
- Cite specific names and numbers from the data. Do NOT invent anything; if something isn't in the data, don't claim it.
- Professional, direct, confident.`,
            },
            {
              role: "user",
              content: `Company performance data:\n${context.dataContext}\n\n=== AUTO-DETECTED SIGNALS ===\n${insightLines || "No notable signals detected."}`,
            },
          ],
        });
        const content = res.choices[0]?.message?.content;
        briefing = typeof content === "string" ? content : "";
      } catch (e) {
        log.error("Executive briefing generation failed", e instanceof Error ? e : new Error(String(e)));
      }

      const result: Briefing = {
        generatedAt: new Date(),
        briefing,
        dataMonth: month,
        dataYear: year,
        insightCount: insights.length,
      };
      // Only cache a successful generation so a transient LLM failure can
      // be retried on the next load.
      if (briefing) briefingCache.set(cacheKey, result);
      return result;
    }),

  /**
   * Bulk AI coaching — for each selected GP, ask the LLM for coaching
   * suggestions and save the top ones as open action items (source
   * ai_insight). Sequential on purpose: each GP is an LLM round-trip, and
   * a 25-GP parallel burst would trip the rate limit.
   */
  bulkCoach: protectedProcedure
    .input(z.object({
      gpIds: z.array(z.number().positive()).min(1).max(25),
      maxPerGp: z.number().min(1).max(4).default(2),
    }))
    .mutation(async ({ ctx, input }) => {
      const results: Array<
        | { gpId: number; gpName: string; created: number }
        | { gpId: number; gpName: string; error: string }
      > = [];

      for (const gpId of input.gpIds) {
        try {
          const insights = await generateInsights(gpId);
          const gp = await db.getGamePresenterById(gpId);
          // Pin the item to the GP's owner so it lands on the right board;
          // attribute creation to the caller.
          const ownerId = gp?.userId ?? ctx.user.id;
          const top = insights.suggestions.slice(0, input.maxPerGp);
          let created = 0;
          for (const s of top) {
            await db.createActionItem({
              gamePresenterId: gpId,
              userId: ownerId,
              createdById: ctx.user.id,
              title: s.title,
              description: `${s.description}\n\nAuto-generated coaching plan from the Command Center. Mark it done after the conversation.`,
              category: s.category,
              priority: s.priority,
              source: "ai_insight",
              status: "open",
            });
            created++;
          }
          results.push({ gpId, gpName: insights.gpName, created });
        } catch (e) {
          const gp = await db.getGamePresenterById(gpId).catch(() => null);
          log.warn(`bulkCoach failed for GP ${gpId}`, { error: e instanceof Error ? e.message : String(e) });
          results.push({ gpId, gpName: gp?.name ?? `GP #${gpId}`, error: e instanceof Error ? e.message : String(e) });
        }
      }

      const created = results.reduce((sum, r) => sum + ("created" in r ? r.created : 0), 0);
      const failed = results.filter(r => "error" in r).length;
      return {
        results,
        totals: { gps: input.gpIds.length, succeeded: input.gpIds.length - failed, failed, created },
      };
    }),
});
