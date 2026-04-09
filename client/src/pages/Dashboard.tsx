import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, FileCheck, TrendingUp, FileSpreadsheet, AlertTriangle, Award, Target, Calendar, BarChart3, PieChart, ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { GlassCard } from "@/components/ui/glass-card";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from "recharts";
import { useIsMobile } from "@/hooks/useMobile";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

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

// Theme-aware chart tooltip style
const CHART_TOOLTIP_STYLE = {
  borderRadius: '12px',
  backdropFilter: 'blur(20px)',
  padding: '10px 14px',
};

const CHART_TOOLTIP_LIGHT = {
  ...CHART_TOOLTIP_STYLE,
  background: 'rgba(255, 255, 255, 0.95)',
  border: '1px solid rgba(0, 0, 0, 0.08)',
  color: '#1a1a1a',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
};

function useChartTheme() {
  return {
    tooltipStyle: CHART_TOOLTIP_LIGHT,
    tickFill: '#374151',
    gridStroke: '#e5e5e3',
    legendColor: '#4b5563',
  };
}

// Purple-themed pie chart colors
const PIE_COLORS = ['oklch(0.75 0.12 85)', 'oklch(0.65 0.12 85)', 'oklch(0.70 0.10 85)', '#6b7280'];

export default function Dashboard() {
  const [currentDate] = useState(() => new Date());
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedTeamId, setSelectedTeamId] = useState<number | undefined>(undefined);
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const { data: teams } = trpc.fmTeam.list.useQuery();
  
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery({
    month: selectedMonth,
    year: selectedYear,
    teamId: selectedTeamId,
  });

  const selectedTeamName = selectedTeamId ? teams?.find(t => t.id === selectedTeamId)?.teamName : undefined;

  const totalGPs = stats?.totalGPs || 0;
  const evaluatedGPs = (stats as { thisMonthGPs?: number })?.thisMonthGPs || 0;
  const evaluationProgress = totalGPs > 0 ? Math.round((evaluatedGPs / totalGPs) * 100) : 0;
  const pendingGPs = totalGPs - evaluatedGPs;

  const gpStats = (stats as { gpStats?: GPStat[] })?.gpStats || [];
  const chartData = useMemo(() => gpStats.map((gp: GPStat) => ({
    name: gp.gpName ? (gp.gpName.split(' ').length > 1 ? `${gp.gpName.split(' ')[0]} ${gp.gpName.split(' ').slice(-1)[0][0]}.` : gp.gpName) : "Unknown",
    fullName: gp.gpName,
    totalScore: Number(gp.avgTotal),
    appearance: Number(gp.avgAppearance),
    performance: Number(gp.avgPerformance),
    evalCount: gp.evalCount,
  })), [gpStats]);

  const performanceDistribution = useMemo(() => {
    if (!chartData.length) return [];
    const excellent = chartData.filter(gp => gp.totalScore >= 20).length;
    const good = chartData.filter(gp => gp.totalScore >= 16 && gp.totalScore < 20).length;
    const needsWork = chartData.filter(gp => gp.totalScore > 0 && gp.totalScore < 16).length;
    const notEvaluated = chartData.filter(gp => gp.totalScore === 0).length;
    return [
      { name: 'Excellent (20+)', value: excellent, color: PIE_COLORS[0] },
      { name: 'Good (16-19)', value: good, color: PIE_COLORS[1] },
      { name: 'Needs Work (<16)', value: needsWork, color: PIE_COLORS[2] },
      { name: 'Not Evaluated', value: notEvaluated, color: PIE_COLORS[3] },
    ].filter(d => d.value > 0);
  }, [chartData]);

  const topPerformers = useMemo(() => 
    [...chartData].filter(gp => gp.totalScore > 0).sort((a, b) => b.totalScore - a.totalScore).slice(0, 5),
    [chartData]
  );

  const lowPerformers = useMemo(() => 
    chartData.filter(gp => gp.totalScore > 0 && gp.totalScore < 16),
    [chartData]
  );

  const avgTeamScore = useMemo(() => {
    const validScores = chartData.filter(gp => gp.totalScore > 0);
    if (!validScores.length) return 0;
    return validScores.reduce((sum, gp) => sum + gp.totalScore, 0) / validScores.length;
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-56 rounded-lg bg-muted/50 animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-32 rounded-xl bg-muted animate-pulse" />
            <div className="h-10 w-20 rounded-xl bg-muted animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 sm:h-32 rounded-2xl bg-muted/50 border border-border animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-muted/50 border border-border animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">{selectedTeamName ? `${selectedTeamName} performance` : 'Team performance overview'}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Select
            value={selectedTeamId?.toString() || "all"}
            onValueChange={(val) => setSelectedTeamId(val === "all" ? undefined : Number(val))}
          >
            <SelectTrigger className="w-[140px] sm:w-[180px] bg-card border-border hover:border-primary/30 rounded-xl">
              <Users className="h-4 w-4 mr-1.5 sm:mr-2 text-primary/70" />
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams?.map(team => (
                <SelectItem key={team.id} value={team.id.toString()}>{team.teamName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[120px] sm:w-40 bg-card border-border hover:border-primary/30 rounded-xl">
              <Calendar className="h-4 w-4 mr-1.5 sm:mr-2 text-primary/70" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, idx) => (
                <SelectItem key={idx} value={(idx + 1).toString()}>
                  {isMobile ? MONTHS_SHORT[idx] : month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-20 sm:w-24 bg-card border-border hover:border-primary/30 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Progress Bar Card */}
      <GlassCard size="default">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                <Target className="h-4.5 w-4.5 text-primary" />
              </div>
              <span className="font-medium text-muted-foreground text-sm sm:text-base">Evaluation Progress</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 sm:w-48">
                <Progress value={evaluationProgress} className="h-2 bg-muted" />
              </div>
              <span className="font-bold text-primary text-sm sm:text-base">{evaluationProgress}%</span>
              <span className="text-muted-foreground text-xs sm:text-sm hidden sm:inline">({evaluatedGPs}/{totalGPs} GPs)</span>
            </div>
            {pendingGPs > 0 && (
              <Badge variant="violet" size="sm">{pendingGPs} pending</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation('/upload')} className="border-border text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl">
              <Upload className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
            <Button size="sm" onClick={() => setLocation('/reports')} className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/80 hover:to-primary text-white rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300">
              <span className="hidden sm:inline">Generate Report</span>
              <span className="sm:hidden">Report</span>
              <ArrowRight className="ml-1 sm:ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Users} value={stats?.totalGPs || 0} label="Game Presenters" color="violet" />
        <StatCard icon={FileCheck} value={stats?.totalEvaluations || 0} label="Evaluations" color="indigo" />
        <StatCard icon={TrendingUp} value={avgTeamScore > 0 ? avgTeamScore.toFixed(1) : '—'} label="Avg Score" color="green" />
        <StatCard icon={FileSpreadsheet} value={stats?.totalReports || 0} label="Reports" color="blue" />
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* GP Score Distribution */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <BarChart3 className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">GP Scores{selectedTeamName ? ` — ${selectedTeamName}` : ''}</CardTitle>
                <CardDescription className="text-xs">Average total scores per GP</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 && chartData.some(gp => gp.totalScore > 0) ? (
              <ResponsiveContainer width="100%" height={isMobile ? 260 : 300}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: isMobile ? -10 : 0, bottom: isMobile ? 60 : 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={isMobile ? 80 : 60}
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                  />
                  <YAxis 
                    domain={[0, 22]} 
                    ticks={[0, 5, 10, 15, 22]}
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    width={isMobile ? 28 : 35}
                  />
                  <Tooltip 
                    contentStyle={CHART_TOOLTIP_LIGHT}
                    formatter={(value: number, name: string) => [value.toFixed(1), name]}
                    labelFormatter={(label) => {
                      const gp = chartData.find(g => g.name === label);
                      return gp?.fullName || label;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '11px', paddingTop: 8 }} />
                  <Bar dataKey="totalScore" name="Total" fill="oklch(0.75 0.12 85)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="appearance" name="Appearance" fill="oklch(0.65 0.12 85)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="performance" name="Performance" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No evaluation data for this period</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Distribution Pie */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <PieChart className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Performance Distribution</CardTitle>
                <CardDescription className="text-xs">GPs by score range</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {performanceDistribution.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <ResponsiveContainer width="100%" height={isMobile ? 200 : 220}>
                  <RechartsPieChart>
                    <Pie
                      data={performanceDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={isMobile ? 50 : 60}
                      outerRadius={isMobile ? 75 : 90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {performanceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={CHART_TOOLTIP_LIGHT}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="flex flex-row sm:flex-col gap-2 sm:gap-3 flex-wrap justify-center">
                  {performanceDistribution.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-xs text-muted-foreground">{entry.name}: <span className="font-semibold text-foreground">{entry.value}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <PieChart className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top & Low Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Performers */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20">
                <Award className="h-4.5 w-4.5 text-emerald-500" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Top Performers</CardTitle>
                <CardDescription className="text-xs">Highest scoring GPs this month</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {topPerformers.length > 0 ? (
              <div className="space-y-2">
                {topPerformers.map((gp, idx) => (
                  <div key={gp.name} className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border hover:border-primary/20 transition-all">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold ${
                      idx === 0 ? 'bg-primary/15 text-primary border border-primary/30' :
                      idx === 1 ? 'bg-primary/10 text-primary/80 border border-primary/20' :
                      'bg-muted text-muted-foreground border border-border'
                    }`}>
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{gp.fullName}</p>
                      <p className="text-[10px] text-muted-foreground">{gp.evalCount} evaluations</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${gp.totalScore >= 20 ? 'text-emerald-500' : 'text-primary'}`}>
                        {gp.totalScore.toFixed(1)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">/22</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32">
                <Award className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">No evaluations yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Performers / Alerts */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500/20 to-rose-500/5 border border-rose-500/20">
                <AlertTriangle className="h-4.5 w-4.5 text-rose-500" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Attention Needed</CardTitle>
                <CardDescription className="text-xs">GPs scoring below 16/22</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {lowPerformers.length > 0 ? (
              <div className="space-y-2">
                {lowPerformers.map((gp) => (
                  <div key={gp.name} className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 hover:border-rose-500/20 transition-all">
                    <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/20">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{gp.fullName}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>App: {gp.appearance.toFixed(1)}</span>
                        <span>Perf: {gp.performance.toFixed(1)}</span>
                      </div>
                    </div>
                    <p className="text-lg font-bold text-rose-500">{gp.totalScore.toFixed(1)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                  <Award className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-emerald-600 dark:text-emerald-400 text-sm font-medium">All GPs performing well!</p>
                <p className="text-muted-foreground text-xs mt-0.5">No scores below 16</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* GP Monthly Comparison */}
      <GPMonthlyComparisonSection isMobile={isMobile} />

      {/* Team Comparison */}
      <TeamComparisonSection isMobile={isMobile} />

      {/* Trend Section */}
      <TrendSection isMobile={isMobile} selectedTeamId={selectedTeamId} selectedTeamName={selectedTeamName} teams={teams} />
    </div>
  );
}


// ======================================
// Trend Section (Score Trends, Volume, Summary)
// ======================================
function TrendSection({ isMobile, selectedTeamId, selectedTeamName, teams }: { isMobile: boolean; selectedTeamId?: number; selectedTeamName?: string; teams?: { id: number; teamName: string }[] }) {
  const { data: trendData, isLoading: isLoadingTrend } = trpc.dashboard.monthlyTrend.useQuery({
    teamId: selectedTeamId,
    months: 6,
  });

  const hasData = trendData && trendData.length > 0;

  if (isLoadingTrend) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-80 rounded-2xl bg-muted/50 border border-border animate-pulse" />
          <div className="h-80 rounded-2xl bg-muted/50 border border-border animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Performance Trends
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">6-month overview of team metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score Trend Line Chart */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <TrendingUp className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Score Trends{selectedTeamName ? ` — ${selectedTeamName}` : ''}</CardTitle>
                <CardDescription className="text-xs">Average scores over 6 months</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: isMobile ? -10 : 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.75 0.12 85)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.75 0.12 85)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradAppearance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.65 0.12 85)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="oklch(0.65 0.12 85)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradPerformance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis 
                    dataKey="label" 
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    tickFormatter={(v) => v.split(' ')[0]}
                  />
                  <YAxis 
                    domain={[0, 22]} 
                    ticks={[0, 5, 10, 15, 22]}
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    width={isMobile ? 28 : 35}
                  />
                  <Tooltip 
                    contentStyle={CHART_TOOLTIP_LIGHT}
                    formatter={(value: number, name: string) => [value.toFixed(1), name]}
                  />
                  <Area type="monotone" dataKey="avgTotalScore" name="Total" stroke="oklch(0.75 0.12 85)" fill="url(#gradTotal)" strokeWidth={2.5} dot={{ r: 4, fill: 'oklch(0.75 0.12 85)', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="avgAppearanceScore" name="Appearance" stroke="oklch(0.65 0.12 85)" fill="url(#gradAppearance)" strokeWidth={1.5} dot={{ r: 3, fill: 'oklch(0.65 0.12 85)', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="avgPerformanceScore" name="Performance" stroke="#6366f1" fill="url(#gradPerformance)" strokeWidth={1.5} dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} />
                  <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '11px', paddingTop: 8 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No trend data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evaluation Volume Bar Chart */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-emerald-500/10 border border-primary/20">
                <BarChart3 className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Evaluation Volume</CardTitle>
                <CardDescription className="text-xs">Evaluations and GPs per month</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: isMobile ? -10 : 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis 
                    dataKey="label" 
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    tickFormatter={(v) => v.split(' ')[0]}
                  />
                  <YAxis 
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    width={isMobile ? 28 : 35}
                  />
                  <Tooltip 
                    contentStyle={CHART_TOOLTIP_LIGHT}
                  />
                  <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '11px', paddingTop: 8 }} />
                  <Bar dataKey="totalEvaluations" name="Evaluations" fill="oklch(0.75 0.12 85)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="uniqueGPs" name="GPs Evaluated" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No volume data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Summary */}
        <Card variant="glass" className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <Target className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Monthly Summary</CardTitle>
                <CardDescription className="text-xs">Key metrics across the last 6 months</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {trendData.map((m, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card/50 p-3 text-center space-y-2 transition-all hover:border-primary/20 hover:bg-card">
                    <p className="text-xs text-muted-foreground font-medium">{m.label}</p>
                    <p className="text-lg font-bold text-foreground">{m.avgTotalScore > 0 ? m.avgTotalScore.toFixed(1) : '—'}</p>
                    <p className="text-[10px] text-muted-foreground">avg score</p>
                    <div className="flex items-center justify-center gap-2 text-[10px]">
                      <span className="text-emerald-600 dark:text-emerald-400">{m.totalEvaluations} evals</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-primary">{m.uniqueGPs} GPs</span>
                    </div>
                    {m.topScore > 0 && (
                      <div className="flex items-center justify-center gap-1.5 text-[10px]">
                        <span className="text-emerald-600 dark:text-emerald-400">↑{m.topScore}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-rose-500">↓{m.lowScore}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32">
                <Target className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">No summary data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


// ======================================
// GP Month-over-Month Comparison Component
// ======================================
function GPMonthlyComparisonSection({ isMobile }: { isMobile: boolean }) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | undefined>(undefined);
  const [selectedGpId, setSelectedGpId] = useState<number | undefined>(undefined);
  const { data: teams } = trpc.fmTeam.list.useQuery();
  const { data: gpList } = trpc.gamePresenter.list.useQuery();
  const { data: gpHistory, isLoading: isLoadingHistory } = trpc.gamePresenter.monthlyHistory.useQuery(
    { gpId: selectedGpId!, monthsBack: 6 },
    { enabled: !!selectedGpId }
  );

  const filteredGPs = useMemo(() => {
    if (!gpList) return [];
    if (selectedTeamId) return gpList.filter(gp => gp.teamId === selectedTeamId);
    return gpList;
  }, [gpList, selectedTeamId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            GP Monthly Comparison
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">Track individual GP performance across months</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={selectedTeamId?.toString() || "all"}
            onValueChange={(val) => { setSelectedTeamId(val === "all" ? undefined : Number(val)); setSelectedGpId(undefined); }}
          >
            <SelectTrigger className="w-[160px] h-9 text-sm bg-card border-border rounded-xl">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams?.map(team => (
                <SelectItem key={team.id} value={team.id.toString()}>{team.teamName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedGpId?.toString() || "none"}
            onValueChange={(val) => setSelectedGpId(val === "none" ? undefined : Number(val))}
          >
            <SelectTrigger className="w-[200px] h-9 text-sm bg-card border-border rounded-xl">
              <SelectValue placeholder="Select GP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select a GP...</SelectItem>
              {filteredGPs.map(gp => (
                <SelectItem key={gp.id} value={gp.id.toString()}>{gp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedGpId ? (
        <Card variant="glass">
          <CardContent className="flex flex-col items-center justify-center h-48 py-8">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">Select a Game Presenter to view their monthly comparison</p>
            <p className="text-muted-foreground text-xs mt-1">Choose a team and GP from the dropdowns above</p>
          </CardContent>
        </Card>
      ) : isLoadingHistory ? (
        <Card variant="glass">
          <CardContent className="flex items-center justify-center h-48 py-8">
            <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </CardContent>
        </Card>
      ) : gpHistory && gpHistory.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Score Trend Line Chart */}
          <Card variant="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {filteredGPs.find(g => g.id === selectedGpId)?.name} — Score Trend
              </CardTitle>
              <CardDescription className="text-xs">Average scores over 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
                <LineChart data={gpHistory} margin={{ top: 10, right: 10, left: isMobile ? -10 : 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis 
                    dataKey="label" 
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    tickFormatter={(v) => v.split(' ')[0]}
                  />
                  <YAxis 
                    domain={[0, 22]} 
                    ticks={[0, 5, 10, 15, 22]}
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    width={isMobile ? 28 : 35}
                  />
                  <Tooltip 
                    contentStyle={CHART_TOOLTIP_LIGHT}
                    formatter={(value: number, name: string) => [typeof value === 'number' ? value.toFixed(1) : value, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '11px', paddingTop: 8 }} />
                  <Line type="monotone" dataKey="avgTotal" name="Total" stroke="oklch(0.75 0.12 85)" strokeWidth={2.5} dot={{ r: 4, fill: 'oklch(0.75 0.12 85)', strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="avgAppearance" name="Appearance" stroke="oklch(0.65 0.12 85)" strokeWidth={1.5} dot={{ r: 3, fill: 'oklch(0.65 0.12 85)', strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="avgPerformance" name="Performance" stroke="#6366f1" strokeWidth={1.5} dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Monthly Detail Cards */}
          <Card variant="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Breakdown</CardTitle>
              <CardDescription className="text-xs">Detailed stats per month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {gpHistory.map((m, i) => {
                  const prevMonth = i > 0 ? gpHistory[i - 1] : null;
                  const scoreDiff = prevMonth && prevMonth.avgTotal > 0 && m.avgTotal > 0 
                    ? m.avgTotal - prevMonth.avgTotal 
                    : null;
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border hover:border-primary/20 transition-all">
                      <div className="text-center min-w-[50px]">
                        <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                        <p className="text-[10px] text-muted-foreground">{m.evalCount} evals</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-lg font-bold ${
                            m.avgTotal >= 20 ? 'text-emerald-500' :
                            m.avgTotal >= 16 ? 'text-primary' :
                            m.avgTotal > 0 ? 'text-rose-500' : 'text-muted-foreground'
                          }`}>
                            {m.avgTotal > 0 ? m.avgTotal.toFixed(1) : '—'}
                          </span>
                          {scoreDiff !== null && (
                            <span className={`text-xs font-medium ${
                              scoreDiff > 0 ? 'text-emerald-500' : scoreDiff < 0 ? 'text-rose-500' : 'text-muted-foreground'
                            }`}>
                              {scoreDiff > 0 ? '+' : ''}{scoreDiff.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>App: {m.avgAppearance > 0 ? m.avgAppearance.toFixed(1) : '—'}</span>
                          <span>Perf: {m.avgPerformance > 0 ? m.avgPerformance.toFixed(1) : '—'}</span>
                          {m.mistakes > 0 && <span className="text-rose-500">{m.mistakes} mistakes</span>}
                          {m.attitude !== null && m.attitude !== 0 && (
                            <span className={m.attitude > 0 ? 'text-emerald-500' : 'text-rose-500'}>
                              Att: {m.attitude > 0 ? '+' : ''}{m.attitude}
                            </span>
                          )}
                        </div>
                      </div>
                      {m.highScore > 0 && (
                        <div className="text-right text-[10px]">
                          <span className="text-emerald-500">↑{m.highScore.toFixed(1)}</span>
                          <span className="text-muted-foreground mx-0.5">/</span>
                          <span className="text-rose-500">↓{m.lowScore.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card variant="glass">
          <CardContent className="flex flex-col items-center justify-center h-48 py-8">
            <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No history data available for this GP</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ======================================
// Cross-Team GP Comparison Component
// ======================================
function TeamComparisonSection({ isMobile }: { isMobile: boolean }) {
  const { data: comparisonData, isLoading } = trpc.dashboard.teamComparison.useQuery();
  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('overview');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded-lg bg-muted animate-pulse" />
        <div className="h-80 rounded-2xl bg-muted/50 border border-border animate-pulse" />
      </div>
    );
  }

  if (!comparisonData || comparisonData.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Team Comparison
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">Compare GP performance across teams</p>
        </div>
        <Card variant="glass">
          <CardContent className="flex flex-col items-center justify-center h-48 py-8">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No team data available for comparison</p>
            <p className="text-muted-foreground text-xs mt-1">Add teams and evaluations to see cross-team analytics</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const teamOverviewData = comparisonData.map(team => ({
    name: team.teamName,
    fullName: `${team.teamName} (${team.floorManager})`,
    avgTotal: team.avgTotalScore,
    avgAppearance: team.avgAppearanceScore,
    avgPerformance: team.avgPerformanceScore,
    gpCount: team.gpCount,
    evalCount: team.totalEvaluations,
  }));

  const allGPs = comparisonData.flatMap(team => 
    team.gps.map((gp: { id: number; name: string; avgTotalScore: number; avgAppearanceScore: number; avgPerformanceScore: number; evaluationCount: number }) => ({
      ...gp,
      teamName: team.teamName,
    }))
  ).sort((a, b) => b.avgTotalScore - a.avgTotalScore);

  const TEAM_COLORS = ['oklch(0.75 0.12 85)', 'oklch(0.65 0.12 85)', '#6366f1', '#f43f5e', '#3b82f6', '#eab308', '#dc2626', '#14b8a6'];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Team Comparison
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">Compare GP performance across teams</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'overview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('overview')}
            className="text-xs rounded-lg"
          >
            Overview
          </Button>
          <Button
            variant={viewMode === 'detailed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('detailed')}
            className="text-xs rounded-lg"
          >
            Detailed
          </Button>
        </div>
      </div>

      {viewMode === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card variant="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Team Average Scores</CardTitle>
              <CardDescription className="text-xs">Comparison of average total scores by team</CardDescription>
            </CardHeader>
            <CardContent>
              {teamOverviewData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, teamOverviewData.length * 60)}>
                  <BarChart data={teamOverviewData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="chart-grid" horizontal={false} />
                    <XAxis type="number" domain={[0, 22]} className="chart-tick" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={isMobile ? 60 : 100} className="chart-tick" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_LIGHT}
                      formatter={(value: number, name: string) => [value.toFixed(1), name === 'Total' ? 'Total Score' : name === 'Appearance' ? 'Appearance' : 'Performance']}
                      labelFormatter={(label) => {
                        const team = teamOverviewData.find(t => t.name === label);
                        return team?.fullName || label;
                      }}
                    />
                    <Bar dataKey="avgTotal" name="Total" fill="oklch(0.75 0.12 85)" radius={[0, 6, 6, 0]} barSize={20} />
                    <Bar dataKey="avgAppearance" name="Appearance" fill="oklch(0.65 0.12 85)" radius={[0, 6, 6, 0]} barSize={20} />
                    <Bar dataKey="avgPerformance" name="Performance" fill="#c8963e" radius={[0, 6, 6, 0]} barSize={20} />
                    <Legend 
                      wrapperStyle={{ fontSize: '11px' }}
                      iconType="circle"
                      iconSize={8}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-48">
                  <BarChart3 className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground text-sm">No team data available</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card variant="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Team Rankings</CardTitle>
                <CardDescription className="text-xs">Teams ranked by average total score</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {comparisonData.map((team, idx) => (
                  <div key={team.teamId} className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border hover:border-primary/20 transition-all">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold ${
                      idx === 0 ? 'bg-primary/15 text-primary border border-primary/30' :
                      idx === 1 ? 'bg-primary/10 text-primary/80 border border-primary/20' :
                      idx === 2 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30' :
                      'bg-muted text-muted-foreground border border-border'
                    }`}>
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{team.teamName}</p>
                        <span className="text-[10px] text-muted-foreground">FM: {team.floorManager}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{team.gpCount} GPs</span>
                        <span className="text-[10px] text-muted-foreground">{team.totalEvaluations} evals</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        team.avgTotalScore >= 20 ? 'text-emerald-500' :
                        team.avgTotalScore >= 16 ? 'text-primary' :
                        team.avgTotalScore > 0 ? 'text-rose-500' : 'text-muted-foreground'
                      }`}>
                        {team.avgTotalScore > 0 ? team.avgTotalScore.toFixed(1) : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">avg score</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">All GPs Across Teams</CardTitle>
            <CardDescription className="text-xs">Individual GP performance ranked by total score ({allGPs.length} GPs total)</CardDescription>
          </CardHeader>
          <CardContent>
            {allGPs.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={Math.min(500, Math.max(250, allGPs.length * 28))}>
                  <BarChart data={allGPs.slice(0, 20)} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="chart-grid" horizontal={false} />
                    <XAxis type="number" domain={[0, 22]} className="chart-tick" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      width={isMobile ? 80 : 120} 
                      className="chart-tick"
                      tick={{ fontSize: 10 }} 
                      axisLine={false} 
                      tickLine={false} 
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_LIGHT}
                      formatter={(value: number, name: string) => [value.toFixed(1), name === 'avgTotalScore' ? 'Total' : name === 'avgAppearanceScore' ? 'Appearance' : 'Performance']}
                      labelFormatter={(label) => {
                        const gp = allGPs.find(g => g.name === label);
                        return gp ? `${gp.name} (${gp.teamName})` : label;
                      }}
                    />
                    <Bar dataKey="avgTotalScore" name="Total Score" radius={[0, 6, 6, 0]} barSize={16}>
                      {allGPs.slice(0, 20).map((entry, index) => {
                        const teamIndex = comparisonData.findIndex(t => t.teamName === entry.teamName);
                        return <Cell key={`cell-${index}`} fill={TEAM_COLORS[teamIndex % TEAM_COLORS.length]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
                  {comparisonData.map((team, idx) => (
                    <div key={team.teamId} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TEAM_COLORS[idx % TEAM_COLORS.length] }} />
                      <span className="text-[11px] text-muted-foreground">{team.teamName}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">#</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">GP Name</th>
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Team</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Total</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Appear.</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Perf.</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Evals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allGPs.map((gp, idx) => (
                        <tr key={`${gp.id}-${gp.teamName}`} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                          <td className="py-2 px-2 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2 px-2 text-foreground font-medium">{gp.name}</td>
                          <td className="py-2 px-2">
                            <span className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TEAM_COLORS[comparisonData.findIndex(t => t.teamName === gp.teamName) % TEAM_COLORS.length] }} />
                              <span className="text-muted-foreground">{gp.teamName}</span>
                            </span>
                          </td>
                          <td className={`py-2 px-2 text-right font-bold ${
                            gp.avgTotalScore >= 20 ? 'text-emerald-500' :
                            gp.avgTotalScore >= 16 ? 'text-primary' :
                            'text-rose-500'
                          }`}>{gp.avgTotalScore.toFixed(1)}</td>
                          <td className="py-2 px-2 text-right text-muted-foreground">{gp.avgAppearanceScore.toFixed(1)}</td>
                          <td className="py-2 px-2 text-right text-muted-foreground">{gp.avgPerformanceScore.toFixed(1)}</td>
                          <td className="py-2 px-2 text-right text-muted-foreground">{gp.evaluationCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <Users className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">No GP data available for comparison</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
