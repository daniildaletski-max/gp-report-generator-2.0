/**
 * Report Narratives Service
 *
 * The "writing" side of the monthly report. Takes a structured team
 * snapshot (already aggregated metrics + per-GP rows + prior-month
 * deltas) and produces the narrative pieces that go into the report:
 *
 *   - Executive summary — 1-paragraph board-ready opener.
 *   - Top wins — markdown bullet list of 3-5 standout positives.
 *   - Top concerns — markdown bullet list of 3-5 issues to address.
 *   - Per-GP reviews — per-GP narrative + suggested next-month focus.
 *
 * Used by BOTH the on-demand `report.generate` tRPC procedure and the
 * scheduled monthly cron, so the content is identical regardless of
 * trigger. Each generator runs as its own LLM call with strict JSON
 * schema validation; failures are logged and a best-effort fallback
 * value is returned so the report never fails outright.
 */
import { invokeLLM } from "../_core/llm";
import { createLogger } from "./logger";

const log = createLogger("ReportNarratives");

// ────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────
export interface MonthDelta {
  current: number;
  previous: number;
  /** "up" / "down" / "flat" — the direction the metric moved. */
  direction: "up" | "down" | "flat";
}

export interface PerGpRow {
  gpId: number;
  gpName: string;
  avgScore: number;
  appearanceScore: number;
  gamePerformanceScore: number;
  evaluationCount: number;
  errorCount: number;
  attitudePositive: number;
  attitudeNegative: number;
  lateArrivals: number;
  missedDays: number;
  sickDays: number;
  /** prior-month avg score (0 if missing) */
  prevAvgScore: number;
}

export interface ReportSnapshot {
  teamName: string;
  fmName: string;
  monthName: string;
  year: number;
  totalGps: number;
  averages: {
    total: MonthDelta;
    appearance: MonthDelta;
    gamePerf: MonthDelta;
  };
  totals: {
    evaluations: MonthDelta;
    mistakes: MonthDelta;
    sickDays: MonthDelta;
    missedDays: MonthDelta;
    lateArrivals: MonthDelta;
    extraShifts: MonthDelta;
  };
  /** Sorted by riskScore desc — most concerning first. */
  perGp: PerGpRow[];
}

export interface PerGpReview {
  gpId: number;
  gpName: string;
  /** 2-3 sentence narrative — cites numbers. */
  narrative: string;
  /** One concrete focus area for the next month. */
  focusForNextMonth: string;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────
function fmtDelta(d: MonthDelta, decimals = 1): string {
  const diff = d.current - d.previous;
  const sign = diff > 0 ? "+" : "";
  return `${d.current.toFixed(decimals)} (${sign}${diff.toFixed(decimals)} vs prev)`;
}

function buildSnapshotContext(s: ReportSnapshot): string {
  const lines: string[] = [
    `Team: ${s.teamName}`,
    `Floor Manager: ${s.fmName}`,
    `Period: ${s.monthName} ${s.year}`,
    `Total GPs in scope: ${s.totalGps}`,
    "",
    "=== AVERAGES (this month → vs prev month) ===",
    `Total score: ${fmtDelta(s.averages.total)} / 22`,
    `Appearance score: ${fmtDelta(s.averages.appearance)} / 12`,
    `Game performance score: ${fmtDelta(s.averages.gamePerf)} / 10`,
    "",
    "=== TOTALS (this month → vs prev month) ===",
    `Evaluations: ${fmtDelta(s.totals.evaluations, 0)}`,
    `Mistakes: ${fmtDelta(s.totals.mistakes, 0)}`,
    `Sick days: ${fmtDelta(s.totals.sickDays, 0)}`,
    `Missed days: ${fmtDelta(s.totals.missedDays, 0)}`,
    `Late arrivals: ${fmtDelta(s.totals.lateArrivals, 0)}`,
    `Extra shifts: ${fmtDelta(s.totals.extraShifts, 0)}`,
    "",
    "=== PER-GP BREAKDOWN ===",
    ...s.perGp.map(g => {
      const trend = g.prevAvgScore > 0
        ? ` (prev ${g.prevAvgScore.toFixed(1)}, ${(g.avgScore - g.prevAvgScore >= 0 ? "+" : "")}${(g.avgScore - g.prevAvgScore).toFixed(1)})`
        : "";
      return `- ${g.gpName} | ${g.evaluationCount} evals | score ${g.avgScore.toFixed(1)}/22${trend} | mistakes ${g.errorCount} | attitude +${g.attitudePositive}/-${g.attitudeNegative} | late ${g.lateArrivals} | missed ${g.missedDays} | sick ${g.sickDays}`;
    }),
  ];
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────
// Executive summary
// ────────────────────────────────────────────────────────────────────
const EXEC_SCHEMA = {
  name: "exec_summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "2-4 sentence executive summary. Open with the headline (overall trend), name 1-2 specific GPs with cited numbers, end with the recommended next-month focus. Plain prose, no bullet points.",
      },
    },
    required: ["summary"],
    additionalProperties: false,
  },
};

