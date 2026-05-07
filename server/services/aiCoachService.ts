/**
 * FM Copilot — AI Automation Service
 *
 * Generates day-to-day automation outputs that compress an FM's
 * morning prep / coaching prep / month-end review work into clicks:
 *
 *   • Daily Briefing — a personalised morning brief: top GPs to focus
 *     on today, why, suggested first move; quick-wins to recognise;
 *     risk alerts; team-level themes. Caches per (userId, day) so
 *     re-opening the page doesn't burn fresh LLM calls.
 *
 *   • Per-GP Coaching Brief — drilled-down 1:1 prep with talking
 *     points, citations to specific data, suggested action items the
 *     FM can save with one click.
 *
 *   • Monthly Review Draft — narrative paragraph + strengths + growth
 *     areas + delta vs last month + next-month goal, generated from
 *     all available data so the FM only has to edit and approve.
 *
 *   • Heuristic Risk Scorer — purely deterministic (no LLM) score per
 *     GP based on attendance trend + score trend + last-eval-age vs
 *     team median. Surfaces who's likely to slip BEFORE they actually
 *     do, and feeds the briefing's "Risk alerts" section.
 *
 * The service is intentionally read-only. Persisting suggestions as
 * action items, saving an edited monthly review, etc. are the
 * router's responsibility.
 */
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { createLogger } from "./logger";

const log = createLogger("AICoach");

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────
type Category = "appearance" | "performance" | "attitude" | "attendance" | "errors" | "general";
type Priority = "low" | "medium" | "high";
type RiskLevel = "low" | "watch" | "high";

export interface PriorityGp {
  gpId: number;
  gpName: string;
  /** Why this GP made the priority list — plain-English one-liner. */
  reason: string;
  /** What the FM should do next (verb-led, e.g. "Schedule a 5-minute check-in"). */
  suggestedAction: string;
  /** 0-100 risk score from the heuristic scorer. */
  riskScore: number;
  /** Risk bucket — drives badge colour. */
  risk: RiskLevel;
  /** Top metric concerns surfaced for context. */
  signals: string[];
}

export interface QuickWin {
  gpId: number;
  gpName: string;
  /** What got better — "Score up 12% this month", "0 mistakes vs 4 last month". */
  win: string;
  /** Suggested recognition — "Public shoutout in next standup". */
  suggestedRecognition: string;
}

export interface RiskAlert {
  gpId: number;
  gpName: string;
  /** Pattern detected — "3 sick days in last 7", "Score has dropped 4 weeks running". */
  pattern: string;
  severity: "watch" | "urgent";
}

export interface DailyBriefing {
  generatedAt: string;
  /** ISO date the briefing was generated for, e.g. 2026-05-07. Used for the cache key. */
  forDate: string;
  /** Plain-language opener — 1-2 sentences setting the tone. */
  opener: string;
  /** 2-4 GPs the FM should prioritise today. */
  priorityGps: PriorityGp[];
  /** GPs whose stats are improving — easy recognition wins. */
  quickWins: QuickWin[];
  /** Patterns flagging concern that aren't yet at the priority-action level. */
  riskAlerts: RiskAlert[];
  /** Team-level themes the FM should be aware of (e.g. "5 GPs late this week — check the rota"). */
  teamThemes: string[];
  /** Total GP count this briefing covered. */
  totalGps: number;
}

export interface CoachingBrief {
  gpId: number;
  gpName: string;
  generatedAt: string;
  /** 2-3 sentence executive summary. */
  tldr: string;
  /** Specific data points the talking points reference. */
  dataPoints: string[];
  /** 4-6 conversation talking points the FM can use as a 1:1 script. */
  talkingPoints: Array<{
    point: string;
    /** Why it matters — links to a metric. */
    why: string;
  }>;
  /** Tone hint — "celebratory" / "supportive" / "direct" / "corrective". */
  tone: "celebratory" | "supportive" | "direct" | "corrective";
  /** Suggested action items the FM can save with one click. */
  suggestedActions: Array<{
    title: string;
    description: string;
    category: Category;
    priority: Priority;
  }>;
}

