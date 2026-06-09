/**
 * AI Executive Summary — synthesizes the deep analytics dimensions
 * (per-criterion strengths/weaknesses with MoM deltas, per-game
 * performance, score distribution, biggest movers) into a short narrative
 * for the company-wide monthly report.
 *
 * Architecture:
 *   - formatAnalyticsForPrompt() is PURE — it turns the analytics overview
 *     into a compact, deterministic prompt block. Unit-tested.
 *   - executiveSummaryUserPrompt() wraps the block with the
 *     report-specific instruction. Also PURE.
 *   - generateExecutiveSummary() is the LLM call (best-effort: empty
 *     string on failure, never throws so an AI hiccup can't break the
 *     report generation flow).
 *
 * Builds on top of the existing genManagementSummary/genGoals/genOverview
 * trio rather than replacing them — the FM keeps the existing 3 narrative
 * sections, plus this new synthesizing executive summary on top.
 */
import { invokeLLM } from "../_core/llm";
import { createLogger } from "../services/logger";
import { MONTH_NAMES, MAX_TOTAL_SCORE, COMPANY_NAME, SCORE_CONFIG } from "../../shared/const";
import type { AnalyticsOverview, CriterionStat, GroupStat, DistributionBucket, Mover } from "../db/analytics";

const log = createLogger("ExecSummary");

// ============================================
// PURE: shape the analytics into a prompt block
// ============================================

function fmtCriterion(c: CriterionStat): string {
  const cfg = SCORE_CONFIG[c.key];
  const max = cfg?.max ?? 0;
  const label = cfg?.label ?? c.key;
  const pct = max ? Math.round((c.avg / max) * 100) : 0;
  const delta = c.delta == null ? "n/a" : c.delta > 0 ? `+${c.delta.toFixed(1)}` : c.delta.toFixed(1);
  return `${label}: ${c.avg.toFixed(1)}/${max} (${pct}%, MoM ${delta})`;
}

function fmtGame(g: GroupStat): string {
  return `${g.name}: avg ${g.avgTotal.toFixed(1)}/${MAX_TOTAL_SCORE} across ${g.count} eval${g.count === 1 ? "" : "s"}`;
}

function fmtBucket(b: DistributionBucket): string {
  return `${b.label} (${b.min}-${b.max}): ${b.count}`;
}

function fmtMover(m: Mover, gpNames: Map<number, string>): string {
  const name = gpNames.get(m.gpId) ?? `GP #${m.gpId}`;
  const arrow = m.delta > 0 ? "+" : "";
  return `${name}: ${m.prevAvg.toFixed(1)} -> ${m.avg.toFixed(1)} (${arrow}${m.delta.toFixed(1)}, ${m.evals} eval${m.evals === 1 ? "" : "s"})`;
}

/**
 * Render an analytics overview as a compact, deterministic context block
 * the LLM can summarize. PURE — accepts a Map of gpId -> name so the same
 * function works in tests with literals or in prod with a real list.
 */
export function formatAnalyticsForPrompt(
  overview: AnalyticsOverview,
  gpNames: Map<number, string>,
): string {
  const { period, totalEvaluations, uniqueGps, avgTotal, criteria, games, distribution, movers } = overview;
  const monthLabel = MONTH_NAMES[period.month - 1];

  // Sort criteria by strongest vs weakest for the prompt: top 2 best, top 2
  // worst by percentage of max. We surface the explicit lists rather than
  // letting the LLM rank them so the narrative quotes the right names.
  const ranked = criteria
    .map(c => ({ c, pct: c.sampleSize > 0 && SCORE_CONFIG[c.key]?.max ? c.avg / SCORE_CONFIG[c.key].max : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const strongest = ranked.slice(0, 2).map(x => fmtCriterion(x.c));
  const weakest = ranked.slice(-2).reverse().map(x => fmtCriterion(x.c));

  const lines: string[] = [];
  lines.push(`Company: ${COMPANY_NAME}`);
  lines.push(`Period: ${monthLabel} ${period.year}`);
  lines.push("");
  lines.push("=== HEADLINE ===");
  lines.push(`Total evaluations: ${totalEvaluations}`);
  lines.push(`GPs evaluated: ${uniqueGps}`);
  lines.push(`Average total score: ${avgTotal.toFixed(1)}/${MAX_TOTAL_SCORE}`);
  lines.push("");
  lines.push("=== STRENGTHS (best-scoring criteria) ===");
  lines.push(...strongest.map(s => `- ${s}`));
  lines.push("");
  lines.push("=== FOCUS AREAS (weakest-scoring criteria) ===");
  lines.push(...weakest.map(s => `- ${s}`));
  lines.push("");
  lines.push("=== ALL CRITERIA ===");
  lines.push(...criteria.map(c => `- ${fmtCriterion(c)}`));
  lines.push("");
  lines.push("=== SCORE DISTRIBUTION ===");
  lines.push(...distribution.map(b => `- ${fmtBucket(b)}`));
  if (games.length > 0) {
    lines.push("");
    lines.push("=== PERFORMANCE BY GAME (top 5 by volume) ===");
    lines.push(...games.slice(0, 5).map(g => `- ${fmtGame(g)}`));
  }
  if (movers.improvers.length > 0) {
    lines.push("");
    lines.push("=== MOST IMPROVED (vs last month) ===");
    lines.push(...movers.improvers.slice(0, 3).map(m => `- ${fmtMover(m, gpNames)}`));
  }
  if (movers.decliners.length > 0) {
    lines.push("");
    lines.push("=== BIGGEST DROPS (vs last month) ===");
    lines.push(...movers.decliners.slice(0, 3).map(m => `- ${fmtMover(m, gpNames)}`));
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an experienced operations director writing the EXECUTIVE SUMMARY at the top of a company-wide monthly Game Presenter performance report.

Guidelines:
- 5-7 sentences. Professional, factual, no bullet points.
- Open with the headline figure (avg score, eval count, GP count). Then call out 1-2 specific strengths AND 1-2 specific focus areas using the actual criterion names and numbers from the data.
- If there are notable improvers or decliners, mention them by name.
- Close with a clear "what to work on next month" — one concrete focus, drawn from the weakest area.
- DO NOT invent names, numbers, or events.
- DO NOT use bullet points or headings — flowing prose only.
- If the period has zero evaluations, say so plainly in one sentence and stop.`;

/** Wrap a formatted analytics block in the report's user-side instruction. PURE. */
export function executiveSummaryUserPrompt(formattedContext: string): string {
  return `Write the executive summary for the report below.\n\n${formattedContext}`;
}

/**
 * Generate the executive summary via the LLM. Best-effort — returns null
 * on any failure so the surrounding report generation never aborts because
 * of an AI hiccup. The caller surfaces "summary unavailable" in that case.
 */
export async function generateExecutiveSummary(
  overview: AnalyticsOverview,
  gpNames: Map<number, string>,
): Promise<string | null> {
  if (overview.totalEvaluations === 0) {
    const m = MONTH_NAMES[overview.period.month - 1];
    return `No evaluations were recorded in ${m} ${overview.period.year}.`;
  }
  try {
    const formatted = formatAnalyticsForPrompt(overview, gpNames);
    const res = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: executiveSummaryUserPrompt(formatted) },
      ],
    });
    const content = res.choices[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch (err) {
    log.warn(`Executive summary generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
