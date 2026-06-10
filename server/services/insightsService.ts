/**
 * Insights Service
 *
 * Pulls a snapshot of one GP's recent performance (scores, mistakes,
 * attitude, attendance) and asks the LLM to produce 2–4 specific,
 * actionable coaching suggestions. The shape matches what the
 * `actionItems` table stores so a single click in the UI can persist
 * a suggestion as a real action item.
 *
 * The service is intentionally read-only — it never writes to the DB.
 * Persisting a suggestion is the router's job.
 */
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { createLogger } from "./logger";

const log = createLogger("Insights");

type Category = "appearance" | "performance" | "attitude" | "attendance" | "errors" | "general";
type Priority = "low" | "medium" | "high";

export interface CoachingSuggestion {
  title: string;
  description: string;
  category: Category;
  priority: Priority;
}

export interface InsightsResult {
  gpId: number;
  gpName: string;
  generatedAt: string;
  /** Plain-English summary — appears at the top of the AI panel. */
  summary: string;
  /** Concrete suggestions the FM can save as action items with one click. */
  suggestions: CoachingSuggestion[];
}

const RESPONSE_SCHEMA = {
  name: "coaching_insights",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "2–3 sentences describing the GP's recent trajectory. Plain language, no fluff.",
      },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short imperative title, max 80 chars." },
            description: { type: "string", description: "1–2 sentences explaining the action and why it matters." },
            category: { type: "string", enum: ["appearance", "performance", "attitude", "attendance", "errors", "general"] },
            priority: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["title", "description", "category", "priority"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "suggestions"],
    additionalProperties: false,
  },
};

export async function generateInsights(gpId: number): Promise<InsightsResult> {
  const gp = await db.getGamePresenterById(gpId);
  if (!gp) throw new Error("GP not found");

  // Pull 3-month snapshot — deep enough to see a trend, narrow enough to
  // keep the prompt cheap.
  const trend = await db.getGpMonthlyHistory(gpId, 3);
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const [stats, attendance, recentEvals] = await Promise.all([
    db.getMonthlyGpStats(gpId, month, year),
    db.getOrCreateAttendance(gpId, month, year),
    db.getEvaluationsByGP(gpId).then(rows => rows.slice(0, 5)),
  ]);

  // Compact the data for the prompt — we only need the metrics, not the
  // full DB rows.
  const snapshot = {
    gp: { name: gp.name },
    threeMonthTrend: trend.map(m => ({
      label: m.label,
      avgTotal: m.avgTotal,
      avgAppearance: m.avgAppearance,
      avgPerformance: m.avgPerformance,
      evalCount: m.evalCount,
      mistakes: m.mistakes ?? 0,
    })),
    currentMonth: {
      mistakes: stats?.mistakes ?? 0,
      attitude: stats?.attitude ?? null,
      totalGames: stats?.totalGames ?? 0,
      attendance: {
        extraShifts: attendance.extraShifts ?? 0,
        lateToWork: attendance.lateToWork ?? 0,
        missedDays: attendance.missedDays ?? 0,
        sickLeaves: attendance.sickLeaves ?? 0,
      },
    },
    recentEvaluationScores: recentEvals.map(e => ({
      date: e.evaluationDate,
      total: e.totalScore,
      appearance: e.appearanceScore,
      performance: e.gamePerformanceTotalScore,
      hairComment: e.hairComment,
      makeupComment: e.makeupComment,
      outfitComment: e.outfitComment,
      postureComment: e.postureComment,
      dealingStyleComment: e.dealingStyleComment,
      gamePerformanceComment: e.gamePerformanceComment,
    })),
  };

  const systemPrompt = `You are a coaching assistant for Floor Managers in a live game-presenter operation.
Your job: read the snapshot of one Game Presenter's recent metrics and return 2–4 concrete, actionable coaching suggestions tailored to *this* GP, plus a short summary of their trajectory.

GUIDELINES
- Cite specific numbers from the snapshot when justifying a suggestion (e.g. "appearance dropped from 10.2 to 8.4 in 2 months").
- Each suggestion must be specific enough to act on this week, not generic ("be better"). Examples of good titles:
  * "Schedule grooming review — appearance scores down 18%"
  * "Reduce procedure errors with dealing-style refresher session"
  * "Address 3 late incidents this month before they become a pattern"
- Pick the right \`category\` for each suggestion — it must match the metric domain that's slipping.
- \`priority\` reflects urgency: high = disciplinary risk, medium = consistent decline, low = nice-to-have polish.
- If the GP looks fine across the board, return ONE "general" suggestion celebrating the trend and recommending what to keep doing — do not invent problems.
- Do NOT include suggestions for issues with no supporting data in the snapshot.
- Output JSON exactly matching the schema. No prose outside it.`;

  const userPrompt = `GP performance snapshot:\n${JSON.stringify(snapshot, null, 2)}`;

  let raw: string;
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    });
    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("Empty LLM response");
    }
    raw = content;
  } catch (err) {
    log.error("LLM call failed for insights", err instanceof Error ? err : new Error(String(err)), { gpId });
    throw new Error("Failed to generate insights");
  }

  let parsed: { summary: string; suggestions: CoachingSuggestion[] };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.error("LLM returned non-JSON", err instanceof Error ? err : new Error(String(err)), { gpId, raw: raw.slice(0, 500) });
    throw new Error("LLM returned invalid JSON");
  }

  // Defensive: cap suggestions to 4 in case the LLM ignores the prompt.
  const suggestions = (parsed.suggestions ?? []).slice(0, 4);

  return {
    gpId,
    gpName: gp.name,
    generatedAt: new Date().toISOString(),
    summary: parsed.summary ?? "",
    suggestions,
  };
}
