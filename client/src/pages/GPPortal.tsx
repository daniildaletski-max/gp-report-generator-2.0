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

// Animated background component with ocean glass morphism theme
function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-0 -left-40 w-80 h-80 bg-[#d4af37]/15 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-[#8b0000]/12 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-[#b8860b]/12 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[#d4af37]/8 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '0.5s' }} />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(212,175,55,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(212,175,55,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
    </div>
  );
}

// Score card component
function ScoreCard({ score, maxScore, label, icon: Icon, gradient, tooltip }: { 
  score: number; maxScore: number; label: string; icon: typeof Star; gradient: string; tooltip?: string;
}) {
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const [showTooltip, setShowTooltip] = useState(false);
  
  const getStatus = () => {
    if (percentage >= 90) return { text: 'Excellent', color: 'text-emerald-400', badge: 'bg-emerald-500/20 border-emerald-500/30' };
    if (percentage >= 80) return { text: 'Great', color: 'text-green-400', badge: 'bg-green-500/20 border-green-500/30' };
    if (percentage >= 70) return { text: 'Good', color: 'text-[#d4af37]', badge: 'bg-[#d4af37]/20 border-[#d4af37]/30' };
    return { text: 'Needs Work', color: 'text-[#8b0000]', badge: 'bg-[#8b0000]/20 border-[#8b0000]/30' };
  };
  const status = getStatus();
  
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} backdrop-blur-2xl p-5 sm:p-6 border border-white/[0.12] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_12px_40px_rgba(139,92,246,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] hover:border-white/20 transition-all duration-400 group hover:-translate-y-1`}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-white/10 transition-all" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2.5 bg-white/10 backdrop-blur-sm rounded-xl border border-white/10">
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            {tooltip && (
              <div className="relative">
                <button 
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="p-1 rounded-full hover:bg-white/10 transition-colors"
                >
                  <Info className="h-3.5 w-3.5 text-white/40 hover:text-white/70" />
                </button>
                {showTooltip && (
                  <div className="absolute right-0 top-7 z-50 w-48 p-3 bg-[rgba(14,13,10,0.95)] border border-[#d4af37]/30 rounded-xl text-xs text-white/80 shadow-xl backdrop-blur-xl">
                    {tooltip}
                    <div className="absolute -top-1 right-3 w-2 h-2 bg-[rgba(14,13,10,0.95)] border-l border-t border-[#d4af37]/30 rotate-45" />
                  </div>
                )}
              </div>
            )}
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.badge} ${status.color}`}>{status.text}</span>
          </div>
        </div>
        <div className="mb-3">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-4xl font-bold text-white">{score.toFixed(1)}</span>
            <span className="text-lg text-white/50">/{maxScore}</span>
          </div>
          <p className="text-sm text-white/70 mt-1">{label}</p>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-white/70 to-white/90 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(255,255,255,0.3)]"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Achievement badge component
function AchievementBadge({ icon: Icon, title, description, unlocked, color }: {
  icon: typeof Star; title: string; description: string; unlocked: boolean; color: string;
}) {
  return (
    <div className={`relative p-4 rounded-xl border backdrop-blur-sm transition-all duration-300 group ${
      unlocked 
        ? `bg-gradient-to-br ${color} border-white/20 shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_4px_20px_rgba(139,92,246,0.2)] hover:scale-[1.02]` 
        : 'bg-[rgba(18,18,30,0.5)] border-white/5 opacity-60 grayscale'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl transition-all ${unlocked ? 'bg-white/15 backdrop-blur-sm border border-white/10' : 'bg-white/5'}`}>
          <Icon className={`h-5 w-5 ${unlocked ? 'text-white' : 'text-white/40'}`} />
        </div>
        <div>
          <p className={`font-semibold text-sm ${unlocked ? 'text-white' : 'text-white/40'}`}>{title}</p>
          <p className={`text-xs ${unlocked ? 'text-white/70' : 'text-white/30'}`}>{description}</p>
        </div>
      </div>
      {unlocked && (
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30">
          <span className="text-[10px] text-white font-bold">✓</span>
        </div>
      )}
    </div>
  );
}