export interface MonthlyReviewDraft {
  gpId: number;
  gpName: string;
  month: number;
  year: number;
  generatedAt: string;
  /** Markdown narrative the FM edits. */
  narrative: string;
  strengths: string[];
  growthAreas: string[];
  /** Concrete numeric movements vs the prior month. */
  deltas: Array<{ metric: string; previous: number; current: number; direction: "up" | "down" | "flat" }>;
  /** One concrete goal for next month. */
  nextMonthGoal: string;
}

// ────────────────────────────────────────────────────────────────────
// Heuristic Risk Scorer (no LLM — deterministic)
// ────────────────────────────────────────────────────────────────────
/**
 * Compute a risk score 0-100 for a GP. Higher = more likely to slip.
 *
 * Weights:
 *   - 35% attendance momentum (sick + missed + late vs prior month)
 *   - 35% score momentum (last 2 months avg trend)
 *   - 15% mistakes momentum
 *   - 15% data staleness (no eval in last 21 days)
 *
 * Pure heuristic — keeps cost / latency / explainability low and lets
 * us flag risk without burning LLM calls per GP per day.
 */
export interface RiskInputs {
  thisMonth: { sick: number; missed: number; late: number; mistakes: number; avgScore: number; evalCount: number };
  lastMonth: { sick: number; missed: number; late: number; mistakes: number; avgScore: number };
  daysSinceLastEval: number; // >999 if never evaluated
}

export function computeRiskScore(input: RiskInputs): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  // Attendance momentum
  const sickDelta = input.thisMonth.sick - input.lastMonth.sick;
  const missedDelta = input.thisMonth.missed - input.lastMonth.missed;
  const lateDelta = input.thisMonth.late - input.lastMonth.late;
  const attBudget = Math.min(35, Math.max(0,
    sickDelta * 5 + missedDelta * 7 + lateDelta * 3,
  ));
  score += attBudget;
  if (sickDelta >= 2) signals.push(`+${sickDelta} sick days vs last month`);
  if (missedDelta >= 1) signals.push(`+${missedDelta} missed days vs last month`);
  if (lateDelta >= 2) signals.push(`+${lateDelta} late events vs last month`);

  // Score momentum
  const scoreDelta = input.thisMonth.avgScore - input.lastMonth.avgScore;
  if (input.thisMonth.evalCount > 0 && input.lastMonth.avgScore > 0) {
    if (scoreDelta <= -1.5) {
      score += 35;
      signals.push(`Avg score down ${Math.abs(scoreDelta).toFixed(1)} vs last month`);
    } else if (scoreDelta <= -0.5) {
      score += 18;
      signals.push(`Avg score easing — ${Math.abs(scoreDelta).toFixed(1)} below last month`);
    }
  }

  // Mistakes momentum
  const mistakeDelta = input.thisMonth.mistakes - input.lastMonth.mistakes;
  if (mistakeDelta >= 5) {
    score += 15;
    signals.push(`+${mistakeDelta} mistakes this month`);
  } else if (mistakeDelta >= 2) {
    score += 8;
    signals.push(`+${mistakeDelta} mistakes vs last month`);
  }

  // Staleness — no eval in 3+ weeks
  if (input.daysSinceLastEval >= 21 && input.daysSinceLastEval < 999) {
    score += 15;
    signals.push(`No evaluation in ${input.daysSinceLastEval} days`);
  } else if (input.daysSinceLastEval >= 999) {
    score += 8;
    signals.push("Never evaluated");
  }

  return { score: Math.min(100, Math.round(score)), signals };
}

function bucketRisk(score: number): RiskLevel {
  if (score >= 50) return "high";
  if (score >= 25) return "watch";
  return "low";
}

// ────────────────────────────────────────────────────────────────────
// Snapshot building — pulls data once per GP for use by the AI prompts.
// ────────────────────────────────────────────────────────────────────
interface GpSnapshot {
  gpId: number;
  gpName: string;
  thisMonth: { sick: number; missed: number; late: number; mistakes: number; avgScore: number; evalCount: number };
  lastMonth: { sick: number; missed: number; late: number; mistakes: number; avgScore: number };
  daysSinceLastEval: number;
  recentEvalNotes?: string[];
  riskScore: number;
  risk: RiskLevel;
  signals: string[];
}

