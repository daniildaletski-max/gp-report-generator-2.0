import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";
import {
  Star, Calendar, Gamepad2, Eye, Sparkles, Scissors, Palette, Shirt,
  PersonStanding, AlertCircle, TrendingUp, AlertTriangle, Trophy,
  Target, ThumbsUp, ThumbsDown, RefreshCw, ChevronDown, ChevronUp, BarChart3,
  Clock, TrendingDown, Flame, Crown, Medal, Gem, Heart, Shield,
  MessageSquare, FileText, LayoutDashboard,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { MAX_TOTAL_SCORE, MAX_APPEARANCE_SCORE, MAX_GAME_PERFORMANCE_SCORE, SCORE_CONFIG, MONTH_NAMES } from "../../../shared/const";
import { useUrlState, urlString } from "@/hooks/useUrlState";
import { getTips } from "@/lib/improvementTips";

import { useIsMobile } from "@/hooks/useMobile";
import {
  ScoreCard, AchievementBadge, StatCard, LabeledComment, ActionPlanCard,
  AtAGlanceStrip, GPPortalSkeleton, StreakChip, MonthTabHeader, PerformancePulseHero,
  AICoachCard,
} from "./gpPortal/components";

/**
 * scoreColor — single source of truth for "what colour is this score?"
 * across the GP portal. Replaces the 5+ inline ternaries that all
 * had subtly different breakpoints (sometimes >=20 / >=18, sometimes
 * 18.5 etc) and returns a coordinated set of Tailwind classes for
 * text, bg, and a coloured dot.
 *
 * Tiers (% of max):
 *   90%+ : emerald  (excellent)
 *   75%+ : amber    (good)
 *   <75% : rose     (needs work)
 *   null score → slate (not yet rated)
 */
function scoreColor(score: number | null | undefined, max: number): {
  text: string; bg: string; border: string; dot: string; tier: "excellent" | "good" | "low" | "none";
} {
  if (score == null || max <= 0) {
    return { text: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200", dot: "bg-slate-300", tier: "none" };
  }
  const pct = score / max;
  if (pct >= 0.9) return { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", tier: "excellent" };
  if (pct >= 0.75) return { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", tier: "good" };
  return { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", dot: "bg-rose-500", tier: "low" };
}

export default function GPPortal() {
  const { token } = useParams<{ token: string }>();
  const isMobile = useIsMobile();
  const [expandedEvaluations, setExpandedEvaluations] = useState<Set<number>>(new Set());
  const [selectedEvalMonth, setSelectedEvalMonth] = useState<string>('all');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  // Toggle for the "Hidden technical errors" expander on the Month tab.
  // Declared at the top so React's hook order stays stable across the
  // `if (isLoading) return …` early-return — the previous placement,
  // after the early return, threw "Rendered more hooks than during
  // the previous render" the moment the data finished loading.
  const [showHiddenTechnical, setShowHiddenTechnical] = useState(false);
  
  const now = new Date();
  const [detailMonth, setDetailMonth] = useState(now.getMonth() + 1);
  const [detailYear, setDetailYear] = useState(now.getFullYear());

  // Persist active tab in URL so refresh / shared link drops the GP back where
  // they were. `overview` is the safe fallback for old/short links.
  const [activeTab, setActiveTab] = useUrlState<string>(
    "tab",
    "overview",
    urlString.parse,
    urlString.serialize,
  );
  
  const { data, isLoading, error, refetch, isFetching } = trpc.gpAccess.getEvaluationsByToken.useQuery(
    { token: token || "" },
    { enabled: !!token, refetchInterval: 30000, refetchOnWindowFocus: true }
  );

  // Fetch coaching plan items — what the FM is asking the GP to work on.
  const { data: planItems } = trpc.actionItems.listForPortalToken.useQuery(
    { token: token || "" },
    { enabled: !!token, refetchInterval: 60_000 },
  );

  const { data: monthDetails, isLoading: monthDetailsLoading } = trpc.gpAccess.getMonthDetails.useQuery(
    { token: token || "", month: detailMonth, year: detailYear },
    { enabled: !!token && !!data }
  );

  // AI Coach — server-side LLM-generated personalised summary cached
  // per-day. We pull lazily once base data is loaded so the LLM round-trip
  // doesn't compete with the first paint of the hero.
  const coachInsights = trpc.gpAccess.getCoachInsights.useQuery(
    { token: token || "" },
    { enabled: !!token && !!data, refetchOnWindowFocus: false, staleTime: 5 * 60_000 },
  );
  const refreshCoach = () => coachInsights.refetch();

  useEffect(() => {
    if (data) setLastRefresh(new Date());
  }, [data]);

  const toggleEvaluation = (id: number) => {
    setExpandedEvaluations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      return newSet;
    });
  };

  /**
   * Month-over-month comparison: did the GP improve in each metric?
   * Uses monthlyHistory which has 6 months oldest-first; compare last
   * two months that actually have data.
   */
  const improvement = useMemo(() => {
    if (!data?.monthlyHistory || data.monthlyHistory.length === 0) return null;
    const withData = (data.monthlyHistory as any[]).filter(m => Number(m.evalCount || 0) > 0);
    if (withData.length < 2) return null;
    const last = withData[withData.length - 1];
    const prev = withData[withData.length - 2];
    const delta = (cur: number, p: number) => Number((cur - p).toFixed(1));
    return {
      total: delta(Number(last.avgTotal), Number(prev.avgTotal)),
      appearance: delta(Number(last.avgAppearance), Number(prev.avgAppearance)),
      performance: delta(Number(last.avgPerformance), Number(prev.avgPerformance)),
      previousLabel: prev.label as string,
    };
  }, [data]);

  /**
   * Personal-best score (highest single evaluation total) from history.
   * Privacy-friendly recognition: compares the GP only to themselves.
   */
  const personalBest = useMemo(() => {
    if (!data?.evaluations || data.evaluations.length === 0) return null;
    let best = 0;
    for (const e of data.evaluations as any[]) {
      const score = Number(e.totalScore || 0);
      if (score > best) best = score;
    }
    return best > 0 ? best : null;
  }, [data]);

  /**
   * Focus areas: which evaluation categories have the lowest average and
   * could move the most. Returns the bottom-2 with one concrete tip each.
   */
  const focusAreas = useMemo(() => {
    if (!data?.evaluations || data.evaluations.length === 0) return [];
    const evs = data.evaluations as any[];
    const totals = {
      hair: 0, makeup: 0, outfit: 0, posture: 0,
      dealingStyle: 0, gamePerformance: 0,
    };
    const counts = { hair: 0, makeup: 0, outfit: 0, posture: 0, dealingStyle: 0, gamePerformance: 0 };
    for (const e of evs) {
      if (e.hairScore != null) { totals.hair += Number(e.hairScore); counts.hair++; }
      if (e.makeupScore != null) { totals.makeup += Number(e.makeupScore); counts.makeup++; }
      if (e.outfitScore != null) { totals.outfit += Number(e.outfitScore); counts.outfit++; }
      if (e.postureScore != null) { totals.posture += Number(e.postureScore); counts.posture++; }
      if (e.dealingStyleScore != null) { totals.dealingStyle += Number(e.dealingStyleScore); counts.dealingStyle++; }
      if (e.gamePerformanceScore != null) { totals.gamePerformance += Number(e.gamePerformanceScore); counts.gamePerformance++; }
    }
    type Cat = "hair" | "makeup" | "outfit" | "posture" | "dealingStyle" | "gamePerformance";
    const meta: Record<Cat, { label: string; max: number }> = {
      hair: { label: "Hair", max: 3 },
      makeup: { label: "Makeup", max: 3 },
      outfit: { label: "Outfit", max: 3 },
      posture: { label: "Posture", max: 3 },
      dealingStyle: { label: "Dealing Style", max: 5 },
      gamePerformance: { label: "Game Performance", max: 5 },
    };
    const cats: Cat[] = ["hair", "makeup", "outfit", "posture", "dealingStyle", "gamePerformance"];
    const ranked = cats
      .filter(c => counts[c] > 0)
      .map(c => {
        const avg = totals[c] / counts[c];
        const tipBundle = getTips(c, avg, meta[c].max);
        return {
          key: c,
          label: meta[c].label,
          avg,
          max: meta[c].max,
          pct: avg / meta[c].max,
          tipTitle: tipBundle?.title ?? null,
          tips: tipBundle?.tips ?? [],
        };
      })
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 2);
    // Only show as "focus" if scoring under 80% on average — otherwise
    // there's nothing meaningful to coach.
    return ranked.filter(r => r.pct < 0.8);
  }, [data]);

  /**
   * Performance tier — purely visual gamification, used in the hero
   * banner and as a personal goal anchor. Bands match the same
   * Excellent / Great / Good / Needs Work language used in the score
   * cards so the GP sees one consistent vocabulary.
   */
  const tier = useMemo(() => {
    if (!data || data.evaluations.length === 0) return null;
    const totalEvals = data.evaluations.length;
    const avg = totalEvals > 0
      ? data.evaluations.reduce((s: number, e: any) => s + (e.totalScore || 0), 0) / totalEvals
      : 0;
    const pct = (avg / MAX_TOTAL_SCORE) * 100;
    if (pct >= 90) return { name: "Elite", color: "from-amber-400 to-yellow-500", textColor: "text-amber-700", bg: "bg-amber-50", icon: Crown };
    if (pct >= 80) return { name: "Pro", color: "from-emerald-400 to-emerald-500", textColor: "text-emerald-700", bg: "bg-emerald-50", icon: Trophy };
    if (pct >= 70) return { name: "Solid", color: "from-blue-400 to-blue-500", textColor: "text-blue-700", bg: "bg-blue-50", icon: Medal };
    if (pct >= 50) return { name: "Rising", color: "from-violet-400 to-violet-500", textColor: "text-violet-700", bg: "bg-violet-50", icon: TrendingUp };
    return { name: "Building", color: "from-slate-400 to-slate-500", textColor: "text-slate-700", bg: "bg-slate-50", icon: Star };
  }, [data]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "Hello";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  /**
   * Sparkline-ready trend arrays for each score card. Slices the last
   * 6 monthly history points and zero-fills months with no evaluations
   * so the line still has a continuous shape.
   */
  const scoreTrends = useMemo(() => {
    const empty = { total: [], appearance: [], performance: [] };
    if (!data?.monthlyHistory || data.monthlyHistory.length < 2) return empty;
    const slice = (data.monthlyHistory as any[]).slice(-6);
    return {
      total: slice.map(m => ({ value: Number(m.avgTotal) || 0 })),
      appearance: slice.map(m => ({ value: Number(m.avgAppearance) || 0 })),
      performance: slice.map(m => ({ value: Number(m.avgPerformance) || 0 })),
    };
  }, [data]);

  /**
   * "N evaluations clean" — consecutive most-recent evaluations with
   * zero docked points (i.e. perfect MAX_TOTAL_SCORE). Chooses the
   * streak metric that gives the GP something to actively protect.
   * Returns 0 when there's no current streak.
   */
  const cleanStreak = useMemo(() => {
    if (!data?.evaluations || data.evaluations.length === 0) return 0;
    const sorted = [...data.evaluations].sort((a: any, b: any) =>
      new Date(b.evaluationDate || 0).getTime() - new Date(a.evaluationDate || 0).getTime()
    );
    let streak = 0;
    for (const e of sorted as any[]) {
      if ((e.totalScore || 0) >= MAX_TOTAL_SCORE) streak += 1;
      else break;
    }
    return streak;
  }, [data]);

  const achievements = useMemo(() => {
    if (!data) return [];
    const totalEvals = data.evaluations.length;
    const avgScore = totalEvals > 0 
      ? data.evaluations.reduce((s: number, e: any) => s + (e.totalScore || 0), 0) / totalEvals 
      : 0;
    const perfectScores = data.evaluations.filter((e: any) => (e.totalScore || 0) >= MAX_TOTAL_SCORE).length;
    const mistakes = data.monthlyStats?.current?.mistakes ?? 0;
    const attitude = data.monthlyStats?.current?.attitude ?? 0;
    
    return [
      { icon: Star, title: 'First Steps', description: 'Complete your first evaluation', unlocked: totalEvals >= 1, color: 'bg-amber-50 border-amber-200' },
      { icon: Flame, title: 'On Fire', description: 'Complete 5 evaluations', unlocked: totalEvals >= 5, color: 'bg-orange-50 border-orange-200' },
      { icon: Crown, title: 'Excellence', description: 'Average score above 20', unlocked: avgScore >= 20, color: 'bg-yellow-50 border-yellow-200' },
      { icon: Gem, title: 'Perfect Score', description: `Get a perfect ${MAX_TOTAL_SCORE}/${MAX_TOTAL_SCORE}`, unlocked: perfectScores > 0, color: 'bg-purple-50 border-purple-200' },
      { icon: Shield, title: 'Flawless', description: 'Zero mistakes this month', unlocked: mistakes === 0, color: 'bg-green-50 border-green-200' },
      { icon: Heart, title: 'Team Player', description: 'Positive attitude score', unlocked: attitude > 0, color: 'bg-pink-50 border-pink-200' },
    ];
  }, [data]);

  if (isLoading) return <GPPortalSkeleton />;

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="max-w-md w-full mx-4 bg-white border-slate-200 shadow-sm relative z-10">
          <CardContent className="pt-8 text-center">
            <div className="mx-auto mb-4 p-4 bg-red-50 rounded-full w-fit">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Access Error</h2>
            <p className="text-slate-500 mb-6">{error?.message || 'Unable to load your performance data. The link may be invalid or expired.'}</p>
            <Button onClick={() => refetch()} className="bg-amber-500 hover:bg-amber-600 text-white">
              <RefreshCw className="h-4 w-4 mr-2" /> Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalEvals = data.evaluations.length;
  const avgScore = totalEvals > 0 
    ? data.evaluations.reduce((s: number, e: any) => s + (e.totalScore || 0), 0) / totalEvals 
    : 0;
  const avgAppearance = totalEvals > 0 
    ? data.evaluations.reduce((s: number, e: any) => s + (e.appearanceScore || 0), 0) / totalEvals 
    : 0;
  const avgGamePerf = totalEvals > 0 
    ? data.evaluations.reduce((s: number, e: any) => s + (e.gamePerformanceTotalScore || 0), 0) / totalEvals 
    : 0;
  const recentEvaluations = [...data.evaluations].sort((a: any, b: any) => 
    new Date(b.evaluationDate || 0).getTime() - new Date(a.evaluationDate || 0).getTime()
  );

  const errorDetails = monthDetails?.errorDetails || [];
  const attitudeDetails = monthDetails?.attitudeDetails || [];
  const technicalErrorsHidden = monthDetails?.technicalErrorsHidden ?? 0;
  const hiddenTechnicalErrors = (monthDetails?.hiddenTechnicalErrors ?? []) as any[];
  // Count badge mirrors Excel "Error Count Analysis" column E exactly.
  const mistakeCount = monthDetails?.stats?.mistakes ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 relative">
      
      {/* Header — sticky personal bar. Surfaces the GP's name, tier
          badge, current clean-streak, and refresh button so the
          context stays visible no matter how far they scroll. */}
      <header className="relative z-20 border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 shadow-sm">
        <div className="container py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br ${tier?.color ?? "from-amber-400 to-amber-600"} flex items-center justify-center shadow-sm shrink-0`}>
              {tier ? <tier.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" /> : <Star className="h-5 w-5 sm:h-6 sm:w-6 text-white" />}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{data.gpName}</h1>
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                {tier && (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${tier.bg} ${tier.textColor} font-semibold uppercase tracking-wider`}>
                    <tier.icon className="h-2.5 w-2.5" />
                    {tier.name}
                  </span>
                )}
                {cleanStreak > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold uppercase tracking-wider">
                    <Flame className="h-2.5 w-2.5" />
                    {cleanStreak} clean
                  </span>
                )}
                <span className="text-slate-500 hidden sm:inline">{greeting}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-slate-400 hidden md:inline tabular-nums">
              {format(lastRefresh, 'HH:mm')}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 w-8 p-0 bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 sm:py-8 space-y-8 sm:space-y-10 relative z-10">

        {/* Empty state — no evaluations yet. Don't burn the GP with a
            wall of zeros / "no data" everywhere. Friendly welcome
            with a clear "what to expect" guide. */}
        {totalEvals === 0 && (
          <Card className="bg-gradient-to-br from-amber-50 via-yellow-50/50 to-white border-amber-200 shadow-sm">
            <CardContent className="p-6 sm:p-8 text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-md">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
                Welcome, {data.gpName.split(" ")[0]}!
              </h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto mb-5">
                Your performance dashboard is ready. As your floor manager evaluates your sessions, your scores, achievements, and trends will appear here.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
                <div className="rounded-xl bg-white border border-amber-100 p-3">
                  <Star className="h-5 w-5 text-amber-500 mb-1.5" />
                  <p className="text-xs font-semibold text-slate-800">Get evaluated</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Hair, makeup, posture, dealing & more</p>
                </div>
                <div className="rounded-xl bg-white border border-amber-100 p-3">
                  <TrendingUp className="h-5 w-5 text-emerald-500 mb-1.5" />
                  <p className="text-xs font-semibold text-slate-800">Track progress</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Per-criterion trends across months</p>
                </div>
                <div className="rounded-xl bg-white border border-amber-100 p-3">
                  <Trophy className="h-5 w-5 text-violet-500 mb-1.5" />
                  <p className="text-xs font-semibold text-slate-800">Earn achievements</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Top scorer, clean month & more</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Performance Pulse hero — replaces the previous thin tier banner.
            Big circular progress ring + animated score counter + tier badge
            inside the ring + insight chips on the right. Sized so it never
            sits below the fold on a phone. */}
        {tier && (
          <PerformancePulseHero
            gpFirstName={data.gpName.split(" ")[0]}
            greeting={greeting}
            avgScore={avgScore}
            maxScore={MAX_TOTAL_SCORE}
            evaluationsCount={data.evaluations.length}
            tierName={tier.name}
            tierAccent={tier.color}
            TierIcon={tier.icon}
            delta={improvement?.total ?? null}
            deltaLabel={improvement?.previousLabel ?? null}
            cleanStreak={cleanStreak}
            lastEvaluationDate={
              recentEvaluations[0]?.evaluationDate
                ? new Date(recentEvaluations[0].evaluationDate)
                : null
            }
          />
        )}

        {/* AI Coach — LLM-generated personalised summary based on the GP's
            actual evaluations. Server caches per-day so we don't burn
            credits on every 30s portal poll. */}
        <AICoachCard
          insights={coachInsights.data ?? null}
          isLoading={coachInsights.isLoading}
          isFetching={coachInsights.isFetching}
          onRefresh={refreshCoach}
          generatedAt={coachInsights.data?.generatedAt}
          cached={coachInsights.data?.cached}
        />

        {/* At-a-glance strip — quick read of "where am I this month" */}
        <AtAGlanceStrip
          evalCount={totalEvals}
          mistakes={data.monthlyStats?.current?.mistakes ?? 0}
          attitude={data.monthlyStats?.current?.attitude ?? 0}
          lastEvaluationDate={
            recentEvaluations[0]?.evaluationDate
              ? new Date(recentEvaluations[0].evaluationDate)
              : null
          }
        />

        {/* Score Overview Cards — with month-over-month delta chips per category */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            <ScoreCard
              score={avgScore}
              maxScore={MAX_TOTAL_SCORE}
              label="Overall Score"
              icon={Star}
              bgColor="bg-white"
              accentColor="bg-amber-50 border-amber-200 text-amber-600"
              tooltip={`Total of Appearance (${MAX_APPEARANCE_SCORE}) + Game Performance (${MAX_GAME_PERFORMANCE_SCORE}) = ${MAX_TOTAL_SCORE} max`}
              delta={improvement?.total}
              trend={scoreTrends.total}
              sparkColor="#f59e0b"
            />
            <ScoreCard
              score={avgAppearance}
              maxScore={MAX_APPEARANCE_SCORE}
              label="Appearance"
              icon={Sparkles}
              bgColor="bg-white"
              accentColor="bg-emerald-50 border-emerald-200 text-emerald-600"
              tooltip={`Hair (${SCORE_CONFIG.hair.max}) + Makeup (${SCORE_CONFIG.makeup.max}) + Outfit (${SCORE_CONFIG.outfit.max}) + Posture (${SCORE_CONFIG.posture.max}) = ${MAX_APPEARANCE_SCORE} max`}
              delta={improvement?.appearance}
              trend={scoreTrends.appearance}
              sparkColor="#10b981"
            />
            <ScoreCard
              score={avgGamePerf}
              maxScore={MAX_GAME_PERFORMANCE_SCORE}
              label="Game Performance"
              icon={Gamepad2}
              bgColor="bg-white"
              accentColor="bg-blue-50 border-blue-200 text-blue-600"
              tooltip={`Dealing Style (${SCORE_CONFIG.dealingStyle.max}) + Game Performance (${SCORE_CONFIG.gamePerformance.max}) = ${MAX_GAME_PERFORMANCE_SCORE} max`}
              delta={improvement?.performance}
              trend={scoreTrends.performance}
              sparkColor="#3b82f6"
            />
          </div>
        </section>

        {/* Peer benchmark — anonymous percentile rank within team for
            each score family. Doesn't show others' actual numbers,
            just the GP's standing. Strong gentle motivator. */}
        {(data as any).peerBenchmark && (
          <PeerBenchmarkRow benchmark={(data as any).peerBenchmark} />
        )}

        {planItems && planItems.length > 0 && <ActionPlanCard items={planItems} />}

        {/* Personal best + focus areas */}
        {(personalBest !== null || focusAreas.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {personalBest !== null && (
              <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 rounded-xl bg-amber-100 border border-amber-200">
                      <Trophy className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">Personal best</p>
                      <p className="text-2xl font-bold text-amber-700">
                        {personalBest}<span className="text-sm text-slate-500 font-normal">/{MAX_TOTAL_SCORE}</span>
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">
                    Your highest evaluation score so far. Keep stacking those wins.
                  </p>
                </CardContent>
              </Card>
            )}

            {focusAreas.length > 0 && (
              <Card className="bg-white border-violet-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 rounded-xl bg-violet-100 border border-violet-200">
                      <Target className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">Focus next</p>
                      <p className="text-sm font-semibold text-slate-800">Where you can move the needle</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {focusAreas.map(f => (
                      <div key={f.key} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-800">{f.label}</span>
                          <span className="text-xs tabular-nums font-semibold text-violet-700">
                            {f.avg.toFixed(1)}/{f.max}
                          </span>
                        </div>
                        {f.tipTitle && (
                          <p className="text-[11px] uppercase tracking-wider text-violet-700 font-semibold mb-1.5">
                            {f.tipTitle}
                          </p>
                        )}
                        {f.tips.length > 0 ? (
                          <ul className="space-y-1">
                            {f.tips.map((tip, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600 leading-relaxed">
                                <span className="text-violet-500 mt-0.5 shrink-0">•</span>
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-slate-500 italic">Keep practising — small consistent improvements compound.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Tabbed lower half — compacts ~2,000px of scroll into one tap so the
            Monthly Details panel (where the date-filter bug fix is visible) is
            never more than one click away. Active tab persists in `?tab=`. */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-white border border-slate-200 shadow-sm h-auto p-1 grid grid-cols-4 w-full sm:w-auto sm:inline-flex gap-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm py-2 px-3 text-xs sm:text-sm font-semibold">
              <LayoutDashboard className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="trend" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm py-2 px-3 text-xs sm:text-sm font-semibold">
              <TrendingUp className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Trend</span>
            </TabsTrigger>
            <TabsTrigger value="evaluations" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm py-2 px-3 text-xs sm:text-sm font-semibold">
              <Eye className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Evaluations</span>
            </TabsTrigger>
            <TabsTrigger value="month" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm py-2 px-3 text-xs sm:text-sm font-semibold">
              <Calendar className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Month</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Quick Stats */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                  <Target className="h-5 w-5 text-amber-500" />
                  This Month's Stats
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    icon={Eye}
                    value={totalEvals}
                    label="Total Evaluations"
                    color="bg-amber-50"
                  />
                  <StatCard
                    icon={AlertTriangle}
                    value={data.monthlyStats?.current?.mistakes ?? 0}
                    label="Mistakes"
                    color="bg-red-50"
                    trend={data.monthlyStats?.previous ?
                      (data.monthlyStats.current?.mistakes ?? 0) - (data.monthlyStats.previous.mistakes ?? 0) : undefined}
                  />
                  <StatCard
                    icon={ThumbsUp}
                    value={data.monthlyStats?.current?.attitude ?? 0}
                    label="Attitude Score"
                    color="bg-green-50"
                  />
                  <StatCard
                    icon={Gamepad2}
                    value={data.monthlyStats?.current?.totalGames ?? 0}
                    label="Total Games"
                    color="bg-blue-50"
                  />
                </div>
              </div>

              {/* Recent Evaluations */}
              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-slate-800 text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    Recent Evaluations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {recentEvaluations.length > 0 ? (
                    <div className="space-y-2">
                      {recentEvaluations.slice(0, 4).map((eval_: any) => {
                        const sc = scoreColor(eval_.totalScore, MAX_TOTAL_SCORE);
                        const evalDate = eval_.evaluationDate ? new Date(eval_.evaluationDate) : null;
                        // Per-criterion mini-tags — only show those that
                        // have a score so the row stays clean for older
                        // evaluations missing some categories.
                        const subs: Array<{ key: string; label: string; value: number; max: number }> = [];
                        if (eval_.hairScore != null) subs.push({ key: "h", label: "Hair", value: eval_.hairScore, max: SCORE_CONFIG.hair.max });
                        if (eval_.makeupScore != null) subs.push({ key: "m", label: "Mkup", value: eval_.makeupScore, max: SCORE_CONFIG.makeup.max });
                        if (eval_.outfitScore != null) subs.push({ key: "o", label: "Out", value: eval_.outfitScore, max: SCORE_CONFIG.outfit.max });
                        if (eval_.postureScore != null) subs.push({ key: "p", label: "Pos", value: eval_.postureScore, max: SCORE_CONFIG.posture.max });
                        if (eval_.dealingStyleScore != null) subs.push({ key: "d", label: "Deal", value: eval_.dealingStyleScore, max: SCORE_CONFIG.dealingStyle.max });
                        if (eval_.gamePerformanceScore != null) subs.push({ key: "g", label: "Perf", value: eval_.gamePerformanceScore, max: SCORE_CONFIG.gamePerformance.max });
                        return (
                          <div key={eval_.id} className={`group p-3 rounded-xl border ${sc.border} ${sc.bg} hover:shadow-sm transition-all`}>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className={`h-2 w-2 rounded-full ${sc.dot} shrink-0`} aria-hidden />
                                <p className="text-sm font-semibold text-slate-800 truncate">
                                  {eval_.game || 'Game Session'}
                                </p>
                              </div>
                              <div className="flex items-baseline gap-0.5 shrink-0">
                                <span className={`text-lg font-bold tabular-nums ${sc.text}`}>{eval_.totalScore}</span>
                                <span className="text-[10px] text-slate-400">/{MAX_TOTAL_SCORE}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                              <span className="flex items-center gap-1.5 min-w-0">
                                {evalDate && (
                                  <span className="shrink-0">{format(evalDate, 'MMM d')}</span>
                                )}
                                {eval_.evaluatorName && (
                                  <span className="truncate">· by {eval_.evaluatorName}</span>
                                )}
                              </span>
                            </div>
                            {/* Per-criterion mini chips — at-a-glance breakdown */}
                            {subs.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {subs.map(s => {
                                  const ssc = scoreColor(s.value, s.max);
                                  return (
                                    <span
                                      key={s.key}
                                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border bg-white ${ssc.border} ${ssc.text}`}
                                      title={`${s.label}: ${s.value}/${s.max}`}
                                    >
                                      {s.label} <span className="tabular-nums">{s.value}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 text-sm">No evaluations yet — they&apos;ll appear here as your FM rates you.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Achievements moved into Overview */}
            <section>
              <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-slate-800">
                <Trophy className="h-5 w-5 text-amber-500" />
                Achievements
                <Badge className="ml-2 bg-amber-50 text-amber-700 border-amber-200">
                  {achievements.filter(a => a.unlocked).length}/{achievements.length}
                </Badge>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {achievements.map((a) => (
                  <AchievementBadge key={a.title} {...a} />
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="trend" className="mt-6 space-y-6">

        {/* Score Trend Chart */}
        {data.monthlyHistory && data.monthlyHistory.length > 0 && (
          <section className="space-y-4">
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-slate-800 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-amber-500" />
                  Score Trend
                </CardTitle>
                <CardDescription className="text-slate-500 text-sm">
                  Average scores per month — Total, Appearance, and Game Performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Cap chart at ~180px on phone so it never eats more than a
                    third of the screen on small viewports. */}
                <div style={{ height: isMobile ? 180 : 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.monthlyHistory} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradAppearance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradPerformance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="label" 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                        domain={[0, MAX_TOTAL_SCORE]}
                        ticks={[0, 5, 10, 15, 20, MAX_TOTAL_SCORE]}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          border: '1px solid #e2e8f0', 
                          borderRadius: '12px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          color: '#1e293b',
                          padding: '12px 16px'
                        }}
                        labelStyle={{ color: '#64748b', marginBottom: '8px', fontWeight: 600 }}
                        formatter={(value: number, name: string) => {
                          const labels: Record<string, string> = {
                            avgTotal: 'Total Score',
                            avgAppearance: 'Appearance',
                            avgPerformance: 'Game Performance'
                          };
                          return [value.toFixed(1), labels[name] || name];
                        }}
                      />
                      <Area type="monotone" dataKey="avgTotal" stroke="#f59e0b" strokeWidth={2.5}
                        fill="url(#gradTotal)" name="avgTotal"
                        dot={{ fill: '#f59e0b', strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                      />
                      <Area type="monotone" dataKey="avgAppearance" stroke="#10b981" strokeWidth={2}
                        fill="url(#gradAppearance)" name="avgAppearance"
                        dot={{ fill: '#10b981', strokeWidth: 0, r: 3 }}
                        activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                      />
                      <Area type="monotone" dataKey="avgPerformance" stroke="#3b82f6" strokeWidth={2}
                        fill="url(#gradPerformance)" name="avgPerformance"
                        dot={{ fill: '#3b82f6', strokeWidth: 0, r: 3 }}
                        activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-xs text-slate-600">Total Score (max {MAX_TOTAL_SCORE})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-xs text-slate-600">Appearance (max {MAX_APPEARANCE_SCORE})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-xs text-slate-600">Game Performance (max {MAX_GAME_PERFORMANCE_SCORE})</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {data.monthlyHistory.map((month: any) => (
                <div 
                  key={`${month.year}-${month.month}`}
                  className={`relative p-4 rounded-xl border transition-all duration-300 hover:scale-[1.03] cursor-pointer ${
                    month.evalCount > 0 
                      ? 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-md shadow-sm' 
                      : 'bg-slate-50 border-slate-100 opacity-50'
                  }`}
                  onClick={() => {
                    if (month.evalCount > 0) {
                      setDetailMonth(month.month);
                      setDetailYear(month.year);
                    }
                  }}
                >
                  <p className="text-xs text-slate-500 font-medium mb-2">{month.label}</p>
                  {month.evalCount > 0 ? (
                    <>
                      <p className="text-2xl font-bold text-slate-900">{month.avgTotal.toFixed(1)}</p>
                      <p className="text-xs text-slate-400 mt-1">{month.evalCount} eval{month.evalCount !== 1 ? 's' : ''}</p>
                      <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                          style={{ width: `${(month.avgTotal / MAX_TOTAL_SCORE) * 100}%` }}
                        />
                      </div>
                      {month.highScore > 0 && (
                        <div className="flex justify-between mt-2">
                          <span className="text-[10px] text-green-600">H: {month.highScore}</span>
                          <span className="text-[10px] text-red-500">L: {month.lowScore}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">No data</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
          </TabsContent>

          <TabsContent value="evaluations" className="mt-6">

        {/* Evaluation History - Grouped by Month */}
        <section>
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-slate-800">
            <Calendar className="h-5 w-5 text-amber-500" />
            Evaluation History
            {data.evaluations.length > 0 && (
              <Badge className="ml-2 bg-amber-50 text-amber-700 border-amber-200">
                {data.evaluations.length} total
              </Badge>
            )}
          </h2>

          {data.evaluations.length > 0 ? (
            <div className="space-y-6">
              {/* Month navigation tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {(() => {
                  const months = new Map<string, { label: string; count: number; key: string }>();
                  data.evaluations.forEach((e: any) => {
                    const d = e.evaluationDate ? new Date(e.evaluationDate) : null;
                    if (!d) return;
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    const label = format(d, 'MMMM yyyy');
                    const existing = months.get(key);
                    if (existing) existing.count++;
                    else months.set(key, { label, count: 1, key });
                  });
                  const sorted = Array.from(months.values()).sort((a, b) => b.key.localeCompare(a.key));
                  return (
                    <>
                      <button
                        onClick={() => setSelectedEvalMonth('all')}
                        className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                          selectedEvalMonth === 'all'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        All Months
                      </button>
                      {sorted.map((m) => (
                        <button
                          key={m.key}
                          onClick={() => setSelectedEvalMonth(m.key)}
                          className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                            selectedEvalMonth === m.key
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {m.label}
                          <span className="ml-1.5 text-xs opacity-70">({m.count})</span>
                        </button>
                      ))}
                    </>
                  );
                })()}
              </div>

              {/* Filtered evaluations grouped by month */}
              {(() => {
                const grouped = new Map<string, { label: string; evaluations: any[] }>(); 
                data.evaluations.forEach((e: any) => {
                  const d = e.evaluationDate ? new Date(e.evaluationDate) : null;
                  const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'unknown';
                  const label = d ? format(d, 'MMMM yyyy') : 'Unknown Date';
                  if (!grouped.has(key)) grouped.set(key, { label, evaluations: [] });
                  grouped.get(key)!.evaluations.push(e);
                });
                const sortedGroups = Array.from(grouped.entries()).sort(([a], [b]) => b.localeCompare(a));
                const filteredGroups = selectedEvalMonth === 'all'
                  ? sortedGroups
                  : sortedGroups.filter(([key]) => key === selectedEvalMonth);

                return filteredGroups.map(([monthKey, group]) => {
                  const monthAvg = group.evaluations.reduce((s: number, e: any) => s + (e.totalScore || 0), 0) / group.evaluations.length;
                  const monthAppAvg = group.evaluations.reduce((s: number, e: any) => s + (e.appearanceScore || 0), 0) / group.evaluations.length;
                  const monthGameAvg = group.evaluations.reduce((s: number, e: any) => s + (e.gamePerformanceTotalScore || 0), 0) / group.evaluations.length;
                  const isMonthExpanded = expandedMonths.has(monthKey);

                  return (
                    <div key={monthKey} className="space-y-3">
                      <button
                        onClick={() => {
                          setExpandedMonths(prev => {
                            const next = new Set(prev);
                            if (next.has(monthKey)) next.delete(monthKey); else next.add(monthKey);
                            return next;
                          });
                        }}
                        className="w-full flex items-center justify-between p-4 rounded-xl bg-white border border-slate-200 hover:border-amber-300 hover:shadow-sm transition-all duration-300 group shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                            <Calendar className="h-5 w-5 text-amber-600" />
                          </div>
                          <div className="text-left">
                            <p className="text-slate-800 font-semibold text-base">{group.label}</p>
                            <p className="text-slate-500 text-sm">{group.evaluations.length} evaluation{group.evaluations.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="hidden sm:flex items-center gap-3">
                            <div className="text-right">
                              <p className={`text-lg font-bold ${scoreColor(monthAvg, MAX_TOTAL_SCORE).text}`}>
                                {monthAvg.toFixed(1)}
                              </p>
                              <p className="text-xs text-slate-400">avg score</p>
                            </div>
                            <div className="h-8 w-px bg-slate-200" />
                            <div className="flex gap-2">
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                                <Sparkles className="h-3 w-3 mr-1" />{monthAppAvg.toFixed(1)}
                              </Badge>
                              <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                <Gamepad2 className="h-3 w-3 mr-1" />{monthGameAvg.toFixed(1)}
                              </Badge>
                            </div>
                          </div>
                          {isMonthExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                        </div>
                      </button>

                      {/* Mobile month summary */}
                      {isMonthExpanded && (() => {
                        const sc = scoreColor(monthAvg, MAX_TOTAL_SCORE);
                        return (
                        <div className="flex gap-2 sm:hidden px-1">
                          <div className={`flex-1 p-2 rounded-lg text-center ${sc.bg}`}>
                            <p className={`text-lg font-bold ${sc.text}`}>{monthAvg.toFixed(1)}</p>
                            <p className="text-[10px] text-slate-400">avg</p>
                          </div>
                          <div className="flex-1 p-2 rounded-lg text-center bg-emerald-50">
                            <p className="text-lg font-bold text-emerald-600">{monthAppAvg.toFixed(1)}</p>
                            <p className="text-[10px] text-slate-400">appearance</p>
                          </div>
                          <div className="flex-1 p-2 rounded-lg text-center bg-blue-50">
                            <p className="text-lg font-bold text-blue-600">{monthGameAvg.toFixed(1)}</p>
                            <p className="text-[10px] text-slate-400">game</p>
                          </div>
                        </div>
                        );
                      })()}

                      {/* Individual evaluations */}
                      {isMonthExpanded && (
                        <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-amber-200">
                          {group.evaluations.map((evaluation: any) => {
                            const isExpanded = expandedEvaluations.has(evaluation.id);
                            return (
                              <Card key={evaluation.id} className="bg-white border-slate-200 overflow-hidden hover:border-slate-300 transition-all shadow-sm">
                                <CardContent className="p-0">
                                  <button
                                    onClick={() => toggleEvaluation(evaluation.id)}
                                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${
                                        (evaluation.totalScore || 0) >= 20 ? 'bg-green-50 text-green-600' :
                                        (evaluation.totalScore || 0) >= 18 ? 'bg-amber-50 text-amber-600' :
                                        'bg-red-50 text-red-600'
                                      }`}>
                                        {evaluation.totalScore}
                                      </div>
                                      <div>
                                        <p className="font-semibold text-slate-800">
                                          {evaluation.game || 'Game Session'}
                                        </p>
                                        {evaluation.evaluatorName && (
                                          <p className="text-sm text-slate-500">Evaluator: {evaluation.evaluatorName}</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="hidden sm:flex gap-2">
                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                          <Sparkles className="h-3 w-3 mr-1" />{evaluation.appearanceScore}/{MAX_APPEARANCE_SCORE}
                                        </Badge>
                                        <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                                          <Gamepad2 className="h-3 w-3 mr-1" />{evaluation.gamePerformanceTotalScore}/{MAX_GAME_PERFORMANCE_SCORE}
                                        </Badge>
                                      </div>
                                      {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                                    </div>
                                  </button>
                                  
                                  {isExpanded && (
                                    <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-slate-200 space-y-4 animate-in slide-in-from-top-2">
                                      {/* Mobile badges */}
                                      <div className="flex gap-2 sm:hidden">
                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                          <Sparkles className="h-3 w-3 mr-1" />{evaluation.appearanceScore}/{MAX_APPEARANCE_SCORE}
                                        </Badge>
                                        <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                                          <Gamepad2 className="h-3 w-3 mr-1" />{evaluation.gamePerformanceTotalScore}/{MAX_GAME_PERFORMANCE_SCORE}
                                        </Badge>
                                      </div>
                                      
                                      {/* Score breakdown */}
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {[
                                          { label: 'Hair', score: evaluation.hairScore, max: SCORE_CONFIG.hair.max, icon: Scissors },
                                          { label: 'Makeup', score: evaluation.makeupScore, max: SCORE_CONFIG.makeup.max, icon: Palette },
                                          { label: 'Outfit', score: evaluation.outfitScore, max: SCORE_CONFIG.outfit.max, icon: Shirt },
                                          { label: 'Posture', score: evaluation.postureScore, max: SCORE_CONFIG.posture.max, icon: PersonStanding },
                                          { label: 'Dealing', score: evaluation.dealingStyleScore, max: SCORE_CONFIG.dealingStyle.max, icon: Gamepad2 },
                                          { label: 'Game Perf', score: evaluation.gamePerformanceScore, max: SCORE_CONFIG.gamePerformance.max, icon: Star },
                                        ].map(({ label, score, max, icon: ItemIcon }) => (
                                          <div key={label} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                            <div className="flex items-center gap-2 mb-1">
                                              <ItemIcon className="h-3.5 w-3.5 text-amber-500" />
                                              <span className="text-xs text-slate-500">{label}</span>
                                            </div>
                                            <p className={`text-lg font-bold ${
                                              score !== null && max > 0 && (score / max) >= 0.9 ? 'text-green-600' :
                                              score !== null && max > 0 && (score / max) >= 0.7 ? 'text-amber-600' : 'text-red-600'
                                            }`}>
                                              {score ?? '—'}<span className="text-xs text-slate-400 font-normal">/{max}</span>
                                            </p>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Comments */}
                                      <div className="space-y-2">
                                        <LabeledComment icon={Scissors} label="Hair" comment={evaluation.hairComment} score={evaluation.hairScore} maxScore={SCORE_CONFIG.hair.max} />
                                        <LabeledComment icon={Palette} label="Makeup" comment={evaluation.makeupComment} score={evaluation.makeupScore} maxScore={SCORE_CONFIG.makeup.max} />
                                        <LabeledComment icon={Shirt} label="Outfit" comment={evaluation.outfitComment} score={evaluation.outfitScore} maxScore={SCORE_CONFIG.outfit.max} />
                                        <LabeledComment icon={PersonStanding} label="Posture" comment={evaluation.postureComment} score={evaluation.postureScore} maxScore={SCORE_CONFIG.posture.max} />
                                        <LabeledComment icon={Gamepad2} label="Dealing Style" comment={evaluation.dealingStyleComment} score={evaluation.dealingStyleScore} maxScore={SCORE_CONFIG.dealingStyle.max} />
                                        <LabeledComment icon={Star} label="Game Performance" comment={evaluation.gamePerformanceComment} score={evaluation.gamePerformanceScore} maxScore={SCORE_CONFIG.gamePerformance.max} />
                                        {evaluation.generalComment && (
                                          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                                            <div className="flex items-center gap-2 mb-1.5">
                                              <MessageSquare className="h-3.5 w-3.5 text-amber-600" />
                                              <span className="text-xs font-medium text-amber-700">General Comment</span>
                                            </div>
                                            <p className="text-sm text-slate-700 leading-relaxed">{evaluation.generalComment}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No evaluations yet</p>
                <p className="text-sm text-slate-400 mt-1">Your evaluation history will appear here</p>
              </CardContent>
            </Card>
          )}
        </section>
          </TabsContent>

          <TabsContent value="month" className="mt-6">

        {/* Error & Attitude Details — this is where the date-filter bug
            fix becomes visible: entries dated in another month should
            never leak into the selected month again. */}
        {data.monthlyStats && (
          <section className="space-y-5">
            <MonthTabHeader
              selectedMonth={detailMonth}
              selectedYear={detailYear}
              onChange={(m, y) => { setDetailMonth(m); setDetailYear(y); }}
              evalCount={(monthDetails?.evaluations || []).length}
              errorCount={mistakeCount}
              attitudeScore={attitudeDetails.reduce((s: number, a: any) => s + (a.attitudeScore || 0), 0)}
            />

            <AchievementsRow
              evaluations={(monthDetails?.evaluations ?? []) as any[]}
              errorCount={mistakeCount}
              attitudeScore={attitudeDetails.reduce((s: number, a: any) => s + (a.attitudeScore || 0), 0)}
              previousAvg={(() => {
                const hist = (data.monthlyHistory ?? []) as any[];
                const withData = hist.filter(m => Number(m.evalCount || 0) > 0);
                if (withData.length < 2) return null;
                return Number(withData[withData.length - 2].avgTotal) || null;
              })()}
              currentAvg={(() => {
                const hist = (data.monthlyHistory ?? []) as any[];
                const withData = hist.filter(m => Number(m.evalCount || 0) > 0);
                if (withData.length < 1) return null;
                return Number(withData[withData.length - 1].avgTotal) || null;
              })()}
            />

            <CriterionBreakdown evaluations={(monthDetails?.evaluations ?? []) as any[]} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Error Details */}
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold flex items-center gap-2 text-slate-800">
                    <span className="h-7 w-7 rounded-lg bg-rose-100 border border-rose-200 flex items-center justify-center">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                    </span>
                    Errors & Mistakes
                    {mistakeCount > 0 && (
                      <Badge className="ml-1 bg-rose-50 text-rose-700 border-rose-200 tabular-nums">
                        {mistakeCount}
                      </Badge>
                    )}
                  </h3>
                  {mistakeCount === 0 && (
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Clean month
                    </span>
                  )}
                </div>

                {technicalErrorsHidden > 0 && (
                  <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setShowHiddenTechnical(s => !s)}
                      className="w-full px-3 py-2 text-xs text-slate-600 flex items-center justify-between gap-2 hover:bg-slate-100/60 transition-colors rounded-lg"
                    >
                      <span className="flex items-start gap-2 text-left">
                        <Shield className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <span>
                          <strong className="text-slate-700">{technicalErrorsHidden}</strong>{" "}
                          technical {technicalErrorsHidden === 1 ? "error was" : "errors were"} logged this month but {technicalErrorsHidden === 1 ? "is" : "are"} not counted against you (TV / system / equipment issues).
                          <span className="ml-1 text-amber-700 underline-offset-2 hover:underline">
                            {showHiddenTechnical ? "Hide" : "View list"}
                          </span>
                        </span>
                      </span>
                      {showHiddenTechnical ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                    </button>
                    {showHiddenTechnical && hiddenTechnicalErrors.length > 0 && (
                      <div className="border-t border-slate-200 divide-y divide-slate-200">
                        {hiddenTechnicalErrors.map((err: any, index: number) => (
                          <div key={err.id || `hidden-${index}`} className="p-3 flex items-start gap-3">
                            <div className="shrink-0 p-1.5 rounded-lg bg-slate-100 border border-slate-200">
                              <Shield className="h-3.5 w-3.5 text-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                {err.errorType && (
                                  <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">{err.errorType}</Badge>
                                )}
                                {err.gameType && (
                                  <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-[10px]">{err.gameType}</Badge>
                                )}
                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Filtered as technical</Badge>
                              </div>
                              <p className="text-xs text-slate-700">{err.errorDescription || "Technical issue"}</p>
                              {err.tableId && <p className="text-[10px] text-slate-400 mt-0.5">Table: {err.tableId}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {errorDetails.length > 0 ? (
                  <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                    <CardContent className="p-0">
                      <div className="divide-y divide-slate-200">
                        {errorDetails.map((err: any, index: number) => {
                          // Single source of truth for severity colors —
                          // replaces 4 inline ternaries that drifted out
                          // of sync over time.
                          const sev = (err.severity || 'low').toLowerCase();
                          const sevTone = sev === 'critical'
                            ? { bg: 'bg-red-50', text: 'text-red-500', border: 'border-red-200', label: 'Critical' }
                            : sev === 'high'
                              ? { bg: 'bg-orange-50', text: 'text-orange-500', border: 'border-orange-200', label: 'High' }
                              : sev === 'medium'
                                ? { bg: 'bg-amber-50', text: 'text-amber-500', border: 'border-amber-200', label: 'Medium' }
                                : { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-200', label: 'Low' };
                          return (
                          <div key={err.id || index} className="p-4 hover:bg-slate-50 transition-colors">
                            <div className="flex items-start gap-4">
                              <div className={`shrink-0 p-2.5 rounded-xl border ${sevTone.bg} ${sevTone.border}`}>
                                <AlertTriangle className={`h-5 w-5 ${sevTone.text}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  {err.errorType && (
                                    <Badge className="bg-amber-50 text-amber-700 border-amber-200">{err.errorType}</Badge>
                                  )}
                                  {err.gameType && (
                                    <Badge className="bg-slate-100 text-slate-600 border-slate-200">{err.gameType}</Badge>
                                  )}
                                  {err.errorCategory && (
                                    <Badge className="bg-slate-100 text-slate-600 border-slate-200">{err.errorCategory}</Badge>
                                  )}
                                  <Badge className={`${
                                    err.source === 'screenshot'
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}>
                                    {err.source === 'screenshot' ? 'Screenshot' : 'Excel'}
                                  </Badge>
                                  {/* Severity pill — same tone as the icon. */}
                                  <Badge className={`${sevTone.bg} ${sevTone.text} ${sevTone.border}`}>
                                    {sevTone.label}
                                  </Badge>
                                </div>
                                <p className="text-slate-800 font-medium text-base">{err.errorDescription || 'Error recorded'}</p>
                                {err.tableId && <p className="text-sm text-slate-500 mt-1">Table: {err.tableId}</p>}
                                <div className="flex items-center gap-4 mt-2">
                                  <p className="text-xs text-slate-400">
                                    {err.errorDate ? format(new Date(err.errorDate), "MMM d, yyyy") :
                                     err.createdAt ? format(new Date(err.createdAt), "MMM d, yyyy") : "Unknown date"}
                                  </p>
                                  {err.screenshotUrl && (
                                    <a href={err.screenshotUrl} target="_blank" rel="noopener noreferrer"
                                      className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1">
                                      <Eye className="h-3 w-3" /> View Screenshot
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="py-10 text-center">
                      <Shield className="h-10 w-10 text-green-400 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium">No errors recorded for {MONTH_NAMES[detailMonth - 1]} {detailYear}</p>
                      {(() => {
                        const diag: any = (monthDetails as any)?.diagnostics;
                        if (!diag) {
                          return <p className="text-xs text-slate-400 mt-1">Great job keeping it clean!</p>;
                        }
                        const files: any[] = diag.latestErrorFiles || [];
                        return (
                          <div className="mt-3 inline-block text-left max-w-md mx-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                            <p className="font-semibold text-slate-700">Why is this empty?</p>
                            <p className="text-slate-600 mt-1">
                              We searched for <strong>{diag.gpName}</strong> in this month's data.
                            </p>
                            {files.length === 0 ? (
                              <p className="text-slate-600 mt-2">
                                No Playgon / MG files have been uploaded for {MONTH_NAMES[detailMonth - 1]} {detailYear}. Ask your FM to upload one in <em>Admin → Errors</em>.
                              </p>
                            ) : (
                              <>
                                <p className="text-slate-600 mt-2">Files uploaded for this month:</p>
                                <ul className="mt-1 list-disc list-inside space-y-0.5 text-slate-500">
                                  {files.map((f) => (
                                    <li key={f.id}>
                                      <span className="font-mono">{f.fileType}</span>: {f.fileName}
                                    </li>
                                  ))}
                                </ul>
                                <p className="text-slate-600 mt-2">
                                  If you expected to see errors here, the file may use a different spelling for your name. Ask your FM to verify the row in their Excel matches "<strong>{diag.gpName}</strong>".
                                </p>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Attitude Feedback */}
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-slate-800">
                  <Heart className="h-4 w-4 text-pink-500" />
                  Attitude Feedback
                  {attitudeDetails.length > 0 && (
                    <Badge className="ml-2 bg-pink-50 text-pink-700 border-pink-200">{attitudeDetails.length}</Badge>
                  )}
                </h3>
                
                {attitudeDetails.length > 0 ? (
                  <div className="space-y-3">
                    {/* Attitude summary */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-green-50 rounded-xl border border-green-200 text-center">
                        <ThumbsUp className="h-5 w-5 text-green-600 mx-auto mb-1" />
                        <p className="text-lg font-bold text-green-600">
                          {attitudeDetails.filter((a: any) => a.attitudeType === 'positive' || (a.attitudeScore && a.attitudeScore > 0)).length}
                        </p>
                        <p className="text-xs text-slate-500">Positive</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                        <span className="text-lg text-slate-400 block mb-1">—</span>
                        <p className="text-lg font-bold text-slate-500">
                          {attitudeDetails.filter((a: any) => a.attitudeType === 'neutral').length}
                        </p>
                        <p className="text-xs text-slate-500">Neutral</p>
                      </div>
                      <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-center">
                        <ThumbsDown className="h-5 w-5 text-red-500 mx-auto mb-1" />
                        <p className="text-lg font-bold text-red-500">
                          {attitudeDetails.filter((a: any) => a.attitudeType === 'negative' || (a.attitudeScore && a.attitudeScore < 0)).length}
                        </p>
                        <p className="text-xs text-slate-500">Negative</p>
                      </div>
                    </div>

                    {/* Individual attitude entries */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                      <CardContent className="p-0">
                        <div className="divide-y divide-slate-200">
                          {attitudeDetails.map((att: any) => {
                            const isPositive = att.attitudeType === 'positive' || (att.attitudeScore && att.attitudeScore > 0);
                            const isNegative = att.attitudeType === 'negative' || (att.attitudeScore && att.attitudeScore < 0);
                            return (
                              <div key={att.id} className="p-4 hover:bg-slate-50 transition-colors">
                                <div className="flex items-start gap-4">
                                  <div className={`shrink-0 p-2.5 rounded-xl ${
                                    isPositive ? 'bg-green-50' : isNegative ? 'bg-red-50' : 'bg-slate-100'
                                  }`}>
                                    {isPositive ? (
                                      <ThumbsUp className="h-5 w-5 text-green-600" />
                                    ) : isNegative ? (
                                      <ThumbsDown className="h-5 w-5 text-red-500" />
                                    ) : (
                                      <span className="h-5 w-5 flex items-center justify-center text-slate-400">—</span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge className={`${
                                        isPositive ? 'bg-green-50 text-green-700 border-green-200' :
                                        isNegative ? 'bg-red-50 text-red-700 border-red-200' :
                                        'bg-slate-100 text-slate-600 border-slate-200'
                                      }`}>
                                        {isPositive ? '+1 Positive' : isNegative ? '-1 Negative' : 'Neutral'}
                                      </Badge>
                                      {att.attitudeCategory && (
                                        <Badge className="bg-slate-100 text-slate-600 border-slate-200">{att.attitudeCategory}</Badge>
                                      )}
                                    </div>
                                    {(att.comment || att.description) && (
                                      <p className="text-slate-700 text-sm mt-2">{att.comment || att.description}</p>
                                    )}
                                    <div className="flex items-center gap-4 mt-2">
                                      {att.evaluatorName && (
                                        <p className="text-xs text-slate-400">By: {att.evaluatorName}</p>
                                      )}
                                      <p className="text-xs text-slate-400">
                                        {att.evaluationDate ? format(new Date(att.evaluationDate), "MMM d, yyyy") :
                                         att.createdAt ? format(new Date(att.createdAt), "MMM d, yyyy") : ""}
                                      </p>
                                      {att.screenshotUrl && (
                                        <a href={att.screenshotUrl} target="_blank" rel="noopener noreferrer"
                                          className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1">
                                          <Eye className="h-3 w-3" /> View
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="py-10 text-center">
                      <Heart className="h-10 w-10 text-pink-300 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium">No attitude feedback for {MONTH_NAMES[detailMonth - 1]} {detailYear}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </section>
        )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 mt-10 relative z-10 bg-white">
        <div className="container text-center space-y-1">
          <p className="text-slate-400 text-sm">GP Performance Dashboard — Auto-refreshes every 30 seconds</p>
          <p className="text-slate-400 text-xs">
            <Shield className="h-3 w-3 inline-block mr-1 -mt-0.5" />
            This data is private to you. Shared via secure link.
          </p>
          {/* Build identifier so we can confirm Manus picked up the latest deploy. */}
          <p className="text-slate-300 text-[10px] font-mono pt-1">
            build {__BUILD_SHA__} · {__BUILD_TIME__.slice(0, 16).replace("T", " ")}Z
          </p>
        </div>
      </footer>
    </div>
  );
}

// ============================================
// AchievementsRow — auto-computed badges based on the GP's month.
// Replaces "look at numbers and figure it out" with explicit
// celebrations / call-outs the GP can be proud of (or learn from).
// ============================================

type Achievement = {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "gold" | "emerald" | "rose" | "blue" | "violet";
};

function AchievementsRow({
  evaluations,
  errorCount,
  attitudeScore,
  currentAvg,
  previousAvg,
}: {
  evaluations: any[];
  errorCount: number;
  attitudeScore: number;
  currentAvg: number | null;
  previousAvg: number | null;
}) {
  const badges = useMemo<Achievement[]>(() => {
    const out: Achievement[] = [];
    if (evaluations.length === 0) return out;

    const evalCount = evaluations.length;
    // Top score this month
    const topScore = Math.max(...evaluations.map(e => Number(e.totalScore) || 0));
    // Average across all evals
    const avgScore = evaluations.reduce((s, e) => s + (Number(e.totalScore) || 0), 0) / evalCount;
    // Perfect appearance subscores in any evaluation
    const hadPerfectAppearance = evaluations.some(e =>
      Number(e.hairScore) === 3 && Number(e.makeupScore) === 3 &&
      Number(e.outfitScore) === 3 && Number(e.postureScore) === 3,
    );
    // Perfect performance subscores
    const hadPerfectPerformance = evaluations.some(e =>
      Number(e.dealingStyleScore) === 5 && Number(e.gamePerformanceScore) === 5,
    );

    // Real max is hair(3)+makeup(3)+outfit(3)+posture(3)+dealing(5)+perf(5) = 22.
    // The previous /24 thresholds never fired for genuine top scorers.
    if (topScore >= 21) {
      out.push({
        id: "top-scorer",
        label: "Top Scorer",
        description: `Best evaluation hit ${topScore}/22 — exceptional work.`,
        icon: Crown,
        tone: "gold",
      });
    }
    if (avgScore >= 19) {
      out.push({
        id: "consistent",
        label: "Consistent High",
        description: `Average ${avgScore.toFixed(1)}/22 across ${evalCount} eval${evalCount === 1 ? "" : "s"}.`,
        icon: Medal,
        tone: "emerald",
      });
    }
    if (hadPerfectAppearance) {
      out.push({
        id: "perfect-appearance",
        label: "Perfect Appearance",
        description: "Hair / Makeup / Outfit / Posture all maxed in one eval.",
        icon: Gem,
        tone: "violet",
      });
    }
    if (hadPerfectPerformance) {
      out.push({
        id: "perfect-perf",
        label: "Perfect Performance",
        description: "Dealing & Game Performance both 5/5 in one eval.",
        icon: Trophy,
        tone: "gold",
      });
    }
    if (errorCount === 0 && evalCount >= 2) {
      out.push({
        id: "clean-month",
        label: "Clean Month",
        description: "Zero recorded errors with multiple evaluations.",
        icon: Shield,
        tone: "emerald",
      });
    }
    if (evalCount >= 5) {
      out.push({
        id: "active-month",
        label: "Active Month",
        description: `${evalCount} evaluations — strong feedback flow.`,
        icon: Flame,
        tone: "rose",
      });
    }
    if (attitudeScore >= 3) {
      out.push({
        id: "positive-vibes",
        label: "Positive Vibes",
        description: `+${attitudeScore} attitude points from FM feedback.`,
        icon: Heart,
        tone: "rose",
      });
    }
    if (currentAvg != null && previousAvg != null && currentAvg - previousAvg >= 1.5) {
      out.push({
        id: "improving",
        label: "Improving",
        description: `Up ${(currentAvg - previousAvg).toFixed(1)} pts vs last month.`,
        icon: TrendingUp,
        tone: "emerald",
      });
    }
    return out;
  }, [evaluations, errorCount, attitudeScore, currentAvg, previousAvg]);

  if (badges.length === 0) return null;

  const toneClass = (t: Achievement["tone"]) => {
    switch (t) {
      case "gold": return "from-amber-50 via-yellow-50 to-amber-100/60 border-amber-200 text-amber-800";
      case "emerald": return "from-emerald-50 via-teal-50 to-emerald-100/60 border-emerald-200 text-emerald-800";
      case "rose": return "from-rose-50 via-pink-50 to-rose-100/60 border-rose-200 text-rose-800";
      case "blue": return "from-sky-50 via-blue-50 to-sky-100/60 border-sky-200 text-sky-800";
      case "violet": return "from-violet-50 via-purple-50 to-violet-100/60 border-violet-200 text-violet-800";
    }
  };
  const iconBgClass = (t: Achievement["tone"]) => {
    switch (t) {
      case "gold": return "bg-amber-100 text-amber-600 border-amber-200";
      case "emerald": return "bg-emerald-100 text-emerald-600 border-emerald-200";
      case "rose": return "bg-rose-100 text-rose-600 border-rose-200";
      case "blue": return "bg-sky-100 text-sky-600 border-sky-200";
      case "violet": return "bg-violet-100 text-violet-600 border-violet-200";
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        Achievements this month
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 tabular-nums">{badges.length}</Badge>
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {badges.map(b => (
          <div
            key={b.id}
            className={`relative overflow-hidden rounded-xl border bg-gradient-to-br p-3 ${toneClass(b.tone)}`}
          >
            <div className="flex items-start gap-2.5">
              <div className={`h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 ${iconBgClass(b.tone)}`}>
                <b.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold leading-tight">{b.label}</p>
                <p className="text-[10px] opacity-80 mt-0.5 leading-tight">{b.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// CriterionBreakdown — horizontal bar chart of all 6 criteria so the
// GP can see at a glance "where am I weakest". Each row shows score
// out of max with a coloured fill, plus the % filled.
// ============================================

function CriterionBreakdown({ evaluations }: { evaluations: any[] }) {
  const data = useMemo(() => {
    if (!evaluations || evaluations.length === 0) return null;
    const totals = { hair: 0, makeup: 0, outfit: 0, posture: 0, dealing: 0, perf: 0 };
    const counts = { hair: 0, makeup: 0, outfit: 0, posture: 0, dealing: 0, perf: 0 };
    for (const e of evaluations) {
      const add = (key: keyof typeof totals, value: any) => {
        if (value != null && Number.isFinite(Number(value))) {
          totals[key] += Number(value);
          counts[key]++;
        }
      };
      add("hair", e.hairScore);
      add("makeup", e.makeupScore);
      add("outfit", e.outfitScore);
      add("posture", e.postureScore);
      add("dealing", e.dealingStyleScore);
      add("perf", e.gamePerformanceScore);
    }
    const avg = (key: keyof typeof totals) => counts[key] > 0 ? totals[key] / counts[key] : null;
    return [
      { key: "hair", label: "Hair", value: avg("hair"), max: 3, icon: Scissors },
      { key: "makeup", label: "Makeup", value: avg("makeup"), max: 3, icon: Palette },
      { key: "outfit", label: "Outfit", value: avg("outfit"), max: 3, icon: Shirt },
      { key: "posture", label: "Posture", value: avg("posture"), max: 3, icon: PersonStanding },
      { key: "dealing", label: "Dealing Style", value: avg("dealing"), max: 5, icon: Target },
      { key: "perf", label: "Game Performance", value: avg("perf"), max: 5, icon: Gamepad2 },
    ];
  }, [evaluations]);

  if (!data) return null;

  const ratioColor = (v: number | null, max: number) => {
    if (v == null) return "bg-slate-200";
    const pct = v / max;
    if (pct >= 0.85) return "bg-emerald-500";
    if (pct >= 0.6) return "bg-amber-500";
    return "bg-rose-500";
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-amber-500" />
          Criterion breakdown
        </h3>
        <span className="text-[11px] text-slate-500">
          Average across {evaluations.length} eval{evaluations.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-3">
        {data.map(d => {
          const pct = d.value != null ? Math.min(100, (d.value / d.max) * 100) : 0;
          return (
            <div key={d.key} className="grid grid-cols-[140px_1fr_64px] sm:grid-cols-[180px_1fr_72px] gap-3 items-center">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                  <d.icon className="h-3.5 w-3.5 text-slate-600" />
                </div>
                <span className="text-xs font-medium text-slate-700 truncate">{d.label}</span>
              </div>
              <div className="relative h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${ratioColor(d.value, d.max)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right text-xs font-semibold tabular-nums text-slate-700">
                {d.value != null ? `${d.value.toFixed(1)}/${d.max}` : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// PeerBenchmarkRow — anonymous percentile rank within the GP's own
// team for each score family (Total / Appearance / Performance).
// Doesn't reveal others' numbers, only the GP's own standing.
// Skips families where the GP doesn't have evaluation data yet.
// ============================================
function PeerBenchmarkRow({
  benchmark,
}: {
  benchmark: {
    teamSize: number;
    total: { rank: number; percentile: number } | null;
    appearance: { rank: number; percentile: number } | null;
    performance: { rank: number; percentile: number } | null;
  };
}) {
  const items = [
    { key: "total", label: "Overall Score", value: benchmark.total, accent: "amber" as const },
    { key: "appearance", label: "Appearance", value: benchmark.appearance, accent: "emerald" as const },
    { key: "performance", label: "Game Performance", value: benchmark.performance, accent: "blue" as const },
  ].filter(i => i.value != null);
  if (items.length === 0 || benchmark.teamSize < 2) return null;

  // Translate percentile into a friendly tier copy. Percentile is the
  // share of teammates this GP outranks (higher = better).
  const tierFor = (pct: number) => {
    if (pct >= 80) return { label: "Top performer", tone: "emerald" as const };
    if (pct >= 60) return { label: "Above average", tone: "sky" as const };
    if (pct >= 40) return { label: "On par", tone: "slate" as const };
    return { label: "Room to grow", tone: "amber" as const };
  };

  return (
    <section>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map(item => {
          const v = item.value!;
          const tier = tierFor(v.percentile);
          const toneCls =
            tier.tone === "emerald" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : tier.tone === "sky" ? "bg-sky-50 border-sky-200 text-sky-700"
            : tier.tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-700"
            : "bg-slate-50 border-slate-200 text-slate-700";
          return (
            <div key={item.key} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{item.label}</span>
                <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full border ${toneCls}`}>
                  {tier.label}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">
                  {/* Compute from rank, not 100−percentile. Percentile
                      is a peer-relative metric (% of peers I outrank);
                      "Top X%" means "X% of the team is at-or-above
                      me" which is rank/teamSize × 100. For rank 1 of
                      2 that's 50%, not 1% (Codex P2 on PR #78). */}
                  Top {Math.max(1, Math.ceil((v.rank / benchmark.teamSize) * 100))}%
                </span>
                <span className="text-xs text-slate-500">in team</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Rank #{v.rank} of {benchmark.teamSize}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
