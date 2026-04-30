import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { 
  Star, Calendar, Gamepad2, Eye, Sparkles, Scissors, Palette, Shirt, 
  PersonStanding, Loader2, AlertCircle, TrendingUp, AlertTriangle, Trophy, 
  Target, Gift, ThumbsUp, ThumbsDown, RefreshCw, ChevronDown, ChevronUp, BarChart3,
  Clock, Award, Zap, TrendingDown, Flame, Crown, Medal, Gem, Heart, Shield,
  Info, MessageSquare, FileText, ChevronLeft, ChevronRight
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { MAX_TOTAL_SCORE, MAX_APPEARANCE_SCORE, MAX_GAME_PERFORMANCE_SCORE, SCORE_CONFIG, MONTH_NAMES } from "../../../shared/const";

import {
  ScoreCard, AchievementBadge, StatCard, LabeledComment, MonthSelector, ActionPlanCard,
} from "./gpPortal/components";

export default function GPPortal() {
  const { token } = useParams<{ token: string }>();
  const [expandedEvaluations, setExpandedEvaluations] = useState<Set<number>>(new Set());
  const [selectedEvalMonth, setSelectedEvalMonth] = useState<string>('all');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  
  const now = new Date();
  const [detailMonth, setDetailMonth] = useState(now.getMonth() + 1);
  const [detailYear, setDetailYear] = useState(now.getFullYear());
  
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
    const meta: Record<Cat, { label: string; max: number; tip: string }> = {
      hair: { label: "Hair", max: 3, tip: "Tidy ponytail or smooth styling holds up under studio lights." },
      makeup: { label: "Makeup", max: 3, tip: "Refresh between shifts — even coverage reads better on camera." },
      outfit: { label: "Outfit", max: 3, tip: "Check for wrinkles and ensure team uniform is fully buttoned." },
      posture: { label: "Posture", max: 3, tip: "Shoulders back, weight even — sit/stand tall the full session." },
      dealingStyle: { label: "Dealing Style", max: 5, tip: "Slow down on splits and pays — clear hand movements > speed." },
      gamePerformance: { label: "Game Performance", max: 5, tip: "Announce results and outcomes clearly; engage with the chat." },
    };
    const cats: Cat[] = ["hair", "makeup", "outfit", "posture", "dealingStyle", "gamePerformance"];
    const ranked = cats
      .filter(c => counts[c] > 0)
      .map(c => ({
        key: c,
        label: meta[c].label,
        avg: totals[c] / counts[c],
        max: meta[c].max,
        pct: (totals[c] / counts[c]) / meta[c].max,
        tip: meta[c].tip,
      }))
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center relative z-10">
          <div className="relative">
            <div className="w-16 h-16 border-2 border-amber-200 rounded-full animate-spin border-t-amber-500" />
            <Star className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-amber-500 animate-pulse" />
          </div>
          <p className="mt-4 text-slate-500 text-sm">Loading your performance data...</p>
        </div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 relative">
      
      {/* Header */}
      <header className="relative z-10 border-b border-slate-200 bg-white/90 backdrop-blur-sm sticky top-0">
        <div className="container py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm">
              <Star className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                {data.gpName}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">Performance Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">
              Updated {format(lastRefresh, 'HH:mm')}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 sm:py-8 space-y-8 sm:space-y-10 relative z-10">

        {/* Hero banner — personalised greeting + performance tier */}
        {tier && (
          <section>
            <Card className="overflow-hidden border-slate-200 shadow-sm bg-white">
              <div className={`h-1.5 bg-gradient-to-r ${tier.color}`} />
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`shrink-0 h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br ${tier.color} flex items-center justify-center shadow-sm`}>
                      <tier.icon className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-slate-500">
                        {greeting}, {data.gpName.split(" ")[0]}
                      </p>
                      <h2 className="text-xl sm:text-3xl font-bold text-slate-900 leading-tight tracking-tight truncate">
                        You're a <span className={tier.textColor}>{tier.name}</span> presenter
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Average score{" "}
                        <span className="font-semibold text-slate-700">
                          {avgScore.toFixed(1)}
                        </span>
                        <span className="text-slate-400"> / {MAX_TOTAL_SCORE}</span>
                        {" · "}
                        {data.evaluations.length} evaluation{data.evaluations.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  {improvement && (
                    <div className={`px-3 py-2 rounded-xl border ${improvement.total >= 0 ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
                        Vs {improvement.previousLabel}
                      </p>
                      <p className={`text-base sm:text-lg font-bold flex items-center gap-1 ${improvement.total >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {improvement.total >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        {improvement.total >= 0 ? "+" : ""}{improvement.total} pts
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Score Overview Cards */}
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
            />
            <ScoreCard 
              score={avgAppearance} 
              maxScore={MAX_APPEARANCE_SCORE} 
              label="Appearance" 
              icon={Sparkles}
              bgColor="bg-white"
              accentColor="bg-emerald-50 border-emerald-200 text-emerald-600"
              tooltip={`Hair (${SCORE_CONFIG.hair.max}) + Makeup (${SCORE_CONFIG.makeup.max}) + Outfit (${SCORE_CONFIG.outfit.max}) + Posture (${SCORE_CONFIG.posture.max}) = ${MAX_APPEARANCE_SCORE} max`}
            />
            <ScoreCard 
              score={avgGamePerf} 
              maxScore={MAX_GAME_PERFORMANCE_SCORE} 
              label="Game Performance" 
              icon={Gamepad2}
              bgColor="bg-white"
              accentColor="bg-blue-50 border-blue-200 text-blue-600"
              tooltip={`Dealing Style (${SCORE_CONFIG.dealingStyle.max}) + Game Performance (${SCORE_CONFIG.gamePerformance.max}) = ${MAX_GAME_PERFORMANCE_SCORE} max`}
            />
          </div>
        </section>

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
                      <div key={f.key} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-800">{f.label}</span>
                          <span className="text-xs text-slate-500">
                            {f.avg.toFixed(1)}/{f.max}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{f.tip}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Monthly Stats & Achievements */}
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
                <div className="space-y-2.5">
                  {recentEvaluations.slice(0, 4).map((eval_: any) => (
                    <div key={eval_.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          (eval_.totalScore || 0) >= 20 ? 'bg-green-500' :
                          (eval_.totalScore || 0) >= 18 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`} />
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {eval_.game || 'Game Session'}
                          </p>
                          {eval_.evaluatorName && (
                            <p className="text-xs text-slate-500">by {eval_.evaluatorName}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${
                          (eval_.totalScore || 0) >= 20 ? 'text-green-600' :
                          (eval_.totalScore || 0) >= 18 ? 'text-amber-600' :
                          'text-red-600'
                        }`}>{eval_.totalScore}</span>
                        <span className="text-xs text-slate-400">/{MAX_TOTAL_SCORE}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No evaluations yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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
                <div className="h-[280px] sm:h-[320px]">
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

        {/* Achievements */}
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
                              <p className={`text-lg font-bold ${monthAvg >= 20 ? 'text-green-600' : monthAvg >= 18 ? 'text-amber-600' : 'text-red-600'}`}>
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
                      {isMonthExpanded && (
                        <div className="flex gap-2 sm:hidden px-1">
                          <div className={`flex-1 p-2 rounded-lg text-center ${monthAvg >= 20 ? 'bg-green-50' : monthAvg >= 18 ? 'bg-amber-50' : 'bg-red-50'}`}>
                            <p className={`text-lg font-bold ${monthAvg >= 20 ? 'text-green-600' : monthAvg >= 18 ? 'text-amber-600' : 'text-red-600'}`}>{monthAvg.toFixed(1)}</p>
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
                      )}

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

        {/* Error & Attitude Details */}
        {data.monthlyStats && (
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 text-slate-800">
                <FileText className="h-5 w-5 text-amber-500" />
                Monthly Details
              </h2>
              <MonthSelector 
                selectedMonth={detailMonth} 
                selectedYear={detailYear} 
                onChange={(m, y) => { setDetailMonth(m); setDetailYear(y); }}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Error Details */}
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-slate-800">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Errors & Mistakes
                  {errorDetails.length > 0 && (
                    <Badge className="ml-2 bg-red-50 text-red-700 border-red-200">{errorDetails.length}</Badge>
                  )}
                </h3>
                
                {errorDetails.length > 0 ? (
                  <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                    <CardContent className="p-0">
                      <div className="divide-y divide-slate-200">
                        {errorDetails.map((err: any, index: number) => (
                          <div key={err.id || index} className="p-4 hover:bg-slate-50 transition-colors">
                            <div className="flex items-start gap-4">
                              <div className={`shrink-0 p-2.5 rounded-xl ${
                                err.severity === 'critical' ? 'bg-red-50' :
                                err.severity === 'high' ? 'bg-orange-50' :
                                err.severity === 'medium' ? 'bg-amber-50' :
                                'bg-yellow-50'
                              }`}>
                                <AlertTriangle className={`h-5 w-5 ${
                                  err.severity === 'critical' ? 'text-red-500' :
                                  err.severity === 'high' ? 'text-orange-500' :
                                  err.severity === 'medium' ? 'text-amber-500' :
                                  'text-yellow-500'
                                }`} />
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
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="py-10 text-center">
                      <Shield className="h-10 w-10 text-green-400 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium">No errors recorded for {MONTH_NAMES[detailMonth - 1]} {detailYear}</p>
                      <p className="text-xs text-slate-400 mt-1">Great job keeping it clean!</p>
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
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 mt-10 relative z-10 bg-white">
        <div className="container text-center">
          <p className="text-slate-400 text-sm">GP Performance Dashboard — Auto-refreshes every 30 seconds</p>
        </div>
      </footer>
    </div>
  );
}
