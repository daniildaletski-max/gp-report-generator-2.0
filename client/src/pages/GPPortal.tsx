import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { 
  Star, Calendar, Gamepad2, Eye, Sparkles, Scissors, Palette, Shirt, 
  PersonStanding, Loader2, AlertCircle, TrendingUp, AlertTriangle, Trophy, 
  Target, Gift, ThumbsUp, ThumbsDown, RefreshCw, ChevronDown, ChevronUp, BarChart3,
  Clock, Award, Zap, TrendingDown, Flame, Crown, Medal, Gem, Heart, Shield
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect, useMemo } from "react";

// Animated background component
function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* Gradient orbs */}
      <div className="absolute top-0 -left-40 w-80 h-80 bg-purple-500/30 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-indigo-500/25 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-cyan-500/20 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '0.5s' }} />
      
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
    </div>
  );
}

// Score card component - modern card-based design
function ScoreCard({ score, maxScore, label, icon: Icon, gradient }: { 
  score: number; 
  maxScore: number; 
  label: string;
  icon: typeof Star;
  gradient: string;
}) {
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  
  const getStatus = () => {
    if (percentage >= 90) return { text: 'Excellent', color: 'text-emerald-400' };
    if (percentage >= 80) return { text: 'Great', color: 'text-green-400' };
    if (percentage >= 70) return { text: 'Good', color: 'text-yellow-400' };
    return { text: 'Needs Work', color: 'text-orange-400' };
  };
  
  const status = getStatus();
  
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 sm:p-6`}>
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2.5 bg-white/10 rounded-xl">
            <Icon className="h-5 w-5 text-white" />
          </div>
          <span className={`text-sm font-medium ${status.color}`}>{status.text}</span>
        </div>
        
        <div className="mb-3">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-4xl font-bold text-white">{score.toFixed(1)}</span>
            <span className="text-lg text-white/50">/{maxScore}</span>
          </div>
          <p className="text-sm text-white/70 mt-1">{label}</p>
        </div>
        
        {/* Progress bar */}
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white/80 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Achievement badge component
function AchievementBadge({ icon: Icon, title, description, unlocked, color }: {
  icon: typeof Star;
  title: string;
  description: string;
  unlocked: boolean;
  color: string;
}) {
  return (
    <div className={`relative p-3 rounded-xl border transition-all duration-300 ${
      unlocked 
        ? `bg-gradient-to-br ${color} border-white/20 shadow-lg` 
        : 'bg-white/5 border-white/10 opacity-50'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${unlocked ? 'bg-white/20' : 'bg-white/5'}`}>
          <Icon className={`h-5 w-5 ${unlocked ? 'text-white' : 'text-white/50'}`} />
        </div>
        <div>
          <p className={`font-semibold text-sm ${unlocked ? 'text-white' : 'text-white/50'}`}>{title}</p>
          <p className={`text-xs ${unlocked ? 'text-white/70' : 'text-white/30'}`}>{description}</p>
        </div>
      </div>
      {unlocked && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
          <span className="text-[10px] text-white">✓</span>
        </div>
      )}
    </div>
  );
}

// Stat card with animation
function StatCard({ icon: Icon, value, label, color, trend }: {
  icon: typeof Eye;
  value: string | number;
  label: string;
  color: string;
  trend?: number;
}) {
  return (
    <Card className={`bg-gradient-to-br ${color} backdrop-blur-lg border-white/10 overflow-hidden group hover:scale-[1.02] transition-all duration-300`}>
      <CardContent className="p-4 sm:p-6 relative">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />
        
        <div className="flex items-center gap-3 sm:gap-4 relative">
          <div className="bg-white/20 p-2.5 sm:p-3 rounded-xl shrink-0 shadow-lg">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-2xl sm:text-3xl font-bold text-white">{value}</p>
              {trend !== undefined && trend !== 0 && (
                <div className={`flex items-center text-xs ${trend > 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{trend > 0 ? '+' : ''}{trend.toFixed(1)}</span>
                </div>
              )}
            </div>
            <p className="text-xs sm:text-sm text-white/70 truncate">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GPPortal() {
  const { token } = useParams<{ token: string }>();
  const [expandedEvaluations, setExpandedEvaluations] = useState<Set<number>>(new Set());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  
  const { data, isLoading, error, refetch, isFetching } = trpc.gpAccess.getEvaluationsByToken.useQuery(
    { token: token || "" },
    { 
      enabled: !!token,
      refetchInterval: 30000,
      refetchOnWindowFocus: true,
    }
  );

  useEffect(() => {
    if (data) {
      setLastRefresh(new Date());
    }
  }, [data]);

  const handleManualRefresh = () => {
    refetch();
  };

  const toggleEvaluation = (id: number) => {
    setExpandedEvaluations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Calculate achievements
  const achievements = useMemo(() => {
    if (!data) return [];
    const totalEvals = data.evaluations.length;
    const avgScore = totalEvals > 0 
      ? data.evaluations.reduce((s, e) => s + (e.totalScore || 0), 0) / totalEvals 
      : 0;
    const perfectScores = data.evaluations.filter(e => (e.totalScore || 0) >= 22).length;
    const mistakes = data.monthlyStats?.current?.mistakes ?? 0;
    const attitude = data.monthlyStats?.current?.attitude ?? 0;
    
    return [
      { icon: Star, title: 'First Steps', description: 'Complete your first evaluation', unlocked: totalEvals >= 1, color: 'from-blue-500/30 to-cyan-500/30' },
      { icon: Flame, title: 'On Fire', description: 'Complete 5 evaluations', unlocked: totalEvals >= 5, color: 'from-orange-500/30 to-red-500/30' },
      { icon: Crown, title: 'Excellence', description: 'Average score above 20', unlocked: avgScore >= 20, color: 'from-yellow-500/30 to-amber-500/30' },
      { icon: Gem, title: 'Perfect Score', description: 'Get a perfect 22/22', unlocked: perfectScores > 0, color: 'from-purple-500/30 to-pink-500/30' },
      { icon: Shield, title: 'Flawless', description: 'Zero mistakes this month', unlocked: mistakes === 0, color: 'from-green-500/30 to-emerald-500/30' },
      { icon: Heart, title: 'Team Player', description: 'Positive attitude score', unlocked: attitude > 0, color: 'from-pink-500/30 to-rose-500/30' },
    ];
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <AnimatedBackground />
        <div className="text-center relative z-10">
          <div className="relative">
            <div className="absolute inset-0 bg-[#67B2E7]/30 rounded-full blur-2xl animate-pulse" />
            <Loader2 className="h-20 w-20 animate-spin text-[#67B2E7] mx-auto mb-6 relative" />
          </div>
          <p className="text-[#E4F4FC] text-xl font-medium">Loading your dashboard...</p>
          <p className="text-[#94A2D6] text-sm mt-2">Please wait a moment</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-red-950 to-orange-950 flex items-center justify-center p-4">
        <AnimatedBackground />
        <Card className="max-w-md w-full bg-white/5 backdrop-blur-xl border-red-500/30 relative z-10">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 p-4 bg-red-500/20 rounded-full w-fit">
              <AlertCircle className="h-16 w-16 text-red-400" />
            </div>
            <CardTitle className="text-red-100 text-2xl">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-red-200/80 text-base mb-6">
              This link is invalid or has expired. Please contact your Floor Manager for a new access link.
            </p>
            <Button variant="outline" className="border-red-500/30 text-red-200 hover:bg-red-500/20">
              Request New Link
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate stats
  const totalEvaluations = data.evaluations.length;
  const avgAppearance = totalEvaluations > 0 
    ? data.evaluations.reduce((sum, e) => sum + (e.appearanceScore || 0), 0) / totalEvaluations 
    : 0;
  const avgGamePerf = totalEvaluations > 0 
    ? data.evaluations.reduce((sum, e) => sum + (e.gamePerformanceTotalScore || 0), 0) / totalEvaluations 
    : 0;
  const avgTotal = totalEvaluations > 0
    ? data.evaluations.reduce((sum, e) => sum + (e.totalScore || 0), 0) / totalEvaluations
    : 0;
  
  const recentEvaluations = data.evaluations.filter(e => {
    if (!e.evaluationDate) return false;
    const evalDate = new Date(e.evaluationDate);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return evalDate >= weekAgo;
  });

  const last3 = data.evaluations.slice(0, 3);
  const prev3 = data.evaluations.slice(3, 6);
  const last3Avg = last3.length > 0 ? last3.reduce((s, e) => s + (e.totalScore || 0), 0) / last3.length : 0;
  const prev3Avg = prev3.length > 0 ? prev3.reduce((s, e) => s + (e.totalScore || 0), 0) / prev3.length : 0;
  const trend = last3Avg - prev3Avg;

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Get motivational message based on performance
  const getMotivationalMessage = () => {
    if (avgTotal >= 20) return "Outstanding performance! Keep up the excellent work! 🌟";
    if (avgTotal >= 18) return "Great job! You're doing really well! 💪";
    if (avgTotal >= 15) return "Good progress! Keep pushing forward! 📈";
    if (totalEvaluations === 0) return "Welcome! Your journey starts here! 🚀";
    return "Every day is a chance to improve! 💫";
  };

  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      
      {/* Header */}
      <header className="glass-strong border-b border-white/10 sticky top-0 z-50">
        <div className="container py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Logo and Greeting */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[#67B2E7] to-[#5B62B2] rounded-2xl blur-lg opacity-50" />
                <div className="relative bg-gradient-to-br from-[#67B2E7] to-[#5B62B2] text-white p-3 sm:p-4 rounded-2xl shadow-2xl">
                  <Star className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
              </div>
              <div>
                <p className="text-[#94A2D6] text-sm">{getGreeting()},</p>
                <h1 className="text-xl sm:text-2xl font-bold gradient-text">{data.gpName}</h1>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-xs text-muted-foreground">Last updated</p>
                <p className="text-sm text-foreground/80">{formatDistanceToNow(lastRefresh, { addSuffix: true })}</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleManualRefresh}
                disabled={isFetching}
                className="glass border-white/20 hover:bg-white/10"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                <span className="ml-2">Refresh</span>
              </Button>
            </div>
          </div>
          
          {/* Motivational message */}
          <div className="mt-3 px-4 py-2 glass rounded-xl border border-white/5">
            <p className="text-sm text-foreground/80">{getMotivationalMessage()}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 sm:py-10 space-y-6 sm:space-y-10 relative z-10">
        
        {/* Performance Overview - Score Cards */}
        <section>
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-white">
            <Trophy className="h-5 w-5 text-yellow-400" />
            Performance Overview
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ScoreCard 
              score={avgTotal} 
              maxScore={22} 
              label="Overall Score" 
              icon={Trophy}
              gradient="from-amber-600/80 to-orange-700/80"
            />
            <ScoreCard 
              score={avgAppearance} 
              maxScore={12} 
              label="Appearance" 
              icon={Sparkles}
              gradient="from-pink-600/80 to-rose-700/80"
            />
            <ScoreCard 
              score={avgGamePerf} 
              maxScore={10} 
              label="Game Performance" 
              icon={Gamepad2}
              gradient="from-violet-600/80 to-purple-700/80"
            />
          </div>
        </section>

        {/* Quick Stats */}
        <section>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard 
              icon={Eye} 
              value={totalEvaluations} 
              label="Total Evaluations" 
              color="from-blue-600/40 to-blue-800/40"
            />
            <StatCard 
              icon={AlertTriangle} 
              value={data.monthlyStats?.current?.mistakes ?? 0} 
              label="Monthly Mistakes" 
              color={(data.monthlyStats?.current?.mistakes ?? 0) === 0 
                ? "from-green-600/40 to-green-800/40" 
                : "from-orange-600/40 to-orange-800/40"}
            />
            <StatCard 
              icon={(data.monthlyStats?.current?.attitude ?? 0) >= 0 ? ThumbsUp : ThumbsDown} 
              value={`${(data.monthlyStats?.current?.attitude ?? 0) > 0 ? '+' : ''}${data.monthlyStats?.current?.attitude ?? 0}`} 
              label="Attitude Score" 
              color={(data.monthlyStats?.current?.attitude ?? 0) >= 0 
                ? "from-green-600/40 to-emerald-800/40" 
                : "from-red-600/40 to-red-800/40"}
            />
            <StatCard 
              icon={Gamepad2} 
              value={(data.monthlyStats?.current?.totalGames ?? 0).toLocaleString()} 
              label="Total Games" 
              color="from-purple-600/40 to-purple-800/40"
            />
          </div>
        </section>

        {/* Achievements */}
        <section>
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-white">
            <Medal className="h-5 w-5 text-amber-400" />
            Achievements
            <Badge className="ml-2 bg-white/10 text-white/70">
              {achievements.filter(a => a.unlocked).length}/{achievements.length}
            </Badge>
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {achievements.map((achievement, index) => (
              <AchievementBadge key={index} {...achievement} />
            ))}
          </div>
        </section>

        {/* Trend & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Performance Trend */}
          <Card className="bg-white/5 backdrop-blur-xl border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-400" />
                Performance Trend
              </CardTitle>
              <CardDescription className="text-blue-200/60">
                Comparing your last 3 evaluations vs previous 3
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.evaluations.length >= 2 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <span className="text-blue-200/70">Recent Average</span>
                    <span className="text-2xl font-bold text-white">{last3Avg.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <span className="text-blue-200/70">Previous Average</span>
                    <span className="text-xl text-blue-200/80">{prev3Avg.toFixed(1)}</span>
                  </div>
                  <Separator className="bg-white/10" />
                  <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-white/5 to-white/10">
                    <span className="text-blue-200/70 font-medium">Trend</span>
                    <div className={`flex items-center gap-2 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trend >= 0 ? (
                        <TrendingUp className="h-6 w-6" />
                      ) : (
                        <TrendingDown className="h-6 w-6" />
                      )}
                      <span className="text-2xl font-bold">
                        {trend >= 0 ? '+' : ''}{trend.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-blue-200/50">
                  <div className="mx-auto mb-4 p-4 bg-white/5 rounded-full w-fit">
                    <BarChart3 className="h-12 w-12 opacity-50" />
                  </div>
                  <p className="font-medium">Need more evaluations</p>
                  <p className="text-sm mt-1">Complete more evaluations to see your trend</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-white/5 backdrop-blur-xl border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                Recent Activity
              </CardTitle>
              <CardDescription className="text-blue-200/60">
                Evaluations in the last 7 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentEvaluations.length > 0 ? (
                <div className="space-y-3">
                  {recentEvaluations.slice(0, 4).map((eval_) => (
                    <div key={eval_.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full shadow-lg ${
                          (eval_.totalScore || 0) >= 20 ? 'bg-green-400 shadow-green-400/50' :
                          (eval_.totalScore || 0) >= 18 ? 'bg-yellow-400 shadow-yellow-400/50' : 
                          'bg-red-400 shadow-red-400/50'
                        }`} />
                        <div>
                          <p className="text-white font-medium">
                            {eval_.evaluationDate 
                              ? format(new Date(eval_.evaluationDate), "MMM d, yyyy")
                              : "Unknown"}
                          </p>
                          <p className="text-xs text-blue-200/50">{eval_.game || 'Game'}</p>
                        </div>
                      </div>
                      <Badge className={`text-lg px-3 py-1 ${
                        (eval_.totalScore || 0) >= 20 ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                        (eval_.totalScore || 0) >= 18 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 
                        'bg-red-500/20 text-red-300 border-red-500/30'
                      }`}>
                        {eval_.totalScore}/22
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-blue-200/50">
                  <div className="mx-auto mb-4 p-4 bg-white/5 rounded-full w-fit">
                    <Clock className="h-12 w-12 opacity-50" />
                  </div>
                  <p className="font-medium">No recent evaluations</p>
                  <p className="text-sm mt-1">Check back after your next evaluation</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bonus Status */}
        {data.monthlyStats?.current && (
          <section>
            <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-white">
              <Gift className="h-5 w-5 text-pink-400" />
              Bonus Status
            </h2>
            
            <Card className={`overflow-hidden ${
              data.monthlyStats.current.bonus.eligible 
                ? 'bg-gradient-to-br from-green-500/20 via-emerald-500/10 to-teal-500/20 border-green-500/30' 
                : 'bg-white/5 border-white/10'
            } backdrop-blur-xl`}>
              <CardContent className="p-6 sm:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Status */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-4 rounded-2xl ${
                        data.monthlyStats.current.bonus.eligible 
                          ? 'bg-green-500/30' 
                          : 'bg-white/10'
                      }`}>
                        <Award className={`h-10 w-10 ${
                          data.monthlyStats.current.bonus.eligible 
                            ? 'text-green-300' 
                            : 'text-white/50'
                        }`} />
                      </div>
                      <div>
                        {data.monthlyStats.current.bonus.eligible ? (
                          <>
                            <p className="text-2xl font-bold text-green-300">
                              Level {data.monthlyStats.current.bonus.level} Bonus
                            </p>
                            <p className="text-green-200/70">
                              €{data.monthlyStats.current.bonus.rate?.toFixed(2)}/hour extra
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xl font-bold text-white">Not Yet Eligible</p>
                            <p className="text-blue-200/70">Keep working towards your bonus!</p>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="p-4 bg-white/5 rounded-xl">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-blue-200/70">Good Games (GGs)</span>
                        <span className="text-white font-bold">
                          {data.monthlyStats.current.bonus.goodGames?.toLocaleString() ?? 0}
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(((data.monthlyStats.current.bonus.goodGames ?? 0) / 2500) * 100, 100)} 
                        className="h-3 bg-white/10"
                      />
                      <p className="text-xs text-blue-200/50 mt-2">
                        {data.monthlyStats.current.bonus.goodGames >= 2500 
                          ? 'Level 1 achieved! 🎉' 
                          : `${(2500 - (data.monthlyStats.current.bonus.goodGames ?? 0)).toLocaleString()} more GGs to Level 1`}
                      </p>
                    </div>
                  </div>
                  
                  {/* Right: Bonus levels info */}
                  <div className="space-y-3">
                    <p className="text-sm text-blue-200/70 font-medium">Bonus Levels</p>
                    <div className={`p-3 rounded-lg border ${
                      data.monthlyStats.current.bonus.level === 1 
                        ? 'bg-green-500/20 border-green-500/30' 
                        : 'bg-white/5 border-white/10'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className="text-white">Level 1</span>
                        <span className="text-green-300">€1.50/hr</span>
                      </div>
                      <p className="text-xs text-blue-200/50 mt-1">Minimum 2,500 GGs</p>
                    </div>
                    <div className={`p-3 rounded-lg border ${
                      data.monthlyStats.current.bonus.level === 2 
                        ? 'bg-green-500/20 border-green-500/30' 
                        : 'bg-white/5 border-white/10'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className="text-white">Level 2</span>
                        <span className="text-green-300">€2.50/hr</span>
                      </div>
                      <p className="text-xs text-blue-200/50 mt-1">Minimum 5,000 GGs</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Evaluation History */}
        <section>
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-white">
            <Calendar className="h-5 w-5 text-cyan-400" />
            Evaluation History
          </h2>
          
          {data.evaluations.length > 0 ? (
            <div className="space-y-3">
              {data.evaluations.map((evaluation) => {
                const isExpanded = expandedEvaluations.has(evaluation.id);
                return (
                  <Card 
                    key={evaluation.id} 
                    className="bg-white/5 backdrop-blur-xl border-white/10 overflow-hidden hover:bg-white/[0.07] transition-all"
                  >
                    <CardContent className="p-0">
                      <button
                        onClick={() => toggleEvaluation(evaluation.id)}
                        className="w-full p-4 sm:p-5 flex items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${
                            (evaluation.totalScore || 0) >= 20 
                              ? 'bg-green-500/20 text-green-300' 
                              : (evaluation.totalScore || 0) >= 18 
                              ? 'bg-yellow-500/20 text-yellow-300' 
                              : 'bg-red-500/20 text-red-300'
                          }`}>
                            {evaluation.totalScore}
                          </div>
                          <div>
                            <p className="font-semibold text-white">
                              {evaluation.evaluationDate 
                                ? format(new Date(evaluation.evaluationDate), "MMMM d, yyyy")
                                : "Unknown Date"}
                            </p>
                            <p className="text-sm text-blue-200/60">{evaluation.game || 'Game Session'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="hidden sm:flex gap-2">
                            <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                              <Sparkles className="h-3 w-3 mr-1" />
                              {evaluation.appearanceScore}/12
                            </Badge>
                            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                              <Gamepad2 className="h-3 w-3 mr-1" />
                              {evaluation.gamePerformanceTotalScore}/10
                            </Badge>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-blue-200/50" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-blue-200/50" />
                          )}
                        </div>
                      </button>
                      
                      {isExpanded && (
                        <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-white/10 space-y-4 animate-in slide-in-from-top-2">
                          {/* Mobile badges */}
                          <div className="flex gap-2 sm:hidden">
                            <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                              <Sparkles className="h-3 w-3 mr-1" />
                              Appearance: {evaluation.appearanceScore}/12
                            </Badge>
                            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                              <Gamepad2 className="h-3 w-3 mr-1" />
                              Game: {evaluation.gamePerformanceTotalScore}/10
                            </Badge>
                          </div>
                          
                          {/* Appearance Details */}
                          <div>
                            <p className="text-sm font-medium text-blue-200/70 mb-3 flex items-center gap-2">
                              <Sparkles className="h-4 w-4" />
                              Appearance Breakdown
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                { icon: Scissors, label: 'Hair', score: evaluation.hairScore, max: 3 },
                                { icon: Palette, label: 'Makeup', score: evaluation.makeupScore, max: 3 },
                                { icon: Shirt, label: 'Outfit', score: evaluation.outfitScore, max: 3 },
                                { icon: PersonStanding, label: 'Posture', score: evaluation.postureScore, max: 3 },
                              ].map((item) => (
                                <div key={item.label} className="p-3 bg-white/5 rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <item.icon className="h-4 w-4 text-green-400" />
                                    <span className="text-xs text-blue-200/70">{item.label}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-white">{item.score ?? 0}</span>
                                    <span className="text-xs text-blue-200/50">/{item.max}</span>
                                  </div>
                                  <Progress 
                                    value={((item.score ?? 0) / item.max) * 100} 
                                    className="h-1.5 mt-2 bg-white/10"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Game Performance Details */}
                          <div>
                            <p className="text-sm font-medium text-blue-200/70 mb-3 flex items-center gap-2">
                              <Gamepad2 className="h-4 w-4" />
                              Game Performance Breakdown
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              {[
                                { label: 'Dealing Style', score: evaluation.dealingStyleScore, max: 5 },
                                { label: 'Game Performance', score: evaluation.gamePerformanceScore, max: 5 },
                              ].map((item) => (
                                <div key={item.label} className="p-3 bg-white/5 rounded-lg">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-blue-200/70">{item.label}</span>
                                    <span className="text-lg font-bold text-white">{item.score ?? 0}/{item.max}</span>
                                  </div>
                                  <Progress 
                                    value={((item.score ?? 0) / item.max) * 100} 
                                    className="h-1.5 bg-white/10"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Comments */}
                          {evaluation.comments && (
                            <div className="p-4 bg-white/5 rounded-lg">
                              <p className="text-sm font-medium text-blue-200/70 mb-2">Comments</p>
                              <p className="text-white/80 text-sm">{evaluation.comments}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="bg-white/5 backdrop-blur-xl border-white/10">
              <CardContent className="py-16 text-center">
                <div className="mx-auto mb-6 p-6 bg-white/5 rounded-full w-fit">
                  <Calendar className="h-16 w-16 text-blue-200/30" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">No evaluations yet</h3>
                <p className="text-blue-200/60 max-w-md mx-auto">
                  Your evaluation history will appear here after your first evaluation. Keep up the great work!
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Error Details */}
        {data.errorDetails && data.errorDetails.length > 0 && (
          <section>
            <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              Error Details This Month
              <Badge className="ml-2 bg-orange-500/20 text-orange-300 border-orange-500/30">
                {data.errorDetails.length}
              </Badge>
            </h2>
            
            <Card className="bg-white/5 backdrop-blur-xl border-white/10 overflow-hidden">
              <CardContent className="p-0">
                <div className="divide-y divide-white/10">
                  {data.errorDetails.map((error, index) => (
                    <div key={error.id || index} className="p-4 hover:bg-white/5 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className={`shrink-0 p-2.5 rounded-xl ${
                          error.severity === 'high' || error.severity === 'HIGH' ? 'bg-red-500/20' :
                          error.severity === 'medium' || error.severity === 'MEDIUM' ? 'bg-orange-500/20' :
                          'bg-yellow-500/20'
                        }`}>
                          <AlertTriangle className={`h-5 w-5 ${
                            error.severity === 'high' || error.severity === 'HIGH' ? 'text-red-400' :
                            error.severity === 'medium' || error.severity === 'MEDIUM' ? 'text-orange-400' :
                            'text-yellow-400'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {error.errorType && (
                              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                                {error.errorType}
                              </Badge>
                            )}
                            {error.gameType && (
                              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                                {error.gameType}
                              </Badge>
                            )}
                            {error.errorCategory && (
                              <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                                {error.errorCategory}
                              </Badge>
                            )}
                            <Badge className={`${
                              error.source === 'screenshot' 
                                ? 'bg-green-500/20 text-green-300 border-green-500/30' 
                                : 'bg-gray-500/20 text-gray-300 border-gray-500/30'
                            }`}>
                              {error.source === 'screenshot' ? 'Screenshot' : 'Excel'}
                            </Badge>
                          </div>
                          
                          <p className="text-white font-medium text-base">
                            {error.errorDescription || 'Error recorded'}
                          </p>
                          
                          {error.tableId && (
                            <p className="text-sm text-blue-200/60 mt-1">Table: {error.tableId}</p>
                          )}
                          
                          <div className="flex items-center gap-4 mt-2">
                            <p className="text-xs text-blue-200/40">
                              {error.errorDate 
                                ? format(new Date(error.errorDate), "MMM d, yyyy")
                                : error.createdAt
                                ? format(new Date(error.createdAt), "MMM d, yyyy")
                                : "Unknown date"}
                            </p>
                            {error.screenshotUrl && (
                              <a 
                                href={error.screenshotUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                              >
                                <Eye className="h-3 w-3" />
                                View Screenshot
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
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 mt-10 relative z-10">
        <div className="container text-center">
          <p className="text-blue-200/40 text-sm">
            GP Performance Dashboard • Auto-refreshes every 30 seconds
          </p>
        </div>
      </footer>
    </div>
  );
}
