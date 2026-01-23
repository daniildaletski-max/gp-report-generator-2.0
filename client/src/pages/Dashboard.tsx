import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, FileCheck, TrendingUp, FileSpreadsheet, AlertCircle, CheckCircle2, Clock, ArrowRight, AlertTriangle, Award, Target, TrendingDown, Calendar, BarChart3, PieChart, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart as RechartsPieChart, Pie, Cell, RadialBarChart, RadialBar } from "recharts";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#ec4899'];

interface GPStat {
  gpId: number;
  gpName: string;
  evalCount: number;
  avgTotal: string;
  avgHair: string;
  avgMakeup: string;
  avgOutfit: string;
  avgPosture: string;
  avgDealing: string;
  avgGamePerf: string;
  avgAppearance: string;
  avgPerformance: string;
}

export default function Dashboard() {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const [, setLocation] = useLocation();
  
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery({
    month: selectedMonth,
    year: selectedYear,
  });

  // Calculate progress metrics
  const totalGPs = stats?.totalGPs || 0;
  const evaluatedGPs = (stats as { thisMonthGPs?: number })?.thisMonthGPs || 0;
  const evaluationProgress = totalGPs > 0 ? Math.round((evaluatedGPs / totalGPs) * 100) : 0;
  const pendingGPs = totalGPs - evaluatedGPs;

  // Prepare chart data
  const gpStats = (stats as { gpStats?: GPStat[] })?.gpStats || [];
  const chartData = useMemo(() => gpStats.map((gp: GPStat) => ({
    name: gp.gpName || "Unknown",
    fullName: gp.gpName,
    totalScore: Number(gp.avgTotal),
    appearance: Number(gp.avgAppearance),
    performance: Number(gp.avgPerformance),
    evalCount: gp.evalCount,
  })), [gpStats]);

  // Performance distribution for pie chart
  const performanceDistribution = useMemo(() => {
    if (!chartData.length) return [];
    const excellent = chartData.filter(gp => gp.totalScore >= 20).length;
    const good = chartData.filter(gp => gp.totalScore >= 16 && gp.totalScore < 20).length;
    const needsWork = chartData.filter(gp => gp.totalScore > 0 && gp.totalScore < 16).length;
    const notEvaluated = chartData.filter(gp => gp.totalScore === 0).length;
    return [
      { name: 'Excellent (20+)', value: excellent, color: '#10b981' },
      { name: 'Good (16-19)', value: good, color: '#f59e0b' },
      { name: 'Needs Work (<16)', value: needsWork, color: '#ef4444' },
      { name: 'Not Evaluated', value: notEvaluated, color: '#64748b' },
    ].filter(d => d.value > 0);
  }, [chartData]);

  // Top performers
  const topPerformers = useMemo(() => 
    [...chartData]
      .filter(gp => gp.totalScore > 0)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 3),
    [chartData]
  );

  // Low performers
  const lowPerformers = useMemo(() => 
    chartData.filter(gp => gp.totalScore > 0 && gp.totalScore < 15),
    [chartData]
  );

  // Average team score
  const avgTeamScore = useMemo(() => {
    const validScores = chartData.filter(gp => gp.totalScore > 0);
    if (!validScores.length) return 0;
    return validScores.reduce((sum, gp) => sum + gp.totalScore, 0) / validScores.length;
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="p-6 bg-mesh min-h-screen">
        <div className="animate-pulse space-y-6">
          <div className="flex gap-4">
            <Skeleton className="h-10 w-40 glass" />
            <Skeleton className="h-10 w-28 glass" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 glass rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="h-64 lg:col-span-2 glass rounded-2xl" />
            <Skeleton className="h-64 glass rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-mesh min-h-screen">
      {/* Header with Month/Year Selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Team performance overview and analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedMonth.toString()}
            onValueChange={(v) => setSelectedMonth(Number(v))}
          >
            <SelectTrigger className="w-44 glass-input rounded-xl border-0">
              <Calendar className="h-4 w-4 mr-2 text-primary" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-strong rounded-xl border-0">
              {MONTHS.map((month, idx) => (
                <SelectItem key={idx} value={(idx + 1).toString()}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedYear.toString()}
            onValueChange={(v) => setSelectedYear(Number(v))}
          >
            <SelectTrigger className="w-28 glass-input rounded-xl border-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass-strong rounded-xl border-0">
              {[2024, 2025, 2026].map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="glass-card p-5 rounded-2xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <span className="font-semibold">Evaluation Progress</span>
            </div>
            <div className="h-8 w-px bg-border/50" />
            <div className="flex items-center gap-3">
              <div className="relative w-48">
                <Progress value={evaluationProgress} className="h-3 rounded-full bg-muted/50" />
              </div>
              <span className="font-bold text-primary text-lg">{evaluationProgress}%</span>
              <span className="text-muted-foreground text-sm">({evaluatedGPs}/{totalGPs} GPs)</span>
            </div>
            {pendingGPs > 0 && (
              <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 rounded-lg px-3">
                {pendingGPs} pending
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setLocation('/upload')} className="glass-button rounded-xl border-0">
              Upload Evaluations
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLocation('/admin')} className="glass-button rounded-xl border-0">
              Manage GP Stats
            </Button>
            <Button size="sm" onClick={() => setLocation('/reports')} className="rounded-xl bg-gradient-to-r from-primary to-purple-600 hover:opacity-90">
              Generate Report <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 stagger-children">
        <div className="glass-card p-6 rounded-2xl group">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 group-hover:scale-110 transition-transform">
              <Users className="h-6 w-6 text-blue-500" />
            </div>
            <Sparkles className="h-4 w-4 text-blue-500/50" />
          </div>
          <div className="text-4xl font-bold tabular-nums mb-1">{stats?.totalGPs || 0}</div>
          <p className="text-sm text-muted-foreground">Game Presenters</p>
        </div>

        <div className="glass-card p-6 rounded-2xl group">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 group-hover:scale-110 transition-transform">
              <FileCheck className="h-6 w-6 text-green-500" />
            </div>
            <Sparkles className="h-4 w-4 text-green-500/50" />
          </div>
          <div className="text-4xl font-bold tabular-nums mb-1">{stats?.totalEvaluations || 0}</div>
          <p className="text-sm text-muted-foreground">Total Evaluations</p>
        </div>

        <div className="glass-card p-6 rounded-2xl group">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 group-hover:scale-110 transition-transform">
              <TrendingUp className="h-6 w-6 text-amber-500" />
            </div>
            <Sparkles className="h-4 w-4 text-amber-500/50" />
          </div>
          <div className="text-4xl font-bold tabular-nums mb-1">
            {avgTeamScore > 0 ? avgTeamScore.toFixed(1) : '-'}
            <span className="text-xl text-muted-foreground font-normal">/22</span>
          </div>
          <p className="text-sm text-muted-foreground">Team Average</p>
        </div>

        <div className="glass-card p-6 rounded-2xl group">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 group-hover:scale-110 transition-transform">
              <FileSpreadsheet className="h-6 w-6 text-purple-500" />
            </div>
            <Sparkles className="h-4 w-4 text-purple-500/50" />
          </div>
          <div className="text-4xl font-bold tabular-nums mb-1">{stats?.totalReports || 0}</div>
          <p className="text-sm text-muted-foreground">Reports Generated</p>
        </div>
      </div>

      {/* Top Performers & Performance Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Top Performers */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                <Award className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-semibold">Top Performers</h3>
                <p className="text-sm text-muted-foreground">Highest scoring GPs</p>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-3">
            {topPerformers.length > 0 ? (
              topPerformers.map((gp, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl glass-subtle">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-xl font-bold text-white shadow-lg ${
                    idx === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600' : 
                    idx === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : 
                    'bg-gradient-to-br from-amber-600 to-amber-800'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{gp.fullName}</p>
                    <p className="text-xs text-muted-foreground">{gp.evalCount} evaluations</p>
                  </div>
                  <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30 rounded-lg font-bold">
                    {gp.totalScore.toFixed(1)}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No evaluation data yet
              </div>
            )}
          </div>
        </div>

        {/* Performance Distribution Pie Chart */}
        <div className="glass-card rounded-2xl overflow-hidden lg:col-span-2">
          <div className="p-5 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20">
                <PieChart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Performance Distribution</h3>
                <p className="text-sm text-muted-foreground">GP breakdown for {MONTHS[selectedMonth - 1]}</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            {performanceDistribution.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <RechartsPieChart>
                    <Pie
                      data={performanceDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {performanceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(255,255,255,0.9)', 
                        backdropFilter: 'blur(8px)',
                        border: 'none',
                        borderRadius: '12px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                      }} 
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {performanceDistribution.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg glass-subtle">
                      <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
                      <span className="text-sm flex-1">{entry.name}</span>
                      <span className="font-bold text-lg">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                No data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Low Performance Alert */}
      {lowPerformers.length > 0 && (
        <div className="glass-card rounded-2xl p-5 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              Attention Required - {lowPerformers.length} GP{lowPerformers.length > 1 ? 's' : ''} Below Target
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {lowPerformers.map((gp, idx) => (
              <Badge key={idx} className="bg-white/50 dark:bg-black/20 border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-lg">
                {gp.fullName}: {gp.totalScore.toFixed(1)}/22
              </Badge>
            ))}
          </div>
          <p className="text-sm text-amber-600/80 dark:text-amber-400/80">
            These GPs scored below 15 this month and may need additional support or training.
          </p>
        </div>
      )}

      {/* Monthly Performance Overview Chart */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Monthly Performance Overview</h3>
              <p className="text-sm text-muted-foreground">Average scores for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={80}
                  tick={{ fontSize: 12, fill: 'rgba(148,163,184,0.8)' }}
                />
                <YAxis domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tick={{ fill: 'rgba(148,163,184,0.8)' }} />
                <Tooltip 
                  formatter={(value: number, name: string) => [value.toFixed(1), name]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  contentStyle={{ 
                    backgroundColor: 'rgba(255,255,255,0.95)', 
                    backdropFilter: 'blur(12px)',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
                  }}
                />
                <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 20 }} />
                <Bar dataKey="totalScore" name="Total Score" fill="url(#gradientPrimary)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="appearance" name="Appearance" fill="url(#gradientGreen)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="performance" name="Performance" fill="url(#gradientAmber)" radius={[6, 6, 0, 0]} />
                <defs>
                  <linearGradient id="gradientPrimary" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                  <linearGradient id="gradientGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="gradientAmber" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#d97706" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <FileCheck className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg">No evaluation data for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
              <Button variant="outline" className="mt-4 glass-button rounded-xl" onClick={() => setLocation('/upload')}>
                Upload Evaluations
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Monthly Statistics Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
              <BarChart3 className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <h3 className="font-semibold">Detailed Statistics</h3>
              <p className="text-sm text-muted-foreground">Complete breakdown for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          {gpStats && gpStats.length > 0 ? (
            <div className="overflow-x-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30">
                    <TableHead className="font-semibold">Game Presenter</TableHead>
                    <TableHead className="text-center font-semibold">Evals</TableHead>
                    <TableHead className="text-center font-semibold">Total</TableHead>
                    <TableHead className="text-center font-semibold">Hair</TableHead>
                    <TableHead className="text-center font-semibold">Makeup</TableHead>
                    <TableHead className="text-center font-semibold">Outfit</TableHead>
                    <TableHead className="text-center font-semibold">Posture</TableHead>
                    <TableHead className="text-center font-semibold">Dealing</TableHead>
                    <TableHead className="text-center font-semibold">Game Perf</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gpStats.map((gp: GPStat) => {
                    const total = Number(gp.avgTotal);
                    const getScoreColor = (score: string, max: number = 3) => {
                      const val = Number(score);
                      const pct = val / max;
                      if (pct >= 0.8) return "text-green-500 font-semibold";
                      if (pct >= 0.6) return "text-amber-500 font-medium";
                      if (pct < 0.4 && val > 0) return "text-red-500 font-medium";
                      return "text-muted-foreground";
                    };
                    const getTotalBadge = () => {
                      if (total >= 20) return "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30";
                      if (total >= 16) return "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30";
                      if (total > 0) return "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30";
                      return "bg-muted/50 text-muted-foreground border-border/30";
                    };
                    return (
                      <TableRow key={gp.gpId} className="table-row-hover border-border/20">
                        <TableCell className="font-medium">{gp.gpName}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="font-mono glass-subtle border-0 rounded-lg">
                            {gp.evalCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg font-bold border ${getTotalBadge()}`}>
                            {gp.avgTotal}
                          </span>
                        </TableCell>
                        <TableCell className={`text-center ${getScoreColor(gp.avgHair)}`}>{gp.avgHair}</TableCell>
                        <TableCell className={`text-center ${getScoreColor(gp.avgMakeup)}`}>{gp.avgMakeup}</TableCell>
                        <TableCell className={`text-center ${getScoreColor(gp.avgOutfit)}`}>{gp.avgOutfit}</TableCell>
                        <TableCell className={`text-center ${getScoreColor(gp.avgPosture)}`}>{gp.avgPosture}</TableCell>
                        <TableCell className={`text-center ${getScoreColor(gp.avgDealing, 6)}`}>{gp.avgDealing}</TableCell>
                        <TableCell className={`text-center ${getScoreColor(gp.avgGamePerf, 6)}`}>{gp.avgGamePerf}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No evaluation data for {MONTHS[selectedMonth - 1]} {selectedYear}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
