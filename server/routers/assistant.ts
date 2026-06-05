/**
 * Built-in assistant — natural-language Q&A over the user's own data.
 *
 * Deliberately uses context-injection (not tool-calling): we assemble a
 * compact, READ-ONLY, user-scoped snapshot (their teams, the computed
 * insights, coaching stats + open items) and ground the LLM on it. That
 * keeps answers factual, keeps the model from touching any data, and
 * needs no function-calling round-trips. Scoped exactly like the rest of
 * the app — non-admins only ever see their own teams.
 */
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { createLogger } from "../services/logger";

const log = createLogger("Assistant");

async function buildSnapshot(user: { id: number; name: string | null; role: string }) {
  const isAdmin = user.role === "admin";
  const scope = isAdmin ? undefined : user.id;
  const snap: Record<string, unknown> = {
    now: new Date().toISOString(),
    user: { name: user.name, role: user.role },
  };

  try {
    const teams = isAdmin ? await db.getAllFmTeams() : await db.getFmTeamsByUser(user.id);
    snap.teams = teams.map((t) => ({ id: t.id, name: t.teamName, floorManager: t.floorManagerName }));
  } catch { /* omit on failure — partial context is fine */ }

  try {
    const insights = await db.computeDashboardInsights({ userId: scope, userRole: user.role });
    snap.insights = insights.map((i) => ({
      severity: i.severity,
      title: i.title,
      detail: i.description,
      gp: i.metadata?.gpName,
      team: i.metadata?.teamName,
    }));
  } catch { /* omit */ }

  try {
    snap.coachingStats = await db.getActionItemStats({ userId: scope });
    const items = await db.listActionItems({ userId: scope });
    snap.openCoachingItems = items.slice(0, 25).map((it) => ({
      gp: it.gamePresenter?.name,
      title: it.title,
      priority: it.priority,
      status: it.status,
      due: it.dueDate ?? undefined,
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

      const system = `You are the built-in assistant for a Game Presenter (GP) evaluation tool used by Floor Managers and admins.
Answer the question using ONLY the JSON snapshot of the user's current data below. Be concise and concrete — cite the GP / team names and the actual numbers from the snapshot. If the answer is not in the snapshot, say so briefly and point them to where to look (open a GP profile, sync Persona, check the Reports page, the Review queue, etc.). Never invent data, names or scores. Prefer short bullet lists. Today is ${new Date().toDateString()}.

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