async function loadGpSnapshot(gpId: number): Promise<GpSnapshot | null> {
  const gp = await db.getGamePresenterById(gpId);
  if (!gp) return null;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const prev = new Date(year, month - 2, 1);
  const prevMonth = prev.getMonth() + 1;
  const prevYear = prev.getFullYear();

  const [thisAtt, lastAtt, thisStats, lastStats, history, evals] = await Promise.all([
    db.findAttendance(gpId, month, year),
    db.findAttendance(gpId, prevMonth, prevYear),
    db.getMonthlyGpStats(gpId, month, year),
    db.getMonthlyGpStats(gpId, prevMonth, prevYear),
    db.getGpMonthlyHistory(gpId, 2),
    db.getEvaluationsByGP(gpId).then(rs => rs.slice(0, 5)),
  ]);

  const thisAvg = history[history.length - 1]?.avgTotal ?? 0;
  const thisEvalCount = history[history.length - 1]?.evalCount ?? 0;
  const lastAvg = history[history.length - 2]?.avgTotal ?? 0;

  const lastEvalDate = evals[0]?.evaluationDate ? new Date(evals[0].evaluationDate as any) : null;
  const daysSinceLastEval = lastEvalDate
    ? Math.floor((now.getTime() - lastEvalDate.getTime()) / (24 * 60 * 60 * 1000))
    : 999;

  const riskInput: RiskInputs = {
    thisMonth: {
      sick: thisAtt?.sickLeaves ?? 0,
      missed: thisAtt?.missedDays ?? 0,
      late: thisAtt?.lateToWork ?? 0,
      mistakes: thisStats?.mistakes ?? 0,
      avgScore: thisAvg,
      evalCount: thisEvalCount,
    },
    lastMonth: {
      sick: lastAtt?.sickLeaves ?? 0,
      missed: lastAtt?.missedDays ?? 0,
      late: lastAtt?.lateToWork ?? 0,
      mistakes: lastStats?.mistakes ?? 0,
      avgScore: lastAvg,
    },
    daysSinceLastEval,
  };
  const { score, signals } = computeRiskScore(riskInput);
  return {
    gpId,
    gpName: gp.name,
    thisMonth: riskInput.thisMonth,
    lastMonth: riskInput.lastMonth,
    daysSinceLastEval,
    recentEvalNotes: evals
      .map(e => [e.gamePerformanceComment, e.dealingStyleComment, e.postureComment].filter(Boolean).join(" / "))
      .filter(s => s.length > 0)
      .slice(0, 3) as string[],
    riskScore: score,
    risk: bucketRisk(score),
    signals,
  };
}

// ────────────────────────────────────────────────────────────────────
// Daily Briefing
// ────────────────────────────────────────────────────────────────────
const DAILY_BRIEFING_SCHEMA = {
  name: "fm_daily_briefing",
  strict: true,
  schema: {
    type: "object",
    properties: {
      opener: { type: "string", description: "1-2 sentences setting the tone for the day." },
      priorityGps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            gpId: { type: "number" },
            gpName: { type: "string" },
            reason: { type: "string", description: "Why this GP is priority — cite the specific number." },
            suggestedAction: { type: "string", description: "Verb-led, what the FM should do next." },
          },
          required: ["gpId", "gpName", "reason", "suggestedAction"],
          additionalProperties: false,
        },
      },
      quickWins: {
        type: "array",
        items: {
          type: "object",
          properties: {
            gpId: { type: "number" },
            gpName: { type: "string" },
            win: { type: "string" },
            suggestedRecognition: { type: "string" },
          },
          required: ["gpId", "gpName", "win", "suggestedRecognition"],
          additionalProperties: false,
        },
      },
      teamThemes: { type: "array", items: { type: "string" } },
    },
    required: ["opener", "priorityGps", "quickWins", "teamThemes"],
    additionalProperties: false,
  },
};

/**
 * Compose a personalised morning briefing for an FM. We prefilter the
 * GP pool with the heuristic risk scorer (cheap, deterministic) and
 * only ask the LLM to narrate the top candidates — keeps the prompt
 * small and the output decisive instead of bloated with 50 rows.
 */
