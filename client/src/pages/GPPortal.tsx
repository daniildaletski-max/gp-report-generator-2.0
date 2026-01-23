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
  Clock, Award, Zap, TrendingDown
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";

export default function GPPortal() {
  const { token } = useParams<{ token: string }>();
  const [expandedEvaluations, setExpandedEvaluations] = useState<Set<number>>(new Set());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  
  const { data, isLoading, error, refetch, isFetching } = trpc.gpAccess.getEvaluationsByToken.useQuery(
    { token: token || "" },
    { 
      enabled: !!token,
      refetchInterval: 30000, // Auto-refresh every 30 seconds
      refetchOnWindowFocus: true,
    }
  );

  // Update last refresh time when data changes
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse" />
            <Loader2 className="h-16 w-16 animate-spin text-blue-400 mx-auto mb-4 relative" />
          </div>
          <p className="text-blue-200 text-lg">Loading your evaluations...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-orange-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-white/10 backdrop-blur-lg border-red-500/30">
          <CardHeader className="text-center">
            <AlertCircle className="h-20 w-20 text-red-400 mx-auto mb-4" />
            <CardTitle className="text-red-100 text-2xl">Access Denied</CardTitle>
            <CardDescription className="text-red-200/80 text-base">
              This link is invalid or has expired. Please contact your Floor Manager for a new access link.
            </CardDescription>
          </CardHeader>
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
  
  // Get recent evaluation (last 7 days)
  const recentEvaluations = data.evaluations.filter(e => {
    if (!e.evaluationDate) return false;
    const evalDate = new Date(e.evaluationDate);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return evalDate >= weekAgo;
  });

  // Calculate trend (compare last 3 vs previous 3)
  const last3 = data.evaluations.slice(0, 3);
  const prev3 = data.evaluations.slice(3, 6);
  const last3Avg = last3.length > 0 ? last3.reduce((s, e) => s + (e.totalScore || 0), 0) / last3.length : 0;
  const prev3Avg = prev3.length > 0 ? prev3.reduce((s, e) => s + (e.totalScore || 0), 0) / prev3.length : 0;
  const trend = last3Avg - prev3Avg;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
      {/* Header - Mobile Optimized */}
      <header className="bg-white/5 backdrop-blur-lg border-b border-white/10 sticky top-0 z-50">
        <div className="container py-3 sm:py-4">
          {/* Mobile: Stack vertically, Desktop: Side by side */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Logo and Title */}
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-2 sm:p-3 rounded-xl shadow-lg shadow-blue-500/30">
                <Star className="h-5 w-5 sm:h-7 sm:w-7" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white">My Performance</h1>
                <p className="text-xs sm:text-sm text-blue-200/70">Game Presenter Dashboard</p>
              </div>
            </div>
            
            {/* Name Badge and Refresh - Mobile: Full width row */}
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
              <Badge className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm sm:text-lg px-3 sm:px-4 py-1.5 sm:py-2 shadow-lg truncate max-w-[200px] sm:max-w-none">
                {data.gpName}
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleManualRefresh}
                disabled={isFetching}
                className="text-blue-200 hover:text-white hover:bg-white/10 shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline ml-2">Refresh</span>
              </Button>
            </div>
          </div>
          
          {/* Last updated - smaller on mobile */}
          <div className="mt-2 text-[10px] sm:text-xs text-blue-300/50 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span className="hidden sm:inline">Last updated: </span>
            {formatDistanceToNow(lastRefresh, { addSuffix: true })}
            {isFetching && <span className="ml-2 text-blue-400">• Syncing...</span>}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-4 sm:py-8 space-y-4 sm:space-y-8">
        {/* Hero Stats - 2 cols on mobile, 5 on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
          <Card className="bg-white/5 backdrop-blur-lg border-white/10 overflow-hidden group hover:bg-white/10 transition-all">
            <CardContent className="p-3 sm:pt-6 sm:px-6 relative">
              <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="bg-blue-500/20 p-2 sm:p-3 rounded-lg sm:rounded-xl shrink-0">
                  <Eye className="h-4 w-4 sm:h-6 sm:w-6 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-3xl font-bold text-white">{totalEvaluations}</p>
                  <p className="text-[10px] sm:text-sm text-blue-200/70 truncate">Total Evaluations</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white/5 backdrop-blur-lg border-white/10 overflow-hidden group hover:bg-white/10 transition-all">
            <CardContent className="p-3 sm:pt-6 sm:px-6 relative">
              <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-green-500/10 rounded-full blur-2xl group-hover:bg-green-500/20 transition-all" />
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="bg-green-500/20 p-2 sm:p-3 rounded-lg sm:rounded-xl shrink-0">
                  <Sparkles className="h-4 w-4 sm:h-6 sm:w-6 text-green-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-3xl font-bold text-white">
                    {totalEvaluations > 0 ? avgAppearance.toFixed(1) : "—"}
                  </p>
                  <p className="text-[10px] sm:text-sm text-green-200/70 truncate">Avg Appearance</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white/5 backdrop-blur-lg border-white/10 overflow-hidden group hover:bg-white/10 transition-all">
            <CardContent className="p-3 sm:pt-6 sm:px-6 relative">
              <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all" />
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="bg-purple-500/20 p-2 sm:p-3 rounded-lg sm:rounded-xl shrink-0">
                  <Gamepad2 className="h-4 w-4 sm:h-6 sm:w-6 text-purple-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-3xl font-bold text-white">
                    {totalEvaluations > 0 ? avgGamePerf.toFixed(1) : "—"}
                  </p>
                  <p className="text-[10px] sm:text-sm text-purple-200/70 truncate">Avg Game Perf.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 backdrop-blur-lg border-white/10 overflow-hidden group hover:bg-white/10 transition-all">
            <CardContent className="p-3 sm:pt-6 sm:px-6 relative">
              <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-yellow-500/10 rounded-full blur-2xl group-hover:bg-yellow-500/20 transition-all" />
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="bg-yellow-500/20 p-2 sm:p-3 rounded-lg sm:rounded-xl shrink-0">
                  <Award className="h-4 w-4 sm:h-6 sm:w-6 text-yellow-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-3xl font-bold text-white">
                    {totalEvaluations > 0 ? avgTotal.toFixed(1) : "—"}
                  </p>
                  <p className="text-[10px] sm:text-sm text-yellow-200/70 truncate">Avg Total Score</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Mistakes Card */}
          <Card className="bg-white/5 backdrop-blur-lg border-white/10 overflow-hidden group hover:bg-white/10 transition-all">
            <CardContent className="p-3 sm:pt-6 sm:px-6 relative">
              <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-orange-500/10 rounded-full blur-2xl group-hover:bg-orange-500/20 transition-all" />
              <div className="flex items-center gap-2 sm:gap-4">
                <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl shrink-0 ${
                  (data.monthlyStats?.current?.mistakes ?? 0) === 0 
                    ? 'bg-green-500/20' 
                    : 'bg-orange-500/20'
                }`}>
                  <AlertTriangle className={`h-4 w-4 sm:h-6 sm:w-6 ${
                    (data.monthlyStats?.current?.mistakes ?? 0) === 0 
                      ? 'text-green-400' 
                      : 'text-orange-400'
                  }`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xl sm:text-3xl font-bold ${
                    (data.monthlyStats?.current?.mistakes ?? 0) === 0 
                      ? 'text-green-400' 
                      : 'text-orange-400'
                  }`}>
                    {data.monthlyStats?.current?.mistakes ?? 0}
                  </p>
                  <p className="text-[10px] sm:text-sm text-orange-200/70 truncate">Monthly Mistakes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trend & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
          {/* Performance Trend */}
          <Card className="bg-white/5 backdrop-blur-lg border-white/10">
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
                  <div className="flex items-center justify-between">
                    <span className="text-blue-200/70">Recent Average</span>
                    <span className="text-2xl font-bold text-white">{last3Avg.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-200/70">Previous Average</span>
                    <span className="text-xl text-blue-200/80">{prev3Avg.toFixed(1)}</span>
                  </div>
                  <Separator className="bg-white/10" />
                  <div className="flex items-center justify-between">
                    <span className="text-blue-200/70">Trend</span>
                    <div className={`flex items-center gap-2 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trend >= 0 ? (
                        <TrendingUp className="h-5 w-5" />
                      ) : (
                        <TrendingDown className="h-5 w-5" />
                      )}
                      <span className="text-xl font-bold">
                        {trend >= 0 ? '+' : ''}{trend.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-blue-200/50">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Need more evaluations to show trend</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-white/5 backdrop-blur-lg border-white/10">
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
                  {recentEvaluations.slice(0, 3).map((eval_) => (
                    <div key={eval_.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          (eval_.totalScore || 0) >= 18 ? 'bg-green-400' :
                          (eval_.totalScore || 0) >= 15 ? 'bg-yellow-400' : 'bg-red-400'
                        }`} />
                        <div>
                          <p className="text-white font-medium">
                            {eval_.evaluationDate 
                              ? format(new Date(eval_.evaluationDate), "MMM d")
                              : "Unknown"}
                          </p>
                          <p className="text-xs text-blue-200/50">{eval_.game || 'Game'}</p>
                        </div>
                      </div>
                      <Badge className={`${
                        (eval_.totalScore || 0) >= 18 ? 'bg-green-500/20 text-green-300' :
                        (eval_.totalScore || 0) >= 15 ? 'bg-yellow-500/20 text-yellow-300' : 
                        'bg-red-500/20 text-red-300'
                      }`}>
                        {eval_.totalScore}/22
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-blue-200/50">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No evaluations in the last 7 days</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monthly Stats & Bonus Section */}
        {data.monthlyStats && (
          <div>
            <h2 className="text-base sm:text-xl font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-white">
              <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400" />
              Monthly Performance & Bonus
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
              {/* Current Month Stats */}
              {data.monthlyStats.current && (
                <Card className="bg-gradient-to-br from-blue-500/20 to-indigo-500/20 backdrop-blur-lg border-blue-400/30">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-white">
                      <Target className="h-5 w-5 text-blue-400" />
                      Current Month
                    </CardTitle>
                    <CardDescription className="text-blue-200/70">
                      {new Date(data.monthlyStats.current.year, data.monthlyStats.current.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Attitude */}
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-2">
                        {data.monthlyStats.current.attitude === 1 ? (
                          <ThumbsUp className="h-4 w-4 text-green-400" />
                        ) : data.monthlyStats.current.attitude === -1 ? (
                          <ThumbsDown className="h-4 w-4 text-red-400" />
                        ) : (
                          <Star className="h-4 w-4 text-gray-400" />
                        )}
                        <span className="text-sm font-medium text-white">Attitude</span>
                      </div>
                      <Badge className={`${
                        data.monthlyStats.current.attitude === 1 
                          ? "bg-green-500/30 text-green-300" 
                          : data.monthlyStats.current.attitude === -1 
                          ? "bg-red-500/30 text-red-300" 
                          : "bg-gray-500/30 text-gray-300"
                      }`}>
                        {data.monthlyStats.current.attitude === 1 ? "+1 Positive" : 
                         data.monthlyStats.current.attitude === -1 ? "-1 Negative" : "Neutral"}
                      </Badge>
                    </div>
                    
                    {/* Mistakes */}
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-400" />
                        <span className="text-sm font-medium text-white">Mistakes</span>
                      </div>
                      <Badge className={`${
                        data.monthlyStats.current.mistakes === 0 
                          ? "bg-green-500/30 text-green-300" 
                          : data.monthlyStats.current.mistakes === 1 
                          ? "bg-yellow-500/30 text-yellow-300" 
                          : "bg-red-500/30 text-red-300"
                      }`}>
                        {data.monthlyStats.current.mistakes ?? 0}
                        {data.monthlyStats.current.mistakes === 1 && " (free)"}
                      </Badge>
                    </div>
                    
                    {/* Total Games */}
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Gamepad2 className="h-4 w-4 text-purple-400" />
                        <span className="text-sm font-medium text-white">Total Games</span>
                      </div>
                      <span className="font-bold text-white">{data.monthlyStats.current.totalGames?.toLocaleString() ?? 0}</span>
                    </div>
                    
                    {/* Bonus Status */}
                    <Separator className="bg-white/10" />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Gift className="h-5 w-5 text-yellow-400" />
                        <span className="font-semibold text-white">Bonus Status</span>
                      </div>
                      
                      <div className={`p-4 rounded-xl ${
                        data.monthlyStats.current.bonus.eligible 
                          ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30' 
                          : 'bg-white/5 border border-white/10'
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm">
                            {data.monthlyStats.current.bonus.eligible ? (
                              <span className="text-green-300 font-semibold flex items-center gap-2">
                                <Award className="h-4 w-4" />
                                Eligible - Level {data.monthlyStats.current.bonus.level}
                              </span>
                            ) : (
                              <span className="text-blue-200/70">
                                Not yet eligible
                              </span>
                            )}
                          </span>
                          {data.monthlyStats.current.bonus.eligible && (
                            <Badge className="bg-yellow-500/30 text-yellow-300 text-lg px-3">
                              €{data.monthlyStats.current.bonus.rate}/hour
                            </Badge>
                          )}
                        </div>
                        
                        <div className="text-sm text-blue-200/70 mb-3">
                          Good Games (GGs): <strong className="text-white">{data.monthlyStats.current.bonus.ggs?.toLocaleString() ?? 0}</strong>
                        </div>
                        
                        {/* Progress to next level */}
                        {!data.monthlyStats.current.bonus.eligible && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs text-blue-200/70">
                              <span>Progress to Level 1 (2,500 GGs)</span>
                              <span>{Math.min(100, Math.round((data.monthlyStats.current.bonus.ggs / 2500) * 100))}%</span>
                            </div>
                            <Progress value={Math.min(100, (data.monthlyStats.current.bonus.ggs / 2500) * 100)} className="h-2" />
                          </div>
                        )}
                        {data.monthlyStats.current.bonus.eligible && data.monthlyStats.current.bonus.level === 1 && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs text-blue-200/70">
                              <span>Progress to Level 2 (5,000 GGs)</span>
                              <span>{Math.min(100, Math.round((data.monthlyStats.current.bonus.ggs / 5000) * 100))}%</span>
                            </div>
                            <Progress value={Math.min(100, (data.monthlyStats.current.bonus.ggs / 5000) * 100)} className="h-2" />
                          </div>
                        )}
                        
                        <p className="text-xs text-blue-200/50 mt-3">
                          {data.monthlyStats.current.bonus.reason}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Previous Month Stats */}
              {data.monthlyStats.previous && (
                <Card className="bg-white/5 backdrop-blur-lg border-white/10">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-white">
                      <TrendingUp className="h-5 w-5 text-gray-400" />
                      Previous Month
                    </CardTitle>
                    <CardDescription className="text-blue-200/60">
                      {new Date(data.monthlyStats.previous.year, data.monthlyStats.previous.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <span className="text-sm text-blue-200/70">Attitude</span>
                      <Badge variant="secondary">
                        {data.monthlyStats.previous.attitude === 1 ? "+1" : 
                         data.monthlyStats.previous.attitude === -1 ? "-1" : "0"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <span className="text-sm text-blue-200/70">Mistakes</span>
                      <Badge variant="secondary">{data.monthlyStats.previous.mistakes ?? 0}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <span className="text-sm text-blue-200/70">Total Games</span>
                      <span className="font-medium text-white">{data.monthlyStats.previous.totalGames?.toLocaleString() ?? 0}</span>
                    </div>
                    <Separator className="bg-white/10" />
                    <div className={`p-3 rounded-lg text-center text-sm ${
                      data.monthlyStats.previous.bonus.eligible 
                        ? 'bg-green-500/20 text-green-300' 
                        : 'bg-white/5 text-blue-200/60'
                    }`}>
                      {data.monthlyStats.previous.bonus.eligible 
                        ? `✓ Level ${data.monthlyStats.previous.bonus.level} Bonus (€${data.monthlyStats.previous.bonus.rate}/hr)`
                        : 'No bonus earned'}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* No stats available message */}
              {!data.monthlyStats.current && !data.monthlyStats.previous && (
                <Card className="col-span-2 bg-white/5 backdrop-blur-lg border-white/10">
                  <CardContent className="py-12 text-center">
                    <Trophy className="h-16 w-16 text-blue-300/30 mx-auto mb-4" />
                    <p className="text-blue-200/60">No monthly stats available yet. Your FM will update your performance data.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Evaluations List */}
        <div>
          <h2 className="text-base sm:text-xl font-semibold mb-3 sm:mb-4 text-white flex items-center gap-2">
            <Eye className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
            Evaluation History
            {totalEvaluations > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs sm:text-sm">{totalEvaluations}</Badge>
            )}
          </h2>
          
          {data.evaluations.length === 0 ? (
            <Card className="bg-white/5 backdrop-blur-lg border-white/10">
              <CardContent className="py-10 sm:py-16 text-center">
                <Eye className="h-12 w-12 sm:h-16 sm:w-16 text-blue-300/30 mx-auto mb-4" />
                <p className="text-blue-200/60 text-base sm:text-lg">No evaluations yet</p>
                <p className="text-blue-200/40 text-xs sm:text-sm mt-2">Check back after your next evaluation!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {data.evaluations.map((evaluation) => {
                const isExpanded = expandedEvaluations.has(evaluation.id);
                const scoreColor = (evaluation.totalScore || 0) >= 18 ? 'green' : 
                                   (evaluation.totalScore || 0) >= 15 ? 'yellow' : 'red';
                
                return (
                  <Card 
                    key={evaluation.id} 
                    className={`bg-white/5 backdrop-blur-lg border-white/10 overflow-hidden transition-all hover:bg-white/10 ${
                      isExpanded ? 'ring-2 ring-blue-400/50' : ''
                    }`}
                  >
                    <CardHeader 
                      className="cursor-pointer p-3 sm:p-6"
                      onClick={() => toggleEvaluation(evaluation.id)}
                    >
                      {/* Mobile: Stack vertically, Desktop: Side by side */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                        {/* Date and Game info */}
                        <div className="flex items-center gap-2 sm:gap-4">
                          <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full shrink-0 ${
                            scoreColor === 'green' ? 'bg-green-400' :
                            scoreColor === 'yellow' ? 'bg-yellow-400' : 'bg-red-400'
                          }`} />
                          <div className="flex items-center gap-1.5 sm:gap-2 text-blue-200/70 min-w-0">
                            <Calendar className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                            <span className="font-medium text-white text-sm sm:text-base truncate">
                              {evaluation.evaluationDate 
                                ? format(new Date(evaluation.evaluationDate), "MMM d, yyyy")
                                : "Date unknown"}
                            </span>
                          </div>
                          {evaluation.game && (
                            <Badge variant="outline" className="border-blue-400/30 text-blue-200 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 hidden sm:inline-flex">
                              {evaluation.game}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Score and expand button */}
                        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 pl-4 sm:pl-0">
                          {/* Show game badge on mobile in this row */}
                          {evaluation.game && (
                            <Badge variant="outline" className="border-blue-400/30 text-blue-200 text-[10px] px-1.5 py-0.5 sm:hidden">
                              {evaluation.game}
                            </Badge>
                          )}
                          <Badge className={`text-sm sm:text-lg px-2 sm:px-4 py-0.5 sm:py-1 ${
                            scoreColor === 'green' ? 'bg-green-500/30 text-green-300' :
                            scoreColor === 'yellow' ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            {evaluation.totalScore ?? "—"}/22
                          </Badge>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-200/50" />
                          ) : (
                            <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-blue-200/50" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    
                    {isExpanded && (
                      <CardContent className="pt-0 pb-4 sm:pb-6 px-3 sm:px-6 animate-in slide-in-from-top-2">
                        <Separator className="bg-white/10 mb-4 sm:mb-6" />
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                          {/* Appearance Section */}
                          <div>
                            <h4 className="font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                              <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-pink-400" />
                              Appearance ({evaluation.appearanceScore ?? 0}/12)
                            </h4>
                            <div className="space-y-2 sm:space-y-3">
                              <ScoreRow 
                                icon={<Scissors className="h-4 w-4" />}
                                label="Hair"
                                score={evaluation.hairScore}
                                maxScore={evaluation.hairMaxScore || 3}
                                comment={evaluation.hairComment}
                              />
                              <ScoreRow 
                                icon={<Palette className="h-4 w-4" />}
                                label="Makeup"
                                score={evaluation.makeupScore}
                                maxScore={evaluation.makeupMaxScore || 3}
                                comment={evaluation.makeupComment}
                              />
                              <ScoreRow 
                                icon={<Shirt className="h-4 w-4" />}
                                label="Outfit"
                                score={evaluation.outfitScore}
                                maxScore={evaluation.outfitMaxScore || 3}
                                comment={evaluation.outfitComment}
                              />
                              <ScoreRow 
                                icon={<PersonStanding className="h-4 w-4" />}
                                label="Posture"
                                score={evaluation.postureScore}
                                maxScore={evaluation.postureMaxScore || 3}
                                comment={evaluation.postureComment}
                              />
                            </div>
                          </div>

                          {/* Game Performance Section */}
                          <div>
                            <h4 className="font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                              <Gamepad2 className="h-3 w-3 sm:h-4 sm:w-4 text-blue-400" />
                              Game Performance ({evaluation.gamePerformanceTotalScore ?? 0}/10)
                            </h4>
                            <div className="space-y-2 sm:space-y-3">
                              <ScoreRow 
                                icon={<Star className="h-4 w-4" />}
                                label="Dealing Style"
                                score={evaluation.dealingStyleScore}
                                maxScore={evaluation.dealingStyleMaxScore || 5}
                                comment={evaluation.dealingStyleComment}
                              />
                              <ScoreRow 
                                icon={<Gamepad2 className="h-4 w-4" />}
                                label="Game Performance"
                                score={evaluation.gamePerformanceScore}
                                maxScore={evaluation.gamePerformanceMaxScore || 5}
                                comment={evaluation.gamePerformanceComment}
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Error Details Section */}
        {data.errorDetails && data.errorDetails.length > 0 && (
          <div>
            <h2 className="text-base sm:text-xl font-semibold mb-3 sm:mb-4 text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-400" />
              Error Details This Month
              <Badge variant="secondary" className="ml-2 text-xs sm:text-sm bg-orange-500/20 text-orange-300">
                {data.errorDetails.length}
              </Badge>
            </h2>
            
            <div className="space-y-3 sm:space-y-4">
              {data.errorDetails.map((error: any) => (
                <Card key={error.id} className="bg-white/5 backdrop-blur-lg border-orange-400/20 overflow-hidden">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      {/* Error Screenshot */}
                      {error.screenshotUrl && (
                        <div className="w-full sm:w-24 h-24 flex-shrink-0">
                          <img
                            src={error.screenshotUrl}
                            alt="Error screenshot"
                            className="w-full h-full object-cover rounded-md"
                          />
                        </div>
                      )}
                      
                      {/* Error Details */}
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={`text-xs ${
                            error.severity === 'critical' ? 'bg-red-500/30 text-red-300' :
                            error.severity === 'high' ? 'bg-orange-500/30 text-orange-300' :
                            error.severity === 'medium' ? 'bg-yellow-500/30 text-yellow-300' :
                            'bg-green-500/30 text-green-300'
                          }`}>
                            {error.severity?.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-xs border-blue-400/30 text-blue-200">
                            {error.errorType?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          </Badge>
                          {error.gameType && (
                            <Badge variant="outline" className="text-xs border-purple-400/30 text-purple-200">
                              {error.gameType}
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-white">{error.errorDescription}</p>
                        
                        {error.errorCategory && (
                          <p className="text-xs text-blue-200/60">Category: {error.errorCategory}</p>
                        )}
                        
                        {error.tableId && (
                          <p className="text-xs text-blue-200/60">Table: {error.tableId}</p>
                        )}
                        
                        <p className="text-xs text-blue-200/40">
                          {error.createdAt ? format(new Date(error.createdAt), "MMM d, yyyy 'at' HH:mm") : ''}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Attitude Entries Section - Table format like screenshot */}
        {data.attitudeDetails && data.attitudeDetails.length > 0 && (
          <div>
            <h2 className="text-base sm:text-xl font-semibold mb-3 sm:mb-4 text-white flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-400" />
              Attitude Entries
              <Badge variant="secondary" className="ml-2 text-xs sm:text-sm bg-green-500/20 text-green-300">
                {data.attitudeDetails.length}
              </Badge>
            </h2>
            
            <Card className="bg-white/5 backdrop-blur-lg border-white/10 overflow-hidden">
              {/* Table Header - Hidden on mobile */}
              <div className="hidden sm:grid sm:grid-cols-12 gap-4 p-4 bg-white/5 border-b border-white/10 text-sm font-medium text-blue-200/70">
                <div className="col-span-3">Date</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-5">Comment</div>
                <div className="col-span-2 text-right">Score</div>
              </div>
              
              {/* Table Rows */}
              <div className="divide-y divide-white/10">
                {data.attitudeDetails.map((attitude: any) => (
                  <div key={attitude.id} className="p-3 sm:p-4 hover:bg-white/5 transition-colors">
                    {/* Mobile Layout */}
                    <div className="sm:hidden space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-200/60">
                          {attitude.evaluationDate 
                            ? format(new Date(attitude.evaluationDate), "d MMM yyyy, HH:mm")
                            : attitude.createdAt 
                              ? format(new Date(attitude.createdAt), "d MMM yyyy, HH:mm")
                              : 'Date unknown'}
                        </span>
                        <Badge className={`text-xs px-2 py-0.5 ${
                          attitude.attitudeType === 'positive' || attitude.attitudeCategory === 'positive'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : attitude.attitudeType === 'negative' || attitude.attitudeCategory === 'negative'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {(attitude.attitudeType || attitude.attitudeCategory || 'neutral').toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-white">{attitude.comment || attitude.description}</p>
                      <div className="flex justify-end">
                        <span className={`text-lg font-bold ${
                          (attitude.attitudeScore || 0) > 0 ? 'text-green-400' : 
                          (attitude.attitudeScore || 0) < 0 ? 'text-red-400' : 'text-gray-400'
                        }`}>
                          {(attitude.attitudeScore || 0) > 0 ? '+' : ''}{attitude.attitudeScore || 0}
                        </span>
                      </div>
                    </div>
                    
                    {/* Desktop Layout - Table Row */}
                    <div className="hidden sm:grid sm:grid-cols-12 gap-4 items-center">
                      <div className="col-span-3 text-sm text-blue-200/80">
                        {attitude.evaluationDate 
                          ? format(new Date(attitude.evaluationDate), "d MMM yyyy, HH:mm")
                          : attitude.createdAt 
                            ? format(new Date(attitude.createdAt), "d MMM yyyy, HH:mm")
                            : 'Date unknown'}
                      </div>
                      <div className="col-span-2">
                        <Badge className={`text-xs px-3 py-1 ${
                          attitude.attitudeType === 'positive' || attitude.attitudeCategory === 'positive'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : attitude.attitudeType === 'negative' || attitude.attitudeCategory === 'negative'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {(attitude.attitudeType || attitude.attitudeCategory || 'neutral').toUpperCase()}
                        </Badge>
                      </div>
                      <div className="col-span-5 text-sm text-white">
                        {attitude.comment || attitude.description}
                      </div>
                      <div className="col-span-2 text-right">
                        <span className={`text-lg font-bold px-3 py-1 rounded-md ${
                          (attitude.attitudeScore || 0) > 0 
                            ? 'text-green-400 bg-green-500/10' 
                            : (attitude.attitudeScore || 0) < 0 
                              ? 'text-red-400 bg-red-500/10' 
                              : 'text-gray-400 bg-gray-500/10'
                        }`}>
                          {(attitude.attitudeScore || 0) > 0 ? '+' : ''}{attitude.attitudeScore || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </main>

      <footer className="bg-white/5 border-t border-white/10 py-4 sm:py-8 mt-4 sm:mt-8">
        <div className="container text-center px-4">
          <p className="text-blue-200/50 text-xs sm:text-sm">This is a read-only view of your evaluations.</p>
          <p className="text-blue-200/40 text-[10px] sm:text-xs mt-1">For questions, please contact your Floor Manager.</p>
          <p className="text-blue-200/30 text-[10px] sm:text-xs mt-2 sm:mt-4">
            Auto-refreshes every 30s • Last sync: {format(lastRefresh, "HH:mm:ss")}
          </p>
        </div>
      </footer>
    </div>
  );
}

function ScoreRow({ 
  icon, 
  label, 
  score, 
  maxScore, 
  comment 
}: { 
  icon: React.ReactNode; 
  label: string; 
  score: number | null; 
  maxScore: number; 
  comment: string | null;
}) {
  const percentage = score !== null ? (score / maxScore) * 100 : 0;
  const getColor = () => {
    if (score === null) return "bg-gray-600";
    if (percentage >= 80) return "bg-green-500";
    if (percentage >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="bg-white/5 rounded-lg sm:rounded-xl p-2.5 sm:p-4">
      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
        <div className="flex items-center gap-1.5 sm:gap-2 text-blue-200/80">
          <span className="[&>svg]:h-3 [&>svg]:w-3 sm:[&>svg]:h-4 sm:[&>svg]:w-4">{icon}</span>
          <span className="font-medium text-xs sm:text-sm">{label}</span>
        </div>
        <Badge className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 ${
          percentage >= 80 ? "bg-green-500/30 text-green-300" :
          percentage >= 60 ? "bg-yellow-500/30 text-yellow-300" :
          "bg-red-500/30 text-red-300"
        }`}>
          {score ?? "—"}/{maxScore}
        </Badge>
      </div>
      <div className="w-full bg-white/10 rounded-full h-1.5 sm:h-2 mb-1.5 sm:mb-2">
        <div 
          className={`h-1.5 sm:h-2 rounded-full transition-all ${getColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {comment && (
        <p className="text-[10px] sm:text-sm text-blue-200/60 italic mt-1.5 sm:mt-2 line-clamp-2">"{comment}"</p>
      )}
    </div>
  );
}
