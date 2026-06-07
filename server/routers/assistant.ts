/**
 * Built-in assistant — natural-language Q&A over the studio's data.
 *
 * Deliberately uses context-injection (not tool-calling): we assemble a
 * compact, READ-ONLY company-wide snapshot (headline stats, a full GP
 * scoreboard, the auto-detected insights, coaching stats + open items,
 * recent reports) and ground the LLM on it. That keeps answers factual,
 * keeps the model from touching any data, and needs no function-calling
 * round-trips. One shared database — everyone sees the whole studio.
 */
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { COMPANY_NAME } from "@shared/const";
import { createLogger } from "../services/logger";

const log = createLogger("Assistant");

async function buildSnapshot(user: { id: number; name: string | null; role: string }) {
  const snap: Record<string, unknown> = {
    now: new Date().toISOString(),
    user: { name: user.name, role: user.role },
  };

  const now = new Date();
  const cm = now.getMonth() + 1;
  const cy = now.getFullYear();
  const lmDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lm = lmDate.getMonth() + 1;
  const lmy = lmDate.getFullYear();

  // Headline performance + a full last-month GP scoreboard (names + avg
  // scores) so the assistant can answer "who's lowest?", "how is X doing?",
  // "list the GPs", etc. directly from the data.
  try {
    const [curStats, lastStats] = await Promise.all([
      db.getGPMonthlyStats(null, cy, cm),
      db.getGPMonthlyStats(null, lmy, lm),
    ]);
    const summarize = (stats: typeof curStats) => {
      if (!stats.length) return null;
      const avg = stats.reduce((s, g) => s + Number(g.avgTotalScore || 0), 0) / stats.length;
      return { gpsEvaluated: stats.length, avgScore: Number(avg.toFixed(1)) };
    };
    snap.thisMonth = summarize(curStats);
    snap.lastMonth = summarize(lastStats);
    snap.gpScoreboardLastMonth = [...lastStats]
      .sort((a, b) => Number(b.avgTotalScore || 0) - Number(a.avgTotalScore || 0))
      .map(g => ({ gp: g.gpName, avg: Number(Number(g.avgTotalScore || 0).toFixed(1)), evals: Number(g.evaluationCount) }));
  } catch { /* omit */ }

  // Full roster so existence/list questions are answerable.
  try {
    const gps = await db.getAllGamePresenters();
    snap.roster = gps.map(g => g.name);
  } catch { /* omit */ }

  try {
    const insights = await db.computeDashboardInsights({});
    snap.insights = insights.map((i) => ({
      severity: i.severity,
      title: i.title,
      detail: i.description,
      gp: i.metadata?.gpName,
    }));
  } catch { /* omit */ }

  try {
    snap.coachingStats = await db.getActionItemStats({});
    const items = await db.listActionItems({});
    snap.openCoachingItems = items.slice(0, 25).map((it) => ({
      gp: it.gamePresenter?.name,
      title: it.title,
      priority: it.priority,
      status: it.status,
      due: it.dueDate ?? undefined,
    }));
  } catch { /* omit */ }

  try {
    const reports = await db.getReportsWithTeams();
    snap.recentReports = reports.slice(0, 6).map((r) => ({
      period: `${r.report.reportMonth}/${r.report.reportYear}`,
      status: r.report.status,
    }));
  } catch { /* omit */ }

  return snap;
}

export const assistantRouter = router({
  ask: protectedProcedure
    .input(z.object({
      question: z.string().trim().min(1).max(2000),
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      })).max(16).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const snapshot = await buildSnapshot(ctx.user);

      const system = `You are the built-in assistant for ${COMPANY_NAME}, a live-casino game-presenter (GP) evaluation and reporting tool used by floor managers and admins. One shared database — you can see the whole studio.
Answer the question using ONLY the JSON snapshot below. Be concise and concrete — cite the actual GP names and numbers from the snapshot. If the answer isn't in the snapshot, say so briefly and point them to where to look (open a GP profile, the Reports page, the Command Center, or the Workspace to evaluate). Never invent data, names or scores. Prefer short bullet lists. Today is ${new Date().toDateString()}.

DATA SNAPSHOT (JSON):
${JSON.stringify(snapshot)}`;

      const messages = [
        { role: "system" as const, content: system },
        ...(input.history ?? []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: input.question },
      ];

      try {
        const res = await invokeLLM({ messages, responseFormat: { type: "text" } });
        const content = res.choices[0]?.message?.content;
        const answer = typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.map((c) => ("text" in c ? c.text : "")).join("")
            : "";
        return { answer: answer.trim() || "I couldn't find an answer in your current data. Try rephrasing." };
      } catch (err) {
        log.error("assistant.ask failed", err instanceof Error ? err : new Error(String(err)));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The assistant is unavailable right now." });
      }
    }),
});