export async function generateDailyBriefing(opts: {
  userId: number;
  userRole: string;
  /** Optional team filter — if absent we briefing every team the user owns. */
  teamId?: number;
}): Promise<DailyBriefing> {
  const isAdmin = opts.userRole === "admin";
  // Pull all GPs the user can see.
  let gps: { id: number; name: string; teamId: number | null }[];
  if (isAdmin) {
    gps = await db.getAllGamePresenters();
  } else {
    gps = await db.getAllGamePresentersByUser(opts.userId);
  }
  if (opts.teamId) gps = gps.filter(g => g.teamId === opts.teamId);

  // Build snapshots in parallel — capped at 60 GPs per briefing to keep
  // latency and cost bounded; an FM rarely owns more than 30-40 anyway.
  const capped = gps.slice(0, 60);
  const snapshots = (await Promise.all(capped.map(g => loadGpSnapshot(g.id))))
    .filter((s): s is GpSnapshot => s !== null);

  // Top 5 by risk → priority candidates.
  const sortedByRisk = [...snapshots].sort((a, b) => b.riskScore - a.riskScore);
  const priorityCandidates = sortedByRisk.slice(0, 5).filter(s => s.riskScore >= 25);

  // Quick wins: score is up vs last month AND eval count this month >= 1.
  const quickWinCandidates = snapshots
    .filter(s => s.thisMonth.evalCount > 0 && s.lastMonth.avgScore > 0
      && s.thisMonth.avgScore - s.lastMonth.avgScore >= 0.7)
    .sort((a, b) => (b.thisMonth.avgScore - b.lastMonth.avgScore) - (a.thisMonth.avgScore - a.lastMonth.avgScore))
    .slice(0, 3);

  // Risk alerts: medium-risk patterns not already in priority list.
  const watchList = sortedByRisk
    .filter(s => s.risk === "watch" && !priorityCandidates.some(p => p.gpId === s.gpId))
    .slice(0, 4);
  const riskAlerts: RiskAlert[] = watchList.map(s => ({
    gpId: s.gpId,
    gpName: s.gpName,
    pattern: s.signals[0] ?? "Subtle pattern shift",
    severity: s.riskScore >= 40 ? "urgent" : "watch",
  }));

  // If there's nothing to talk about, return a deterministic briefing
  // (no LLM call) — saves cost and avoids the model inventing problems.
  if (priorityCandidates.length === 0 && quickWinCandidates.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      forDate: new Date().toISOString().slice(0, 10),
      opener: snapshots.length === 0
        ? "No GPs assigned yet — add team members on the Team page to start receiving briefings."
        : "Calm day — no GPs flagged for priority attention. Stay on top of the routine evals.",
      priorityGps: [],
      quickWins: [],
      riskAlerts,
      teamThemes: snapshots.length > 0 && riskAlerts.length === 0 ? ["All GPs are tracking steady this week."] : [],
      totalGps: snapshots.length,
    };
  }

  // Compose the LLM prompt with the prefiltered candidates only.
  const promptData = {
    priorityCandidates: priorityCandidates.map(s => ({
      gpId: s.gpId, gpName: s.gpName,
      riskScore: s.riskScore, signals: s.signals,
      thisMonth: s.thisMonth, lastMonth: s.lastMonth,
      daysSinceLastEval: s.daysSinceLastEval,
    })),
    quickWinCandidates: quickWinCandidates.map(s => ({
      gpId: s.gpId, gpName: s.gpName,
      thisAvg: s.thisMonth.avgScore, lastAvg: s.lastMonth.avgScore,
      mistakeDelta: s.thisMonth.mistakes - s.lastMonth.mistakes,
    })),
    teamWindow: { totalGps: snapshots.length, watchListCount: watchList.length },
  };

  const systemPrompt = `You are FM Copilot — an AI assistant for floor managers running a team of game presenters in a live casino.
Your job: generate a brief, personalised morning briefing in JSON.

CONSTRAINTS
- Use ONLY the candidates supplied in the input — do not invent GPs or numbers.
- Each priority "reason" must cite a specific number from the input ("3 sick days vs last month", "score down 1.4").
- Each "suggestedAction" is verb-led, achievable today, max 12 words ("Schedule 10-min check-in", "Send positive feedback in writing").
- "opener" is 1-2 conversational sentences. Keep it human, not corporate.
- "teamThemes" lists 0-3 patterns that span multiple GPs (e.g. "3 GPs late this week — check the rota"). Empty array if no theme is obvious.
- Output JSON only.`;

  const userPrompt = `Briefing input:\n${JSON.stringify(promptData, null, 2)}`;

  let parsed: { opener: string; priorityGps: Array<{ gpId: number; gpName: string; reason: string; suggestedAction: string }>; quickWins: Array<{ gpId: number; gpName: string; win: string; suggestedRecognition: string }>; teamThemes: string[] };
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_schema", json_schema: DAILY_BRIEFING_SCHEMA },
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Empty LLM response");
    parsed = JSON.parse(content);
  } catch (err) {
    log.error("Daily briefing LLM failed — falling back to deterministic output",
      err instanceof Error ? err : new Error(String(err)));
    // Deterministic fallback so the FM never sees an empty briefing
    // when the LLM is down or rate-limited.
    parsed = {
      opener: priorityCandidates.length > 0
        ? `${priorityCandidates.length} GP${priorityCandidates.length === 1 ? "" : "s"} need a closer look today.`
        : "Steady day ahead — focus on routine evals.",
      priorityGps: priorityCandidates.map(s => ({
        gpId: s.gpId, gpName: s.gpName,
        reason: s.signals[0] ?? "Risk pattern detected",
        suggestedAction: s.daysSinceLastEval >= 21 ? "Schedule next evaluation" : "Schedule a 5-minute check-in",
      })),
      quickWins: quickWinCandidates.map(s => ({
        gpId: s.gpId, gpName: s.gpName,
        win: `Score up ${(s.thisMonth.avgScore - s.lastMonth.avgScore).toFixed(1)} vs last month`,
        suggestedRecognition: "Send a quick recognition message",
      })),
      teamThemes: [],
    };
  }

  // Merge LLM narration with our deterministic risk metadata.
  const priorityGps: PriorityGp[] = parsed.priorityGps.slice(0, 4).map(p => {
    const snap = priorityCandidates.find(s => s.gpId === p.gpId);
    return {
      gpId: p.gpId,
      gpName: p.gpName,
      reason: p.reason,
      suggestedAction: p.suggestedAction,
      riskScore: snap?.riskScore ?? 0,
      risk: snap ? bucketRisk(snap.riskScore) : "low",
      signals: snap?.signals ?? [],
    };
  });
  const quickWins: QuickWin[] = parsed.quickWins.slice(0, 3);

  return {
    generatedAt: new Date().toISOString(),
    forDate: new Date().toISOString().slice(0, 10),
    opener: parsed.opener,
    priorityGps,
    quickWins,
    riskAlerts,
    teamThemes: parsed.teamThemes ?? [],
    totalGps: snapshots.length,
  };
}

