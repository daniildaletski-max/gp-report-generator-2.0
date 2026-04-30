/**
 * Reusable presentational components for the GP Portal page.
 *
 * These were inline in `GPPortal.tsx` until extraction. No behaviour
 * change in the move — just a code organisation step that lets the
 * orchestrator file shrink as new tabbed sections are added.
 */
import { useEffect, useState } from "react";
import {
  Star, Eye, Scissors, TrendingUp, TrendingDown, Info, ChevronLeft, ChevronRight,
  Target, Calendar, Clock, AlertTriangle, ThumbsUp, Flame, Crown, Sparkles, Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MONTH_NAMES } from "../../../../shared/const";

// ============================================================================
// Performance Pulse hero — dramatic full-width hero block intended to replace
// the existing thin tier banner. Surfaces the GP's status at a glance:
//   - Large circular progress ring sized off the overall score
//   - Animated counter that rolls up to the current value on mount
//   - Tier name + icon centred inside the ring
//   - Three insight chips (delta vs prev / streak / last evaluation)
// One block, one visual moment — meant to feel substantially different
// from the prior thin banner. No new dependencies.
// ============================================================================

function useCountUp(target: number, durationMs = 900): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - k, 3); // ease-out cubic
      setVal(target * eased);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return val;
}

export function PerformancePulseHero({
  gpFirstName,
  greeting,
  avgScore,
  maxScore,
  evaluationsCount,
  tierName,
  tierAccent,
  TierIcon,
  delta,
  deltaLabel,
  cleanStreak,
  lastEvaluationDate,
}: {
  gpFirstName: string;
  greeting: string;
  avgScore: number;
  maxScore: number;
  evaluationsCount: number;
  tierName: string;
  /** tailwind classes for the gradient ring stroke + glow halo */
  tierAccent: string;
  TierIcon: typeof Star;
  delta: number | null;
  deltaLabel: string | null;
  cleanStreak: number;
  lastEvaluationDate: Date | null;
}) {
  const animated = useCountUp(avgScore, 900);
  const pct = maxScore > 0 ? Math.min(100, Math.max(0, (avgScore / maxScore) * 100)) : 0;
  const radius = 86;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 shadow-md">
      {/* Backdrop layer — ambient gradient + soft amber halo behind ring */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-amber-50" aria-hidden />
      <div className={`absolute -top-24 -right-20 h-72 w-72 rounded-full blur-3xl opacity-40 bg-gradient-to-br ${tierAccent}`} aria-hidden />

      <div className="relative grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 sm:gap-8 p-6 sm:p-8 items-center">
        {/* Ring + tier badge */}
        <div className="relative h-48 w-48 mx-auto md:mx-0 shrink-0">
          <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
            <defs>
              <linearGradient id="pulseRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#f97316" />
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="url(#pulseRing)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`mb-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-gradient-to-br ${tierAccent} text-white shadow-sm`}>
              <TierIcon className="h-3 w-3" />
              {tierName}
            </div>
            <div className="text-5xl font-bold text-slate-900 tabular-nums leading-none">
              {animated.toFixed(1)}
            </div>
            <div className="text-xs text-slate-400 mt-1">/ {maxScore}</div>
          </div>
        </div>

        {/* Greeting + insight chips */}
        <div className="space-y-3">
          <div>
            <p className="text-xs sm:text-sm text-slate-500 uppercase tracking-wider font-medium">{greeting}</p>
            <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 leading-tight">
              {gpFirstName}'s <span className="text-amber-600">performance pulse</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {evaluationsCount} evaluation{evaluationsCount !== 1 ? "s" : ""} on record · keep stacking the wins
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {delta !== null && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
                delta >= 0
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-rose-50 border-rose-200 text-rose-700"
              }`}>
                {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {delta >= 0 ? "+" : ""}{delta.toFixed(1)} pts {deltaLabel ? `vs ${deltaLabel}` : ""}
              </span>
            )}
            {cleanStreak >= 2 && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
                cleanStreak >= 5
                  ? "bg-violet-50 border-violet-200 text-violet-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}>
                {cleanStreak >= 5 ? <Crown className="h-3.5 w-3.5" /> : <Flame className="h-3.5 w-3.5" />}
                {cleanStreak} perfect in a row
              </span>
            )}
            {lastEvaluationDate && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border bg-slate-50 border-slate-200 text-slate-700">
                <Zap className="h-3.5 w-3.5" />
                Last eval {formatDistanceToNow(lastEvaluationDate, { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Score card — large metric display with tooltip + status pill + progress bar
// ============================================================================

export function ScoreCard({ score, maxScore, label, icon: Icon, accentColor, bgColor, tooltip, delta, trend, sparkColor }: {
  score: number; maxScore: number; label: string; icon: typeof Star; accentColor: string; bgColor: string; tooltip?: string;
  /** Month-over-month delta vs previous month with data. `null` = hide chip. */
  delta?: number | null;
  /** Sequence of monthly values for the inline sparkline. Empty = hide chart. */
  trend?: Array<{ value: number }>;
  /** Stroke colour for the sparkline. Defaults to amber. */
  sparkColor?: string;
}) {
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const [showTooltip, setShowTooltip] = useState(false);

  const getStatus = () => {
    if (percentage >= 90) return { text: 'Excellent', color: 'text-emerald-600', badge: 'bg-emerald-50 border-emerald-200 text-emerald-700' };
    if (percentage >= 80) return { text: 'Great', color: 'text-green-600', badge: 'bg-green-50 border-green-200 text-green-700' };
    if (percentage >= 70) return { text: 'Good', color: 'text-amber-600', badge: 'bg-amber-50 border-amber-200 text-amber-700' };
    return { text: 'Needs Work', color: 'text-red-600', badge: 'bg-red-50 border-red-200 text-red-700' };
  };
  const status = getStatus();
  const showDelta = typeof delta === "number" && delta !== 0;

  return (
    <div className={`relative overflow-hidden rounded-2xl ${bgColor} p-5 sm:p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 group hover:-translate-y-0.5`}>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-2.5 rounded-xl border ${accentColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            {tooltip && (
              <div className="relative">
                <button
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="p-1 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                </button>
                {showTooltip && (
                  <div className="absolute right-0 top-7 z-50 w-48 p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 shadow-lg">
                    {tooltip}
                    <div className="absolute -top-1 right-3 w-2 h-2 bg-white border-l border-t border-slate-200 rotate-45" />
                  </div>
                )}
              </div>
            )}
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.badge}`}>{status.text}</span>
          </div>
        </div>
        <div className="mb-3">
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className="text-3xl sm:text-4xl font-bold text-slate-900">{score.toFixed(1)}</span>
            <span className="text-lg text-slate-400">/{maxScore}</span>
            {showDelta && (
              <span className={`ml-1 inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full border ${
                (delta as number) > 0
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-rose-50 border-rose-200 text-rose-700"
              }`}>
                {(delta as number) > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {(delta as number) > 0 ? "+" : ""}{(delta as number).toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">{label}</p>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {trend && trend.length >= 2 && (
          <div className="mt-3 h-10 -mx-1" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                <defs>
                  <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparkColor || "#f59e0b"} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={sparkColor || "#f59e0b"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={sparkColor || "#f59e0b"}
                  strokeWidth={1.75}
                  fill={`url(#spark-${label})`}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Achievement badge — locked/unlocked tile shown in the achievements grid
// ============================================================================

export function AchievementBadge({ icon: Icon, title, description, unlocked, color }: {
  icon: typeof Star; title: string; description: string; unlocked: boolean; color: string;
}) {
  return (
    <div className={`relative p-4 rounded-xl border transition-all duration-300 group ${
      unlocked
        ? `${color} shadow-sm hover:shadow-md hover:scale-[1.02]`
        : 'bg-slate-50 border-slate-200 opacity-60 grayscale'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl transition-all ${unlocked ? 'bg-white/80 border border-slate-200' : 'bg-slate-100'}`}>
          <Icon className={`h-5 w-5 ${unlocked ? 'text-slate-700' : 'text-slate-400'}`} />
        </div>
        <div>
          <p className={`font-semibold text-sm ${unlocked ? 'text-slate-800' : 'text-slate-400'}`}>{title}</p>
          <p className={`text-xs ${unlocked ? 'text-slate-500' : 'text-slate-400'}`}>{description}</p>
        </div>
      </div>
      {unlocked && (
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-sm">
          <span className="text-[10px] text-white font-bold">✓</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Stat card — compact metric tile shown in the monthly stats grid
// ============================================================================

export function StatCard({ icon: Icon, value, label, color, trend }: {
  icon: typeof Eye; value: string | number; label: string; color: string; trend?: number;
}) {
  return (
    <div className={`relative ${color} rounded-2xl border border-slate-200 overflow-hidden group hover:shadow-md transition-all duration-300`}>
      <div className="p-4 sm:p-5 relative">
        <div className="flex items-center gap-3 sm:gap-4 relative">
          <div className="bg-white/80 p-2.5 sm:p-3 rounded-xl shrink-0 shadow-sm border border-slate-200">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-slate-700" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-2xl sm:text-3xl font-bold text-slate-900">{value}</p>
              {trend !== undefined && trend !== 0 && (
                <div className={`flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full ${trend > 0 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
                  {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{trend > 0 ? '+' : ''}{trend.toFixed(1)}</span>
                </div>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 truncate">{label}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Labeled comment — used inside expanded evaluation detail rows
// ============================================================================

export function LabeledComment({ icon: Icon, label, comment, score, maxScore }: {
  icon: typeof Scissors; label: string; comment: string | null; score: number | null; maxScore: number;
}) {
  if (!comment) return null;
  return (
    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-medium text-slate-500">{label}</span>
        </div>
        {score !== null && (
          <span className={`text-xs font-bold ${
            (score / maxScore) >= 0.9 ? 'text-emerald-600' :
            (score / maxScore) >= 0.7 ? 'text-amber-600' : 'text-red-600'
          }`}>{score}/{maxScore}</span>
        )}
      </div>
      <p className="text-sm text-slate-700 leading-relaxed">{comment}</p>
    </div>
  );
}

// ============================================================================
// Month selector — back/forward arrows around the displayed month/year
// Used by the monthly details panel.
// ============================================================================

export function MonthSelector({ selectedMonth, selectedYear, onChange }: {
  selectedMonth: number; selectedYear: number;
  onChange: (month: number, year: number) => void;
}) {
  const handlePrev = () => {
    if (selectedMonth === 1) {
      onChange(12, selectedYear - 1);
    } else {
      onChange(selectedMonth - 1, selectedYear);
    }
  };
  const handleNext = () => {
    const now = new Date();
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    if (nextYear > now.getFullYear() || (nextYear === now.getFullYear() && nextMonth > now.getMonth() + 1)) return;
    onChange(nextMonth, nextYear);
  };

  const now = new Date();
  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePrev}
        className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
      >
        <ChevronLeft className="h-4 w-4 text-slate-600" />
      </button>
      <div className="px-4 py-2 rounded-xl bg-white border border-slate-200 min-w-[160px] text-center shadow-sm">
        <span className="text-sm font-medium text-slate-800">
          {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
        </span>
      </div>
      <button
        onClick={handleNext}
        disabled={isCurrentMonth}
        className={`p-2 rounded-lg border transition-colors shadow-sm ${
          isCurrentMonth
            ? 'bg-slate-50 border-slate-100 cursor-not-allowed'
            : 'bg-white border-slate-200 hover:bg-slate-50'
        }`}
      >
        <ChevronRight className={`h-4 w-4 ${isCurrentMonth ? 'text-slate-300' : 'text-slate-600'}`} />
      </button>
    </div>
  );
}

// ============================================================================
// Action plan card — shows open/in-progress coaching items for the GP
// ============================================================================

const PLAN_CATEGORY_TONE: Record<string, string> = {
  appearance: "border-emerald-200 bg-emerald-50",
  performance: "border-violet-200 bg-violet-50",
  attitude: "border-pink-200 bg-pink-50",
  attendance: "border-blue-200 bg-blue-50",
  errors: "border-rose-200 bg-rose-50",
  general: "border-slate-200 bg-slate-50",
};

// ============================================================================
// Streak chip — small gamification element shown next to the hero. Motivates
// the GP by surfacing "N days clean" or "M consecutive evaluations without an
// error". Single chip, no card chrome — meant to ride alongside other badges.
// ============================================================================

export function StreakChip({ days, label, tone = "amber" }: {
  days: number;
  label?: string;
  tone?: "amber" | "emerald" | "violet";
}) {
  if (days <= 0) return null;
  const palette =
    tone === "emerald" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
    tone === "violet" ? "bg-violet-50 border-violet-200 text-violet-700" :
    "bg-amber-50 border-amber-200 text-amber-700";
  const Icon = tone === "violet" ? Crown : Flame;
  const text = label ?? `${days}-day streak`;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${palette}`}>
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}

// ============================================================================
// Month header — large prominent header for the Month tab with prev/next
// navigation, the month name in big type, and a one-line summary. Replaces
// the cramped inline `MonthSelector` and gives the bug-fix-visible Month tab
// the visual prominence the user complained was missing.
// ============================================================================

export function MonthTabHeader({ selectedMonth, selectedYear, onChange, evalCount, errorCount, attitudeScore }: {
  selectedMonth: number; selectedYear: number;
  onChange: (month: number, year: number) => void;
  evalCount: number;
  errorCount: number;
  attitudeScore: number;
}) {
  const handlePrev = () => {
    if (selectedMonth === 1) onChange(12, selectedYear - 1);
    else onChange(selectedMonth - 1, selectedYear);
  };
  const handleNext = () => {
    const now = new Date();
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    if (nextYear > now.getFullYear() || (nextYear === now.getFullYear() && nextMonth > now.getMonth() + 1)) return;
    onChange(nextMonth, nextYear);
  };
  const now = new Date();
  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();
  const monthLabel = MONTH_NAMES[selectedMonth - 1];

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrev}
            className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4 text-slate-600" />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Viewing</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
              {monthLabel} <span className="text-slate-400 font-normal">{selectedYear}</span>
            </h2>
          </div>
          <button
            onClick={handleNext}
            disabled={isCurrentMonth}
            className={`p-2 rounded-lg border transition-colors shadow-sm ${
              isCurrentMonth ? 'bg-slate-50 border-slate-100 cursor-not-allowed' : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
            aria-label="Next month"
          >
            <ChevronRight className={`h-4 w-4 ${isCurrentMonth ? 'text-slate-300' : 'text-slate-600'}`} />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
            <Eye className="h-3 w-3" /> {evalCount} eval{evalCount !== 1 ? 's' : ''}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
            errorCount > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            <AlertTriangle className="h-3 w-3" /> {errorCount} mistake{errorCount !== 1 ? 's' : ''}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
            attitudeScore >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            <ThumbsUp className="h-3 w-3" /> {attitudeScore > 0 ? '+' : ''}{attitudeScore} attitude
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// At-a-glance strip — 4 micro-stats sitting below the hero, giving the GP an
// immediate read of "where am I this month" before they scroll. Includes a
// recency tile ("Last evaluation X days ago") so the dashboard reads as live.
// ============================================================================

export function AtAGlanceStrip({
  evalCount, mistakes, attitude, lastEvaluationDate,
}: {
  evalCount: number;
  mistakes: number;
  attitude: number;
  lastEvaluationDate: Date | null;
}) {
  const recencyLabel = lastEvaluationDate
    ? formatDistanceToNow(lastEvaluationDate, { addSuffix: true })
    : "—";
  const tiles: Array<{ icon: typeof Eye; label: string; value: string | number; tone: string }> = [
    { icon: Eye, label: "Evaluations", value: evalCount, tone: "bg-amber-50 border-amber-200 text-amber-700" },
    { icon: AlertTriangle, label: "Mistakes", value: mistakes, tone: "bg-red-50 border-red-200 text-red-700" },
    { icon: ThumbsUp, label: "Attitude", value: attitude > 0 ? `+${attitude}` : `${attitude}`, tone: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    { icon: Clock, label: "Last eval", value: recencyLabel, tone: "bg-slate-50 border-slate-200 text-slate-700" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {tiles.map(t => (
        <div key={t.label} className={`rounded-xl border p-3 sm:p-4 ${t.tone} flex items-center gap-3`}>
          <div className="bg-white/80 p-2 rounded-lg border border-white/40 shrink-0">
            <t.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider opacity-70">{t.label}</p>
            <p className="text-lg sm:text-xl font-bold truncate">{t.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActionPlanCard({ items }: { items: Array<{ id: number; title: string; description: string | null; category: string; priority: string; status: string; dueDate: Date | null; source: string }> }) {
  const open = items.filter(i => i.status === "open");
  const inProgress = items.filter(i => i.status === "in_progress");
  return (
    <Card className="bg-white border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-slate-800 text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-600" />
          Your action plan
        </CardTitle>
        <CardDescription className="text-slate-600 text-xs">
          {open.length} open, {inProgress.length} in progress — what your FM is asking you to focus on
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {[...inProgress, ...open].slice(0, 6).map(item => (
          <div
            key={item.id}
            className={`border rounded-lg p-3 ${PLAN_CATEGORY_TONE[item.category] ?? "border-slate-200 bg-white"}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-semibold text-slate-800">{item.title}</p>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 capitalize">{item.category}</span>
                {item.status === "in_progress" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-700">In progress</span>
                )}
              </div>
            </div>
            {item.description && (
              <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
            )}
            {item.dueDate && (
              <p className="text-[11px] text-slate-500 mt-1.5 inline-flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" />
                Due {new Date(item.dueDate).toLocaleDateString()}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Skeleton — layout-matching placeholder shown while the portal data loads.
// Replaces the spinner so the page reads as "preparing your view" rather than
// "stuck loading", and avoids a layout shift when the real content lands.
// ============================================================================

export function GPPortalSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </header>
      <main className="container py-6 sm:py-8 space-y-8">
        {/* Hero block */}
        <Skeleton className="h-28 w-full rounded-2xl" />

        {/* At-a-glance strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>

        {/* 3 score cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>

        {/* Tab strip placeholder */}
        <Skeleton className="h-10 w-full sm:w-96 rounded-lg" />

        {/* Body content placeholder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </main>
    </div>
  );
}