export async function generateExecutiveSummary(s: ReportSnapshot): Promise<string> {
  const systemPrompt = `You are writing the Executive Summary of a casino operations monthly report. The reader is the Operations Director — they want to read this and know whether the team is on track WITHOUT opening the spreadsheet.

Rules:
- Use only facts present in the snapshot.
- Cite at least 2 specific numbers (a delta vs last month + a per-GP example).
- Open with the headline (e.g. "Stable month with appearance scores rising"). Don't start with "This month" generically.
- 2-4 sentences total. No bullet points. No "I" or "we".`;
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Snapshot:\n${buildSnapshotContext(s)}` },
      ],
      response_format: { type: "json_schema", json_schema: EXEC_SCHEMA },
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Empty LLM response");
    const parsed = JSON.parse(content) as { summary: string };
    return parsed.summary;
  } catch (err) {
    log.warn(`Executive summary LLM failed — fallback in use: ${err instanceof Error ? err.message : String(err)}`);
    // Deterministic fallback so the field never ends up null.
    const dir = s.averages.total.direction;
    const word = dir === "up" ? "improving" : dir === "down" ? "softening" : "holding steady";
    return `${s.teamName} is ${word} in ${s.monthName}: average team score ${fmtDelta(s.averages.total)} across ${s.totals.evaluations.current} evaluations of ${s.totalGps} GPs. Mistakes ${fmtDelta(s.totals.mistakes, 0)} and attendance issues ${fmtDelta(s.totals.lateArrivals, 0)} late events. Focus next month on the GPs flagged in the Per-GP Reviews sheet.`;
  }
}

// ────────────────────────────────────────────────────────────────────
// Top wins / concerns
// ────────────────────────────────────────────────────────────────────
const WINS_CONCERNS_SCHEMA = {
  name: "wins_concerns",
  strict: true,
  schema: {
    type: "object",
    properties: {
      wins: {
        type: "array",
        items: { type: "string" },
        description: "3-5 short bullets, each citing a specific GP or metric movement.",
      },
      concerns: {
        type: "array",
        items: { type: "string" },
        description: "3-5 short bullets, each citing a specific GP or metric movement.",
      },
    },
    required: ["wins", "concerns"],
    additionalProperties: false,
  },
};

export async function generateTopWinsConcerns(s: ReportSnapshot): Promise<{ wins: string; concerns: string }> {
  const systemPrompt = `You are writing the "Top Wins" and "Top Concerns" sections of a casino operations monthly report.

Rules:
- 3-5 bullets per section.
- Every bullet cites a specific GP name OR a specific metric movement vs prior month.
- "Wins": positive movements, top performers, recognition-worthy facts.
- "Concerns": negative movements, GPs to address, attendance/discipline issues.
- Each bullet is a short imperative or descriptive sentence (max ~15 words).
- Use only facts in the snapshot. Don't invent names or numbers.`;
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Snapshot:\n${buildSnapshotContext(s)}` },
      ],
      response_format: { type: "json_schema", json_schema: WINS_CONCERNS_SCHEMA },
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Empty LLM response");
    const parsed = JSON.parse(content) as { wins: string[]; concerns: string[] };
    return {
      wins: parsed.wins.slice(0, 5).map(w => `- ${w}`).join("\n"),
      concerns: parsed.concerns.slice(0, 5).map(c => `- ${c}`).join("\n"),
    };
  } catch (err) {
    log.warn(`Wins/concerns LLM failed — fallback in use: ${err instanceof Error ? err.message : String(err)}`);
    // Heuristic fallback — pick top 3 by score and bottom 3.
    const sortedByScore = [...s.perGp].filter(g => g.evaluationCount > 0).sort((a, b) => b.avgScore - a.avgScore);
    const top = sortedByScore.slice(0, 3);
    const bottom = sortedByScore.slice(-3).reverse();
    return {
      wins: top.map(g => `- ${g.gpName} averaged ${g.avgScore.toFixed(1)}/22 across ${g.evaluationCount} evaluations.`).join("\n"),
      concerns: bottom.map(g => `- ${g.gpName} averaged ${g.avgScore.toFixed(1)}/22 — flagged for follow-up.`).join("\n"),
    };
  }
}

// ────────────────────────────────────────────────────────────────────
// Per-GP reviews — one short narrative per GP, ordered by riskiest first
// ────────────────────────────────────────────────────────────────────
const PER_GP_SCHEMA = {
  name: "per_gp_reviews",
  strict: true,
  schema: {
    type: "object",
    properties: {
      reviews: {
        type: "array",
        items: {
          type: "object",
          properties: {
            gpId: { type: "number" },
            gpName: { type: "string" },
            narrative: { type: "string", description: "2-3 sentence review citing this month's specific numbers." },
            focusForNextMonth: { type: "string", description: "One concrete, measurable focus item, max 12 words." },
          },
          required: ["gpId", "gpName", "narrative", "focusForNextMonth"],
          additionalProperties: false,
        },
      },
    },
    required: ["reviews"],
    additionalProperties: false,
  },
};

export async function generatePerGpReviews(s: ReportSnapshot): Promise<PerGpReview[]> {
  if (s.perGp.length === 0) return [];

  // Cap at 30 GPs per LLM call — well within prompt limits and most
  // teams are <20. If a team is bigger we just skip the tail; the
  // Excel "Data" sheet still has them.
  const capped = s.perGp.slice(0, 30);
  const systemPrompt = `You are writing per-GP performance reviews for a casino operations monthly report. The Floor Manager will read these one by one and use them as discussion points.

Rules:
- Each narrative is 2-3 sentences and cites at least one specific number from the GP's data.
- Each focusForNextMonth is ONE concrete, measurable item (e.g. "Reduce mistakes from 4 to <=2", not "Be better").
- Match the tone to the data: improving GPs get celebratory framing, struggling ones get honest-but-supportive framing.
- Output exactly one review per GP supplied — do NOT skip any.
- Use only facts in the snapshot. Don't invent numbers.
- Preserve the supplied gpId values exactly.`;

  const reducedSnapshot = capped.map(g => ({
    gpId: g.gpId,
    gpName: g.gpName,
    avgScore: g.avgScore,
    prevAvgScore: g.prevAvgScore,
    evaluationCount: g.evaluationCount,
    appearanceScore: g.appearanceScore,
    gamePerformanceScore: g.gamePerformanceScore,
    errorCount: g.errorCount,
    attitudePositive: g.attitudePositive,
    attitudeNegative: g.attitudeNegative,
    lateArrivals: g.lateArrivals,
    missedDays: g.missedDays,
    sickDays: g.sickDays,
  }));

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate one review per GP (${capped.length} total):\n${JSON.stringify(reducedSnapshot, null, 2)}` },
      ],
      response_format: { type: "json_schema", json_schema: PER_GP_SCHEMA },
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Empty LLM response");
    const parsed = JSON.parse(content) as { reviews: PerGpReview[] };
    // Defensive: re-stamp gpId/gpName from the source snapshot in case
    // the LLM dropped or renamed any.
    return parsed.reviews.map(r => {
      const src = capped.find(g => g.gpId === r.gpId);
      return {
        gpId: src?.gpId ?? r.gpId,
        gpName: src?.gpName ?? r.gpName,
        narrative: r.narrative,
        focusForNextMonth: r.focusForNextMonth,
      };
    });
  } catch (err) {
    log.warn(`Per-GP reviews LLM failed — heuristic fallback: ${err instanceof Error ? err.message : String(err)}`);
    // Heuristic fallback — every GP gets a deterministic 1-line review.
    return capped.map(g => {
      const trendWord = g.prevAvgScore > 0
        ? (g.avgScore - g.prevAvgScore >= 0.5 ? "up from" : g.avgScore - g.prevAvgScore <= -0.5 ? "down from" : "vs")
        : null;
      const trendStr = trendWord ? `, ${trendWord} ${g.prevAvgScore.toFixed(1)}` : "";
      return {
        gpId: g.gpId,
        gpName: g.gpName,
        narrative: g.evaluationCount === 0
          ? `No evaluations this month — schedule one before next cycle.`
          : `Averaged ${g.avgScore.toFixed(1)}/22 across ${g.evaluationCount} evaluations${trendStr}. ${g.errorCount > 0 ? `Logged ${g.errorCount} mistakes.` : "No mistakes logged."} Attitude +${g.attitudePositive}/-${g.attitudeNegative}.`,
        focusForNextMonth: g.errorCount >= 3
          ? `Reduce mistakes from ${g.errorCount} to <=${Math.max(1, Math.floor(g.errorCount / 2))}`
          : g.lateArrivals >= 3
          ? `Cut late arrivals from ${g.lateArrivals} to 0`
          : g.evaluationCount === 0
          ? "Complete first evaluation"
          : g.attitudeNegative > g.attitudePositive
          ? "Address attitude pattern in 1:1"
          : "Maintain current performance",
      };
    });
  }
}

// ────────────────────────────────────────────────────────────────────
// One-shot — runs all four LLM calls in parallel and returns the bundle.
// ────────────────────────────────────────────────────────────────────
export interface NarrativeBundle {
  executiveSummary: string;
  topWins: string;
  topConcerns: string;
  perGpReviews: PerGpReview[];
}

export async function generateAllNarratives(s: ReportSnapshot): Promise<NarrativeBundle> {
  const [exec, wc, perGp] = await Promise.all([
    generateExecutiveSummary(s),
    generateTopWinsConcerns(s),
    generatePerGpReviews(s),
  ]);
  return {
    executiveSummary: exec,
    topWins: wc.wins,
    topConcerns: wc.concerns,
    perGpReviews: perGp,
  };
}