// ────────────────────────────────────────────────────────────────────
// Coaching Brief — drilled-down 1:1 prep
// ────────────────────────────────────────────────────────────────────
const COACHING_BRIEF_SCHEMA = {
  name: "fm_coaching_brief",
  strict: true,
  schema: {
    type: "object",
    properties: {
      tldr: { type: "string", description: "2-3 sentence executive summary." },
      dataPoints: { type: "array", items: { type: "string" } },
      talkingPoints: {
        type: "array",
        items: {
          type: "object",
          properties: {
            point: { type: "string", description: "What to say (talking-point form, ~15 words)." },
            why: { type: "string", description: "Why it matters — link to a metric." },
          },
          required: ["point", "why"],
          additionalProperties: false,
        },
      },
      tone: { type: "string", enum: ["celebratory", "supportive", "direct", "corrective"] },
      suggestedActions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            category: { type: "string", enum: ["appearance", "performance", "attitude", "attendance", "errors", "general"] },
            priority: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["title", "description", "category", "priority"],
          additionalProperties: false,
        },
      },
    },
    required: ["tldr", "dataPoints", "talkingPoints", "tone", "suggestedActions"],
    additionalProperties: false,
  },
};

export async function generateCoachingBrief(gpId: number): Promise<CoachingBrief> {
  const snap = await loadGpSnapshot(gpId);
  if (!snap) throw new Error("GP not found");

  const systemPrompt = `You are FM Copilot, generating a 1:1 coaching brief for a Floor Manager.
The brief is what the FM will read 5 minutes before sitting down with the GP.

CONSTRAINTS
- Cite specific numbers from the data when justifying any point.
- talkingPoints: 4-6 items, each ~15 words. They should follow a coherent arc (open → specific feedback → ask GP perspective → next step).
- Pick a tone that matches the data: "celebratory" if the GP is improving across the board, "supportive" if struggling but trying, "direct" if there's a clear performance gap, "corrective" if there are disciplinary signals (multiple late, mistakes spike).
- suggestedActions: 1-3 items the FM can save as action items. Each must address a specific data point, not generic advice.
- Output JSON only.`;

  const userPrompt = `GP snapshot:\n${JSON.stringify({
    gp: { name: snap.gpName },
    thisMonth: snap.thisMonth,
    lastMonth: snap.lastMonth,
    daysSinceLastEval: snap.daysSinceLastEval,
    riskScore: snap.riskScore,
    riskSignals: snap.signals,
    recentEvalNotes: snap.recentEvalNotes,
  }, null, 2)}`;

  let parsed: Omit<CoachingBrief, "gpId" | "gpName" | "generatedAt">;
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_schema", json_schema: COACHING_BRIEF_SCHEMA },
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Empty LLM response");
    parsed = JSON.parse(content);
  } catch (err) {
    log.error("Coaching brief LLM failed", err instanceof Error ? err : new Error(String(err)), { gpId });
    throw new Error("Failed to generate coaching brief");
  }

  return {
    gpId,
    gpName: snap.gpName,
    generatedAt: new Date().toISOString(),
    tldr: parsed.tldr,
    dataPoints: parsed.dataPoints.slice(0, 8),
    talkingPoints: parsed.talkingPoints.slice(0, 6),
    tone: parsed.tone,
    suggestedActions: parsed.suggestedActions.slice(0, 3),
  };
}