// Stat card
function StatCard({ icon: Icon, value, label, color, trend }: {
  icon: typeof Eye; value: string | number; label: string; color: string; trend?: number;
}) {
  return (
    <div className={`relative bg-gradient-to-br ${color} backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden group hover:scale-[1.02] hover:shadow-[0_8px_32px_rgba(212,175,55,0.15)] transition-all duration-300`}>
      <div className="p-4 sm:p-5 relative">
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/15 transition-all" />
        <div className="flex items-center gap-3 sm:gap-4 relative">
          <div className="bg-white/15 backdrop-blur-sm p-2.5 sm:p-3 rounded-xl shrink-0 shadow-lg border border-white/10">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-2xl sm:text-3xl font-bold text-white">{value}</p>
              {trend !== undefined && trend !== 0 && (
                <div className={`flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full ${trend > 0 ? 'text-green-300 bg-green-500/20' : 'text-red-300 bg-red-500/20'}`}>
                  {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{trend > 0 ? '+' : ''}{trend.toFixed(1)}</span>
                </div>
              )}
            </div>
            <p className="text-xs sm:text-sm text-white/70 truncate">{label}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Labeled comment component for evaluation details
function LabeledComment({ icon: Icon, label, comment, score, maxScore }: {
  icon: typeof Scissors; label: string; comment: string | null; score: number | null; maxScore: number;
}) {
  if (!comment) return null;
  return (
    <div className="p-3 bg-white/5 rounded-lg border border-white/5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-[#d4af37]" />
          <span className="text-xs font-medium text-white/70">{label}</span>
        </div>
        {score !== null && (
          <span className={`text-xs font-bold ${
            (score / maxScore) >= 0.9 ? 'text-emerald-400' :
            (score / maxScore) >= 0.7 ? 'text-[#d4af37]' : 'text-red-400'
          }`}>{score}/{maxScore}</span>
        )}
      </div>
      <p className="text-sm text-white/80 leading-relaxed">{comment}</p>
    </div>
  );
}

// Month selector for error/attitude history
function MonthSelector({ selectedMonth, selectedYear, onChange }: {
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
    // Don't go beyond current month
    if (nextYear > now.getFullYear() || (nextYear === now.getFullYear() && nextMonth > now.getMonth() + 1)) return;
    onChange(nextMonth, nextYear);
  };

  const now = new Date();
  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePrev}
        className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
      >
        <ChevronLeft className="h-4 w-4 text-white/70" />
      </button>
      <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 min-w-[160px] text-center">
        <span className="text-sm font-medium text-white">
          {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
        </span>
      </div>
      <button
        onClick={handleNext}
        disabled={isCurrentMonth}
        className={`p-2 rounded-lg border transition-colors ${
          isCurrentMonth 
            ? 'bg-white/[0.02] border-white/5 cursor-not-allowed' 
            : 'bg-white/5 border-white/10 hover:bg-white/10'
        }`}
      >
        <ChevronRight className={`h-4 w-4 ${isCurrentMonth ? 'text-white/20' : 'text-white/70'}`} />
      </button>
    </div>
  );
}

export default function GPPortal() {
  const { token } = useParams<{ token: string }>();
  const [expandedEvaluations, setExpandedEvaluations] = useState<Set<number>>(new Set());
  const [selectedEvalMonth, setSelectedEvalMonth] = useState<string>('all');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  
  // Month selector for error/attitude details
  const now = new Date();
  const [detailMonth, setDetailMonth] = useState(now.getMonth() + 1);
  const [detailYear, setDetailYear] = useState(now.getFullYear());
  
  const { data, isLoading, error, refetch, isFetching } = trpc.gpAccess.getEvaluationsByToken.useQuery(
    { token: token || "" },
    { enabled: !!token, refetchInterval: 30000, refetchOnWindowFocus: true }
  );

  // Fetch month-specific error/attitude details
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

  // Calculate achievements
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
      { icon: Star, title: 'First Steps', description: 'Complete your first evaluation', unlocked: totalEvals >= 1, color: 'from-[#d4af37]/30 to-[#b8860b]/30' },
      { icon: Flame, title: 'On Fire', description: 'Complete 5 evaluations', unlocked: totalEvals >= 5, color: 'from-[#8b0000]/30 to-red-500/30' },
      { icon: Crown, title: 'Excellence', description: 'Average score above 20', unlocked: avgScore >= 20, color: 'from-yellow-500/30 to-[#d4af37]/30' },
      { icon: Gem, title: 'Perfect Score', description: `Get a perfect ${MAX_TOTAL_SCORE}/${MAX_TOTAL_SCORE}`, unlocked: perfectScores > 0, color: 'from-[#d4af37]/30 to-[#8b0000]/30' },
      { icon: Shield, title: 'Flawless', description: 'Zero mistakes this month', unlocked: mistakes === 0, color: 'from-green-500/30 to-emerald-500/30' },
      { icon: Heart, title: 'Team Player', description: 'Positive attitude score', unlocked: attitude > 0, color: 'from-[#8b0000]/30 to-rose-500/30' },
    ];
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e0d0a]">
        <AnimatedBackground />
        <div className="text-center relative z-10">
          <div className="relative">
            <div className="w-16 h-16 border-2 border-[#d4af37]/20 rounded-full animate-spin border-t-[#d4af37]" />
            <Star className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-[#d4af37] animate-pulse" />
          </div>
          <p className="mt-4 text-white/60 text-sm">Loading your performance data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e0d0a]">
        <AnimatedBackground />
        <Card className="max-w-md w-full mx-4 bg-white/5 backdrop-blur-xl border-white/10 relative z-10">
          <CardContent className="pt-8 text-center">
            <div className="mx-auto mb-4 p-4 bg-red-500/20 rounded-full w-fit">
              <AlertCircle className="h-10 w-10 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Access Error</h2>
            <p className="text-white/60 mb-6">{error?.message || 'Unable to load your performance data. The link may be invalid or expired.'}</p>
            <Button onClick={() => refetch()} className="bg-[#d4af37] hover:bg-[#b8860b] text-black">
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

  // Error/attitude data from the month selector
  const errorDetails = monthDetails?.errorDetails || [];
  const attitudeDetails = monthDetails?.attitudeDetails || [];

  return (
    <div className="min-h-screen bg-[#0e0d0a] text-white relative">
      <AnimatedBackground />
      
      {/* Header */}
      <header className="relative z-10 border-b border-white/10 bg-[rgba(14,13,10,0.8)] backdrop-blur-xl sticky top-0">
        <div className="container py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[#d4af37] to-[#8b0000] flex items-center justify-center shadow-lg shadow-[#d4af37]/20">
              <Star className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#d4af37] via-[#f0d060] to-[#d4af37] bg-clip-text text-transparent">
                {data.gpName}
              </h1>
              <p className="text-xs sm:text-sm text-white/50">Performance Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xs text-white/30 hidden sm:block">
              Updated {format(lastRefresh, 'HH:mm')}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 sm:py-8 space-y-8 sm:space-y-10 relative z-10">
        
        {/* Score Overview Cards */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            <ScoreCard 
              score={avgScore} 
              maxScore={MAX_TOTAL_SCORE} 
              label="Overall Score" 
              icon={Star}
              gradient="from-[#d4af37]/25 via-[#b8860b]/20 to-[#8b0000]/25"
              tooltip={`Total of Appearance (${MAX_APPEARANCE_SCORE}) + Game Performance (${MAX_GAME_PERFORMANCE_SCORE}) = ${MAX_TOTAL_SCORE} max`}
            />
            <ScoreCard 
              score={avgAppearance} 
              maxScore={MAX_APPEARANCE_SCORE} 
              label="Appearance" 
              icon={Sparkles}
              gradient="from-green-500/20 via-emerald-500/15 to-teal-500/20"
              tooltip={`Hair (${SCORE_CONFIG.hair.max}) + Makeup (${SCORE_CONFIG.makeup.max}) + Outfit (${SCORE_CONFIG.outfit.max}) + Posture (${SCORE_CONFIG.posture.max}) = ${MAX_APPEARANCE_SCORE} max`}
            />
            <ScoreCard 
              score={avgGamePerf} 
              maxScore={MAX_GAME_PERFORMANCE_SCORE} 
              label="Game Performance" 
              icon={Gamepad2}
              gradient="from-[#b8860b]/20 via-[#d4af37]/15 to-yellow-500/20"
              tooltip={`Dealing Style (${SCORE_CONFIG.dealingStyle.max}) + Game Performance (${SCORE_CONFIG.gamePerformance.max}) = ${MAX_GAME_PERFORMANCE_SCORE} max`}
            />
          </div>
        </section>

        {/* Monthly Stats & Achievements */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Stats */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
              <Target className="h-5 w-5 text-[#d4af37]" />
              This Month's Stats
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard 
                icon={Eye} 
                value={totalEvals} 
                label="Total Evaluations" 
                color="from-[#d4af37]/20 to-[#b8860b]/20"
              />
              <StatCard 
                icon={AlertTriangle} 
                value={data.monthlyStats?.current?.mistakes ?? 0} 
                label="Mistakes" 
                color="from-[#8b0000]/20 to-red-500/20"
                trend={data.monthlyStats?.previous ? 
                  (data.monthlyStats.current?.mistakes ?? 0) - (data.monthlyStats.previous.mistakes ?? 0) : undefined}
              />
              <StatCard 
                icon={ThumbsUp} 
                value={data.monthlyStats?.current?.attitude ?? 0} 
                label="Attitude Score" 
                color="from-green-500/20 to-emerald-500/20"
              />
              <StatCard 
                icon={Gamepad2} 
                value={data.monthlyStats?.current?.totalGames ?? 0} 
                label="Total Games" 
                color="from-[#b8860b]/20 to-yellow-500/20"
              />
            </div>
          </div>

          {/* Recent Evaluations */}
          <Card className="bg-white/5 backdrop-blur-xl border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#d4af37]" />
                Recent Evaluations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentEvaluations.length > 0 ? (
                <div className="space-y-2.5">
                  {recentEvaluations.slice(0, 4).map((eval_: any) => (
                    <div key={eval_.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full shadow-lg ${
                          (eval_.totalScore || 0) >= 20 ? 'bg-green-400 shadow-green-400/50' :
                          (eval_.totalScore || 0) >= 18 ? 'bg-yellow-400 shadow-yellow-400/50' : 
                          'bg-red-400 shadow-red-400/50'
                        }`} />
                        <div>
                          <p className="text-white font-medium">
                            {eval_.evaluationDate ? format(new Date(eval_.evaluationDate), "MMM d, yyyy") : "Unknown"}
                          </p>
                          <p className="text-xs text-white/40">{eval_.game || 'Game'}</p>
                        </div>
                      </div>
                      <Badge className={`text-lg px-3 py-1 ${
                        (eval_.totalScore || 0) >= 20 ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                        (eval_.totalScore || 0) >= 18 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 
                        'bg-red-500/20 text-red-300 border-red-500/30'
                      }`}>
                        {eval_.totalScore}/{MAX_TOTAL_SCORE}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-white/40">
                  <Clock className="h-12 w-12 opacity-50 mx-auto mb-4" />
                  <p className="font-medium">No recent evaluations</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monthly Performance Trend Chart */}
        {data.monthlyHistory && data.monthlyHistory.length > 0 && (
          <section>
            <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-white">
              <TrendingUp className="h-5 w-5 text-[#d4af37]" />
              Monthly Performance Trend
            </h2>
            
            <Card className="bg-white/5 backdrop-blur-xl border-white/10 mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#d4af37]" />
                  Score Trends (6-Month Overview)
                </CardTitle>
                <CardDescription className="text-white/50 text-sm">
                  Average scores per month — Total, Appearance, and Game Performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] sm:h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.monthlyHistory} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#d4af37" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#d4af37" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="gradAppearance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b0000" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b0000" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="gradPerformance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#b8860b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#b8860b" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis 
                        dataKey="label" 
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} 
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} 
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        tickLine={false}
                        domain={[0, MAX_TOTAL_SCORE]}
                        ticks={[0, 5, 10, 15, 20, MAX_TOTAL_SCORE]}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(14, 13, 10, 0.95)', 
                          border: '1px solid rgba(212, 175, 55, 0.3)', 
                          borderRadius: '12px',
                          backdropFilter: 'blur(20px)',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                          color: '#fff',
                          padding: '12px 16px'
                        }}
                        labelStyle={{ color: 'rgba(255,255,255,0.7)', marginBottom: '8px', fontWeight: 600 }}
                        formatter={(value: number, name: string) => {
                          const labels: Record<string, string> = {
                            avgTotal: 'Total Score',
                            avgAppearance: 'Appearance',
                            avgPerformance: 'Game Performance'
                          };
                          return [value.toFixed(1), labels[name] || name];
                        }}
                      />
                      <Area type="monotone" dataKey="avgTotal" stroke="#d4af37" strokeWidth={2.5}
                        fill="url(#gradTotal)" name="avgTotal"
                        dot={{ fill: '#d4af37', strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, fill: '#d4af37', stroke: '#fff', strokeWidth: 2 }}
                      />
                      <Area type="monotone" dataKey="avgAppearance" stroke="#8b0000" strokeWidth={2}
                        fill="url(#gradAppearance)" name="avgAppearance"
                        dot={{ fill: '#8b0000', strokeWidth: 0, r: 3 }}
                        activeDot={{ r: 5, fill: '#8b0000', stroke: '#fff', strokeWidth: 2 }}
                      />
                      <Area type="monotone" dataKey="avgPerformance" stroke="#b8860b" strokeWidth={2}
                        fill="url(#gradPerformance)" name="avgPerformance"
                        dot={{ fill: '#b8860b', strokeWidth: 0, r: 3 }}
                        activeDot={{ r: 5, fill: '#b8860b', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#d4af37]" />
                    <span className="text-xs text-white/60">Total Score (max {MAX_TOTAL_SCORE})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#8b0000]" />
                    <span className="text-xs text-white/60">Appearance (max {MAX_APPEARANCE_SCORE})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#b8860b]" />
                    <span className="text-xs text-white/60">Game Performance (max {MAX_GAME_PERFORMANCE_SCORE})</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {data.monthlyHistory.map((month: any) => (
                <div 
                  key={`${month.year}-${month.month}`}
                  className={`relative p-4 rounded-xl border backdrop-blur-xl transition-all duration-300 hover:scale-[1.03] cursor-pointer ${
                    month.evalCount > 0 
                      ? 'bg-white/5 border-white/10 hover:border-[#d4af37]/30 hover:shadow-[0_4px_20px_rgba(212,175,55,0.15)]' 
                      : 'bg-white/[0.02] border-white/5 opacity-50'
                  }`}
                  onClick={() => {
                    if (month.evalCount > 0) {
                      setDetailMonth(month.month);
                      setDetailYear(month.year);
                    }
                  }}
                >
                  <p className="text-xs text-white/50 font-medium mb-2">{month.label}</p>
                  {month.evalCount > 0 ? (
                    <>
                      <p className="text-2xl font-bold text-white">{month.avgTotal.toFixed(1)}</p>
                      <p className="text-xs text-white/40 mt-1">{month.evalCount} eval{month.evalCount !== 1 ? 's' : ''}</p>
                      <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-[#d4af37] to-[#b8860b] transition-all duration-500"
                          style={{ width: `${(month.avgTotal / MAX_TOTAL_SCORE) * 100}%` }}
                        />
                      </div>
                      {month.highScore > 0 && (
                        <div className="flex justify-between mt-2">
                          <span className="text-[10px] text-green-400/70">H: {month.highScore}</span>
                          <span className="text-[10px] text-red-400/70">L: {month.lowScore}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-white/30">No data</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bonus Status */}
        {data.monthlyStats?.current && (
          <section>
            <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-white">
              <Gift className="h-5 w-5 text-pink-400" />
              Bonus Status
            </h2>
            
            <Card className={`overflow-hidden ${
              data.monthlyStats.current.bonus.eligible 
                ? 'bg-gradient-to-br from-green-500/20 via-emerald-500/10 to-[#d4af37]/20 border-green-500/30' 
                : 'bg-white/5 border-white/10'
            } backdrop-blur-xl`}>
              <CardContent className="p-6 sm:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-4 rounded-2xl ${data.monthlyStats.current.bonus.eligible ? 'bg-green-500/30' : 'bg-white/10'}`}>
                        <Award className={`h-10 w-10 ${data.monthlyStats.current.bonus.eligible ? 'text-green-300' : 'text-white/50'}`} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {data.monthlyStats.current.bonus.eligible 
                            ? `Level ${data.monthlyStats.current.bonus.level} Bonus!` 
                            : 'Not Yet Eligible'}
                        </h3>
                        <p className="text-white/60 text-sm">{data.monthlyStats.current.bonus.reason}</p>
                      </div>
                    </div>
                    {data.monthlyStats.current.bonus.eligible && data.monthlyStats.current.bonus.rate && (
                      <div className="p-4 bg-white/10 rounded-xl">
                        <p className="text-sm text-white/60">Bonus Rate</p>
                        <p className="text-3xl font-bold text-green-300">+€{data.monthlyStats.current.bonus.rate.toFixed(2)}/hr</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="p-4 bg-white/5 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-white/60">Good Games (GGs)</span>
                        <span className="text-2xl font-bold text-[#d4af37]">{data.monthlyStats.current.bonus.ggs?.toLocaleString()}</span>
                      </div>
                      <Progress 
                        value={Math.min((data.monthlyStats.current.bonus.ggs / 5000) * 100, 100)} 
                        className="h-2 bg-white/10" 
                      />
                      <div className="flex justify-between mt-2 text-xs text-white/40">
                        <span>0</span>
                        <span className="text-[#d4af37]">2,500 (L1)</span>
                        <span className="text-green-400">5,000 (L2)</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-white/5 rounded-xl text-center">
                        <p className="text-xs text-white/50">Total Games</p>
                        <p className="text-xl font-bold text-white">{(data.monthlyStats.current.totalGames || 0).toLocaleString()}</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl text-center">
                        <p className="text-xs text-white/50">Mistakes</p>
                        <p className="text-xl font-bold text-white">{data.monthlyStats.current.mistakes || 0}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Achievements */}
        <section>
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-white">
            <Trophy className="h-5 w-5 text-[#d4af37]" />
            Achievements
            <Badge className="ml-2 bg-[#d4af37]/20 text-[#d4af37] border-[#d4af37]/30">
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
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-white">
            <Calendar className="h-5 w-5 text-[#d4af37]" />
            Evaluation History
            {data.evaluations.length > 0 && (
              <Badge className="ml-2 bg-[#d4af37]/20 text-[#d4af37] border-[#d4af37]/30">
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
                            ? 'bg-[#d4af37]/30 text-[#f0d060] border border-[#d4af37]/40 shadow-[0_0_12px_rgba(212,175,55,0.2)]'
                            : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
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
                              ? 'bg-[#d4af37]/30 text-[#f0d060] border border-[#d4af37]/40 shadow-[0_0_12px_rgba(212,175,55,0.2)]'
                              : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
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
                        className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/10 hover:bg-white/[0.09] hover:border-white/15 transition-all duration-300 group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-[#d4af37]/20 border border-[#d4af37]/30">
                            <Calendar className="h-5 w-5 text-[#d4af37]" />
                          </div>
                          <div className="text-left">
                            <p className="text-white font-semibold text-base">{group.label}</p>
                            <p className="text-white/50 text-sm">{group.evaluations.length} evaluation{group.evaluations.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="hidden sm:flex items-center gap-3">
                            <div className="text-right">
                              <p className={`text-lg font-bold ${monthAvg >= 20 ? 'text-green-400' : monthAvg >= 18 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {monthAvg.toFixed(1)}
                              </p>
                              <p className="text-xs text-white/40">avg score</p>
                            </div>
                            <div className="h-8 w-px bg-white/10" />
                            <div className="flex gap-2">
                              <Badge className="bg-green-500/15 text-green-300/80 border-green-500/20 text-xs">
                                <Sparkles className="h-3 w-3 mr-1" />{monthAppAvg.toFixed(1)}
                              </Badge>
                              <Badge className="bg-[#d4af37]/15 text-[#d4af37]/80 border-[#d4af37]/20 text-xs">
                                <Gamepad2 className="h-3 w-3 mr-1" />{monthGameAvg.toFixed(1)}
                              </Badge>
                            </div>
                          </div>
                          {isMonthExpanded ? <ChevronUp className="h-5 w-5 text-white/40" /> : <ChevronDown className="h-5 w-5 text-white/40" />}
                        </div>
                      </button>

                      {/* Mobile month summary */}
                      {isMonthExpanded && (
                        <div className="flex gap-2 sm:hidden px-1">
                          <div className={`flex-1 p-2 rounded-lg text-center ${monthAvg >= 20 ? 'bg-green-500/15' : monthAvg >= 18 ? 'bg-yellow-500/15' : 'bg-red-500/15'}`}>
                            <p className={`text-lg font-bold ${monthAvg >= 20 ? 'text-green-400' : monthAvg >= 18 ? 'text-yellow-400' : 'text-red-400'}`}>{monthAvg.toFixed(1)}</p>
                            <p className="text-[10px] text-white/40">avg</p>
                          </div>
                          <div className="flex-1 p-2 rounded-lg text-center bg-green-500/10">
                            <p className="text-lg font-bold text-green-300">{monthAppAvg.toFixed(1)}</p>
                            <p className="text-[10px] text-white/40">appearance</p>
                          </div>
                          <div className="flex-1 p-2 rounded-lg text-center bg-[#d4af37]/10">
                            <p className="text-lg font-bold text-[#d4af37]">{monthGameAvg.toFixed(1)}</p>
                            <p className="text-[10px] text-white/40">game</p>
                          </div>
                        </div>
                      )}

                      {/* Individual evaluations */}
                      {isMonthExpanded && (
                        <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-[#d4af37]/20">
                          {group.evaluations.map((evaluation: any) => {
                            const isExpanded = expandedEvaluations.has(evaluation.id);
                            return (
                              <Card key={evaluation.id} className="bg-white/5 backdrop-blur-xl border-white/10 overflow-hidden hover:bg-white/[0.07] transition-all">
                                <CardContent className="p-0">
                                  <button
                                    onClick={() => toggleEvaluation(evaluation.id)}
                                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${
                                        (evaluation.totalScore || 0) >= 20 ? 'bg-green-500/20 text-green-300' :
                                        (evaluation.totalScore || 0) >= 18 ? 'bg-yellow-500/20 text-yellow-300' :
                                        'bg-red-500/20 text-red-300'
                                      }`}>
                                        {evaluation.totalScore}
                                      </div>
                                      <div>
                                        <p className="font-semibold text-white">
                                          {evaluation.evaluationDate ? format(new Date(evaluation.evaluationDate), "MMMM d, yyyy") : "Unknown Date"}
                                        </p>
                                        <p className="text-sm text-white/50">{evaluation.game || 'Game Session'}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="hidden sm:flex gap-2">
                                        <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                                          <Sparkles className="h-3 w-3 mr-1" />{evaluation.appearanceScore}/{MAX_APPEARANCE_SCORE}
                                        </Badge>
                                        <Badge className="bg-[#d4af37]/20 text-[#d4af37] border-[#d4af37]/30">
                                          <Gamepad2 className="h-3 w-3 mr-1" />{evaluation.gamePerformanceTotalScore}/{MAX_GAME_PERFORMANCE_SCORE}
                                        </Badge>
                                      </div>
                                      {isExpanded ? <ChevronUp className="h-5 w-5 text-white/40" /> : <ChevronDown className="h-5 w-5 text-white/40" />}
                                    </div>
                                  </button>
                                  
                                  {isExpanded && (
                                    <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-white/10 space-y-4 animate-in slide-in-from-top-2">
                                      {/* Mobile badges */}
                                      <div className="flex gap-2 sm:hidden">
                                        <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                                          <Sparkles className="h-3 w-3 mr-1" />Appearance: {evaluation.appearanceScore}/{MAX_APPEARANCE_SCORE}
                                        </Badge>
                                        <Badge className="bg-[#d4af37]/20 text-[#d4af37] border-[#d4af37]/30">
                                          <Gamepad2 className="h-3 w-3 mr-1" />Game: {evaluation.gamePerformanceTotalScore}/{MAX_GAME_PERFORMANCE_SCORE}
                                        </Badge>
                                      </div>
                                      
                                      {/* Appearance Details */}
                                      <div>
                                        <p className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
                                          <Sparkles className="h-4 w-4" />
                                          Appearance Breakdown
                                        </p>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                          {[
                                            { icon: Scissors, label: 'Hair', score: evaluation.hairScore, max: SCORE_CONFIG.hair.max },
                                            { icon: Palette, label: 'Makeup', score: evaluation.makeupScore, max: SCORE_CONFIG.makeup.max },
                                            { icon: Shirt, label: 'Outfit', score: evaluation.outfitScore, max: SCORE_CONFIG.outfit.max },
                                            { icon: PersonStanding, label: 'Posture', score: evaluation.postureScore, max: SCORE_CONFIG.posture.max },
                                          ].map((item) => (
                                            <div key={item.label} className="p-3 bg-white/5 rounded-lg">
                                              <div className="flex items-center gap-2 mb-2">
                                                <item.icon className="h-4 w-4 text-green-400" />
                                                <span className="text-xs text-white/60">{item.label}</span>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <span className="text-lg font-bold text-white">{item.score ?? 0}</span>
                                                <span className="text-xs text-white/40">/{item.max}</span>
                                              </div>
                                              <Progress value={((item.score ?? 0) / item.max) * 100} className="h-1.5 mt-2 bg-white/10" />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      
                                      {/* Game Performance Details */}
                                      <div>
                                        <p className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
                                          <Gamepad2 className="h-4 w-4" />
                                          Game Performance Breakdown
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                          {[
                                            { label: 'Dealing Style', score: evaluation.dealingStyleScore, max: SCORE_CONFIG.dealingStyle.max },
                                            { label: 'Game Performance', score: evaluation.gamePerformanceScore, max: SCORE_CONFIG.gamePerformance.max },
                                          ].map((item) => (
                                            <div key={item.label} className="p-3 bg-white/5 rounded-lg">
                                              <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs text-white/60">{item.label}</span>
                                                <span className="text-lg font-bold text-white">{item.score ?? 0}/{item.max}</span>
                                              </div>
                                              <Progress value={((item.score ?? 0) / item.max) * 100} className="h-1.5 bg-white/10" />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      
                                      {/* Labeled Comments per Category */}
                                      {(evaluation.hairComment || evaluation.makeupComment || evaluation.outfitComment || evaluation.postureComment || evaluation.dealingStyleComment || evaluation.gamePerformanceComment) && (
                                        <div>
                                          <p className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
                                            <MessageSquare className="h-4 w-4" />
                                            Evaluator Comments
                                          </p>
                                          <div className="space-y-2">
                                            <LabeledComment icon={Scissors} label="Hair" comment={evaluation.hairComment} score={evaluation.hairScore} maxScore={SCORE_CONFIG.hair.max} />
                                            <LabeledComment icon={Palette} label="Makeup" comment={evaluation.makeupComment} score={evaluation.makeupScore} maxScore={SCORE_CONFIG.makeup.max} />
                                            <LabeledComment icon={Shirt} label="Outfit" comment={evaluation.outfitComment} score={evaluation.outfitScore} maxScore={SCORE_CONFIG.outfit.max} />
                                            <LabeledComment icon={PersonStanding} label="Posture" comment={evaluation.postureComment} score={evaluation.postureScore} maxScore={SCORE_CONFIG.posture.max} />
                                            <LabeledComment icon={Gamepad2} label="Dealing Style" comment={evaluation.dealingStyleComment} score={evaluation.dealingStyleScore} maxScore={SCORE_CONFIG.dealingStyle.max} />
                                            <LabeledComment icon={Target} label="Game Performance" comment={evaluation.gamePerformanceComment} score={evaluation.gamePerformanceScore} maxScore={SCORE_CONFIG.gamePerformance.max} />
                                          </div>
                                        </div>
                                      )}
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
            <Card className="bg-white/5 backdrop-blur-xl border-white/10">
              <CardContent className="py-16 text-center">
                <Calendar className="h-16 w-16 text-white/20 mx-auto mb-6" />
                <h3 className="text-xl font-semibold text-white mb-2">No evaluations yet</h3>
                <p className="text-white/50 max-w-md mx-auto">Your evaluation history will appear here after your first evaluation.</p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Error & Attitude Details — Month Selector */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 text-white">
              <FileText className="h-5 w-5 text-[#d4af37]" />
              Monthly Details
            </h2>
            <MonthSelector 
              selectedMonth={detailMonth} 
              selectedYear={detailYear} 
              onChange={(m, y) => { setDetailMonth(m); setDetailYear(y); }} 
            />
          </div>

          {monthDetailsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#d4af37]" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Month Stats Summary */}
              {monthDetails?.stats && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 text-center">
                    <p className="text-xs text-white/50 mb-1">Attitude</p>
                    <p className={`text-2xl font-bold ${(monthDetails.stats.attitude ?? 0) > 0 ? 'text-green-400' : (monthDetails.stats.attitude ?? 0) < 0 ? 'text-red-400' : 'text-white/50'}`}>
                      {monthDetails.stats.attitude ?? 0}
                    </p>
                  </div>
                  <div className="p-4 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 text-center">
                    <p className="text-xs text-white/50 mb-1">Mistakes</p>
                    <p className="text-2xl font-bold text-[#d4af37]">{monthDetails.stats.mistakes ?? 0}</p>
                  </div>
                  <div className="p-4 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 text-center">
                    <p className="text-xs text-white/50 mb-1">Total Games</p>
                    <p className="text-2xl font-bold text-white">{(monthDetails.stats.totalGames ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              )}

              {/* Error Details */}
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                  <AlertTriangle className="h-4 w-4 text-[#d4af37]" />
                  Errors & Mistakes
                  {errorDetails.length > 0 && (
                    <Badge className="ml-2 bg-[#d4af37]/20 text-[#d4af37] border-[#d4af37]/30">{errorDetails.length}</Badge>
                  )}
                </h3>
                
                {errorDetails.length > 0 ? (
                  <Card className="bg-white/5 backdrop-blur-xl border-white/10 overflow-hidden">
                    <CardContent className="p-0">
                      <div className="divide-y divide-white/10">
                        {errorDetails.map((err: any, index: number) => (
                          <div key={err.id || index} className="p-4 hover:bg-white/5 transition-colors">
                            <div className="flex items-start gap-4">
                              <div className={`shrink-0 p-2.5 rounded-xl ${
                                err.severity === 'critical' ? 'bg-red-500/20' :
                                err.severity === 'high' ? 'bg-orange-500/20' :
                                err.severity === 'medium' ? 'bg-[#d4af37]/20' :
                                'bg-yellow-500/20'
                              }`}>
                                <AlertTriangle className={`h-5 w-5 ${
                                  err.severity === 'critical' ? 'text-red-400' :
                                  err.severity === 'high' ? 'text-orange-400' :
                                  err.severity === 'medium' ? 'text-[#d4af37]' :
                                  'text-yellow-400'
                                }`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  {err.errorType && (
                                    <Badge className="bg-[#d4af37]/20 text-[#d4af37] border-[#d4af37]/30">{err.errorType}</Badge>
                                  )}
                                  {err.gameType && (
                                    <Badge className="bg-white/10 text-white/70 border-white/20">{err.gameType}</Badge>
                                  )}
                                  {err.errorCategory && (
                                    <Badge className="bg-white/10 text-white/70 border-white/20">{err.errorCategory}</Badge>
                                  )}
                                  <Badge className={`${
                                    err.source === 'screenshot' 
                                      ? 'bg-green-500/20 text-green-300 border-green-500/30' 
                                      : 'bg-gray-500/20 text-gray-300 border-gray-500/30'
                                  }`}>
                                    {err.source === 'screenshot' ? 'Screenshot' : 'Excel'}
                                  </Badge>
                                </div>
                                <p className="text-white font-medium text-base">{err.errorDescription || 'Error recorded'}</p>
                                {err.tableId && <p className="text-sm text-white/50 mt-1">Table: {err.tableId}</p>}
                                <div className="flex items-center gap-4 mt-2">
                                  <p className="text-xs text-white/30">
                                    {err.errorDate ? format(new Date(err.errorDate), "MMM d, yyyy") :
                                     err.createdAt ? format(new Date(err.createdAt), "MMM d, yyyy") : "Unknown date"}
                                  </p>
                                  {err.screenshotUrl && (
                                    <a href={err.screenshotUrl} target="_blank" rel="noopener noreferrer"
                                      className="text-xs text-[#d4af37] hover:text-[#e6c84b] flex items-center gap-1">
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
                  <Card className="bg-white/5 backdrop-blur-xl border-white/10">
                    <CardContent className="py-10 text-center">
                      <Shield className="h-10 w-10 text-green-400/50 mx-auto mb-3" />
                      <p className="text-white/50 font-medium">No errors recorded for {MONTH_NAMES[detailMonth - 1]} {detailYear}</p>
                      <p className="text-xs text-white/30 mt-1">Great job keeping it clean!</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Attitude Feedback */}
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-white">
                  <Heart className="h-4 w-4 text-pink-400" />
                  Attitude Feedback
                  {attitudeDetails.length > 0 && (
                    <Badge className="ml-2 bg-pink-500/20 text-pink-300 border-pink-500/30">{attitudeDetails.length}</Badge>
                  )}
                </h3>
                
                {attitudeDetails.length > 0 ? (
                  <div className="space-y-3">
                    {/* Attitude summary */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-green-500/10 rounded-xl border border-green-500/20 text-center">
                        <ThumbsUp className="h-5 w-5 text-green-400 mx-auto mb-1" />
                        <p className="text-lg font-bold text-green-400">
                          {attitudeDetails.filter((a: any) => a.attitudeType === 'positive' || (a.attitudeScore && a.attitudeScore > 0)).length}
                        </p>
                        <p className="text-xs text-white/40">Positive</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-center">
                        <span className="text-lg text-white/40 block mb-1">—</span>
                        <p className="text-lg font-bold text-white/50">
                          {attitudeDetails.filter((a: any) => a.attitudeType === 'neutral').length}
                        </p>
                        <p className="text-xs text-white/40">Neutral</p>
                      </div>
                      <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-center">
                        <ThumbsDown className="h-5 w-5 text-red-400 mx-auto mb-1" />
                        <p className="text-lg font-bold text-red-400">
                          {attitudeDetails.filter((a: any) => a.attitudeType === 'negative' || (a.attitudeScore && a.attitudeScore < 0)).length}
                        </p>
                        <p className="text-xs text-white/40">Negative</p>
                      </div>
                    </div>

                    {/* Individual attitude entries */}
                    <Card className="bg-white/5 backdrop-blur-xl border-white/10 overflow-hidden">
                      <CardContent className="p-0">
                        <div className="divide-y divide-white/10">
                          {attitudeDetails.map((att: any) => {
                            const isPositive = att.attitudeType === 'positive' || (att.attitudeScore && att.attitudeScore > 0);
                            const isNegative = att.attitudeType === 'negative' || (att.attitudeScore && att.attitudeScore < 0);
                            return (
                              <div key={att.id} className="p-4 hover:bg-white/5 transition-colors">
                                <div className="flex items-start gap-4">
                                  <div className={`shrink-0 p-2.5 rounded-xl ${
                                    isPositive ? 'bg-green-500/20' : isNegative ? 'bg-red-500/20' : 'bg-white/10'
                                  }`}>
                                    {isPositive ? (
                                      <ThumbsUp className="h-5 w-5 text-green-400" />
                                    ) : isNegative ? (
                                      <ThumbsDown className="h-5 w-5 text-red-400" />
                                    ) : (
                                      <span className="h-5 w-5 flex items-center justify-center text-white/40">—</span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge className={`${
                                        isPositive ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                                        isNegative ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                        'bg-white/10 text-white/60 border-white/20'
                                      }`}>
                                        {isPositive ? '+1 Positive' : isNegative ? '-1 Negative' : 'Neutral'}
                                      </Badge>
                                      {att.attitudeCategory && (
                                        <Badge className="bg-white/10 text-white/60 border-white/20">{att.attitudeCategory}</Badge>
                                      )}
                                    </div>
                                    {(att.comment || att.description) && (
                                      <p className="text-white/80 text-sm mt-2">{att.comment || att.description}</p>
                                    )}
                                    <div className="flex items-center gap-4 mt-2">
                                      {att.evaluatorName && (
                                        <p className="text-xs text-white/30">By: {att.evaluatorName}</p>
                                      )}
                                      <p className="text-xs text-white/30">
                                        {att.evaluationDate ? format(new Date(att.evaluationDate), "MMM d, yyyy") :
                                         att.createdAt ? format(new Date(att.createdAt), "MMM d, yyyy") : ""}
                                      </p>
                                      {att.screenshotUrl && (
                                        <a href={att.screenshotUrl} target="_blank" rel="noopener noreferrer"
                                          className="text-xs text-[#d4af37] hover:text-[#e6c84b] flex items-center gap-1">
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
                  <Card className="bg-white/5 backdrop-blur-xl border-white/10">
                    <CardContent className="py-10 text-center">
                      <Heart className="h-10 w-10 text-pink-400/30 mx-auto mb-3" />
                      <p className="text-white/50 font-medium">No attitude feedback for {MONTH_NAMES[detailMonth - 1]} {detailYear}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 mt-10 relative z-10">
        <div className="container text-center">
          <p className="text-white/30 text-sm">GP Performance Dashboard — Auto-refreshes every 30 seconds</p>
        </div>
      </footer>
    </div>
  );
}
