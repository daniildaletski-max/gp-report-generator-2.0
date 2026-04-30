/**
 * Reusable presentational components for the GP Portal page.
 *
 * These were inline in `GPPortal.tsx` until extraction. No behaviour
 * change in the move — just a code organisation step that lets the
 * orchestrator file shrink as new tabbed sections are added.
 */
import { useState } from "react";
import {
  Star, Eye, Scissors, TrendingUp, TrendingDown, Info, ChevronLeft, ChevronRight,
  Target, Calendar,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MONTH_NAMES } from "../../../../shared/const";

// ============================================================================
// Score card — large metric display with tooltip + status pill + progress bar
// ============================================================================

export function ScoreCard({ score, maxScore, label, icon: Icon, accentColor, bgColor, tooltip }: {
  score: number; maxScore: number; label: string; icon: typeof Star; accentColor: string; bgColor: string; tooltip?: string;
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
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-4xl font-bold text-slate-900">{score.toFixed(1)}</span>
            <span className="text-lg text-slate-400">/{maxScore}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{label}</p>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
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