// ────────────────────────────────────────────────────────────────────
// Monthly Review Draft
// ────────────────────────────────────────────────────────────────────
const MONTHLY_REVIEW_SCHEMA = {
  name: "fm_monthly_review",
  strict: true,
  schema: {
    type: "object",
    properties: {
      narrative: { type: "string", description: "Markdown narrative — 3-5 paragraphs covering the month." },
      strengths: { type: "array", items: { type: "string" } },
      growthAreas: { type: "array", items: { type: "string" } },
      nextMonthGoal: { type: "string", description: "One specific goal — measurable, achievable in the month." },
    },
    required: ["narrative", "strengths", "growthAreas", "nextMonthGoal"],
    additionalProperties: false,
  },
};

export async function generateMonthlyReviewDraft(opts: {
  gpId: number;
  month: number;
  year: number;
}): Promise<MonthlyReviewDraft> {
  const gp = await db.getGamePresenterById(opts.gpId);
  if (!gp) throw new Error("GP not found");

  // Pull this-month + prior-month metrics for delta computation.
  const prev = new Date(opts.year, opts.month - 2, 1);
  const prevMonth = prev.getMonth() + 1;
  const prevYear = prev.getFullYear();

  const [thisAtt, lastAtt, thisStats, lastStats, history, evals] = await Promise.all([
    db.findAttendance(opts.gpId, opts.month, opts.year),
    db.findAttendance(opts.gpId, prevMonth, prevYear),
    db.getMonthlyGpStats(opts.gpId, opts.month, opts.year),
    db.getMonthlyGpStats(opts.gpId, prevMonth, prevYear),
    db.getGpMonthlyHistory(opts.gpId, 4),
    db.getEvaluationsByGPAndMonth(opts.gpId, opts.month, opts.year),
  ]);

  const thisRow = history.find(h => h.month === opts.month && h.year === opts.year)
    ?? { avgTotal: 0, avgAppearance: 0, avgPerformance: 0, evalCount: 0 };
  const lastRow = history.find(h => h.month === prevMonth && h.year === prevYear)
    ?? { avgTotal: 0, avgAppearance: 0, avgPerformance: 0, evalCount: 0 };

  const dir = (a: number, b: number): "up" | "down" | "flat" =>
    Math.abs(a - b) < 0.05 ? "flat" : a > b ? "up" : "down";

  const deltas = [
    { metric: "Total score (avg)", previous: lastRow.avgTotal, current: thisRow.avgTotal, direction: dir(thisRow.avgTotal, lastRow.avgTotal) },
    { metric: "Appearance score (avg)", previous: lastRow.avgAppearance, current: thisRow.avgAppearance, direction: dir(thisRow.avgAppearance, lastRow.avgAppearance) },
    { metric: "Performance score (avg)", previous: lastRow.avgPerformance, current: thisRow.avgPerformance, direction: dir(thisRow.avgPerformance, lastRow.avgPerformance) },
    { metric: "Mistakes", previous: lastStats?.mistakes ?? 0, current: thisStats?.mistakes ?? 0, direction: dir(thisStats?.mistakes ?? 0, lastStats?.mistakes ?? 0) },
    { metric: "Sick days", previous: lastAtt?.sickLeaves ?? 0, current: thisAtt?.sickLeaves ?? 0, direction: dir(thisAtt?.sickLeaves ?? 0, lastAtt?.sickLeaves ?? 0) },
    { metric: "Late events", previous: lastAtt?.lateToWork ?? 0, current: thisAtt?.lateToWork ?? 0, direction: dir(thisAtt?.lateToWork ?? 0, lastAtt?.lateToWork ?? 0) },
  ] as MonthlyReviewDraft["deltas"];

  const systemPrompt = `You are FM Copilot, drafting a monthly performance review for a game presenter.
The Floor Manager will edit and approve — make the draft good enough to use mostly as-is.

CONSTRAINTS
- "narrative" is markdown, 3-5 paragraphs. Open with a 1-line summary of the month, then dig into specifics with citations to numbers.
- "strengths" and "growthAreas" each list 2-4 short bullet points. Strengths cite an improvement or consistent good number; growth areas cite a slip or gap.
- "nextMonthGoal" is ONE specific, measurable goal achievable in 30 days (e.g. "Reduce mistakes from 6 to <=3").
- If the data is sparse (no evals this month), say so and keep the review short. Don't pad.
- Output JSON only.`;

  const userPrompt = `Review for ${gp.name}, ${new Date(opts.year, opts.month - 1).toLocaleString("en-US", { month: "long", year: "numeric" })}\n\n${JSON.stringify({
    deltas, evalCount: evals.length,
    notes: evals.slice(0, 5).map(e => ({
      date: e.evaluationDate,
      total: e.totalScore,
      gamePerformanceComment: e.gamePerformanceComment,
      dealingStyleComment: e.dealingStyleComment,
      postureComment: e.postureComment,
    })),
    attitude: thisStats?.attitude,
    notesFromFM: thisStats?.notes ?? null,
  }, null, 2)}`;

  let parsed: { narrative: string; strengths: string[]; growthAreas: string[]; nextMonthGoal: string };
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_schema", json_schema: MONTHLY_REVIEW_SCHEMA },
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Empty LLM response");
    parsed = JSON.parse(content);
  } catch (err) {
    log.error("Monthly review draft LLM failed", err instanceof Error ? err : new Error(String(err)), { gpId: opts.gpId });
    throw new Error("Failed to generate monthly review draft");
  }

  return {
    gpId: opts.gpId,
    gpName: gp.name,
    month: opts.month,
    year: opts.year,
    generatedAt: new Date().toISOString(),
    narrative: parsed.narrative,
    strengths: parsed.strengths.slice(0, 6),
    growthAreas: parsed.growthAreas.slice(0, 6),
    deltas,
    nextMonthGoal: parsed.nextMonthGoal,
  };
}
