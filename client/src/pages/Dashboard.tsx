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

const CHART_TOOLTIP_STYLE = {
  background: 'rgba(20, 20, 35, 0.95)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '12px',
  color: '#fff',
  backdropFilter: 'blur(20px)',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
  padding: '10px 14px',
};

// Purple-themed pie chart colors
const PIE_COLORS = ['#8b5cf6', '#6366f1', '#d946ef', '#6b7280'];

export default function Dashboard() {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery({
    month: selectedMonth,
    year: selectedYear,
  });

  const totalGPs = stats?.totalGPs || 0;
  const evaluatedGPs = (stats as { thisMonthGPs?: number })?.thisMonthGPs || 0;
  const evaluationProgress = totalGPs > 0 ? Math.round((evaluatedGPs / totalGPs) * 100) : 0;
  const pendingGPs = totalGPs - evaluatedGPs;

  const gpStats = (stats as { gpStats?: GPStat[] })?.gpStats || [];
  const chartData = useMemo(() => gpStats.map((gp: GPStat) => ({
    name: gp.gpName?.split(' ')[0] || "Unknown",
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
    chartData.filter(gp => gp.totalScore > 0 && gp.totalScore < 15),
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
            <div className="h-7 w-40 rounded-lg bg-white/[0.05] animate-pulse" />
            <div className="h-4 w-56 rounded-lg bg-white/[0.03] animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-32 rounded-xl bg-white/[0.05] animate-pulse" />
            <div className="h-10 w-20 rounded-xl bg-white/[0.05] animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 sm:h-32 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-white/35 text-xs sm:text-sm mt-1">Team performance overview</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[120px] sm:w-40 bg-white/[0.03] border-white/[0.08] hover:border-white/[0.15] rounded-xl">
              <Calendar className="h-4 w-4 mr-1.5 sm:mr-2 text-violet-400/70" />
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
            <SelectTrigger className="w-20 sm:w-24 bg-white/[0.03] border-white/[0.08] hover:border-white/[0.15] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map((year) => (
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
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 border border-violet-500/20 flex items-center justify-center">
                <Target className="h-4.5 w-4.5 text-violet-400" />
              </div>
              <span className="font-medium text-white/70 text-sm sm:text-base">Evaluation Progress</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 sm:w-48">
                <Progress value={evaluationProgress} className="h-2 bg-white/[0.06]" />
              </div>
              <span className="font-bold text-violet-300 text-sm sm:text-base">{evaluationProgress}%</span>
              <span className="text-white/35 text-xs sm:text-sm hidden sm:inline">({evaluatedGPs}/{totalGPs} GPs)</span>
            </div>
            {pendingGPs > 0 && (
              <Badge variant="violet" size="sm">{pendingGPs} pending</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation('/upload')} className="border-white/[0.1] text-white/60 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.15] rounded-xl">
              <Upload className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
            <Button size="sm" onClick={() => setLocation('/reports')} className="bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-violet-700 text-white rounded-xl shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all duration-300">
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
        <StatCard icon={FileCheck} value={stats?.totalEvaluations || 0} label="Total Evaluations" color="indigo" />
        <StatCard icon={TrendingUp} value={avgTeamScore > 0 ? avgTeamScore.toFixed(1) : '-'} suffix="/22" label="Team Average" color="violet" />
        <StatCard icon={FileSpreadsheet} value={stats?.totalReports || 0} label="Reports Generated" color="green" />
      </div>

      {/* Top Performers & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Top Performers */}
        <Card variant="glass">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 border border-violet-500/20 flex items-center justify-center">
                <Award className="h-4.5 w-4.5 text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Top Performers</CardTitle>
                <CardDescription className="text-xs">Highest scoring GPs</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {topPerformers.length > 0 ? (
              topPerformers.map((gp, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-2.5 sm:gap-3 p-2.5 rounded-xl hover:bg-white/[0.04] transition-all duration-200"
                >
                  <div className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg font-bold text-xs ${
                    idx === 0 ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20' : 
                    idx === 1 ? 'bg-white/[0.06] text-white/50 border border-white/[0.08]' : 
                    'bg-indigo-500/10 text-indigo-400/70 border border-indigo-500/15'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white/85 truncate text-xs sm:text-sm">{gp.fullName}</p>
                    <p className="text-[10px] sm:text-xs text-white/25">{gp.evalCount} eval{gp.evalCount !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-xs font-semibold text-violet-300 bg-violet-500/10 border border-violet-500/15 px-2 py-0.5 rounded-md">
                    {gp.totalScore.toFixed(1)}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Award className="h-8 w-8 text-white/10 mb-2" />
                <p className="text-white/25 text-xs sm:text-sm">No evaluation data yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Distribution */}
        <Card variant="glass" className="lg:col-span-2">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-violet-500/10 border border-fuchsia-500/20 flex items-center justify-center">
                <PieChart className="h-4.5 w-4.5 text-fuchsia-400" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Performance Distribution</CardTitle>
                <CardDescription className="text-xs">GP breakdown for {isMobile ? MONTHS_SHORT[selectedMonth - 1] : MONTHS[selectedMonth - 1]}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {performanceDistribution.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                <div className="w-full sm:w-1/2 h-[160px] sm:h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie 
                        data={performanceDistribution} 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={isMobile ? 35 : 45} 
                        outerRadius={isMobile ? 55 : 70} 
                        paddingAngle={3} 
                        dataKey="value"
                        stroke="none"
                      >
                        {performanceDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ ...CHART_TOOLTIP_STYLE, fontSize: isMobile ? '12px' : '14px' }} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full space-y-1.5">
                  {performanceDistribution.map((entry, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/[0.03] transition-all duration-200"
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-xs sm:text-sm text-white/50 flex-1 truncate">{entry.name}</span>
                      <span className="font-semibold text-white/80 text-xs sm:text-sm">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-36 sm:h-44">
                <PieChart className="h-8 w-8 text-white/10 mb-2" />
                <p className="text-white/25 text-xs sm:text-sm">No data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Performance Alert */}
      {lowPerformers.length > 0 && (
        <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.04] backdrop-blur-xl p-4 sm:p-6 transition-all duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500/20 to-rose-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="h-4.5 w-4.5 text-red-400" />
              </div>
              <span className="font-semibold text-red-300 text-sm sm:text-base">
                Attention Required — {lowPerformers.length} GP{lowPerformers.length > 1 ? 's' : ''} Below Target
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2">
            {lowPerformers.map((gp, idx) => (
              <Badge key={idx} variant="red" size="sm">
                {gp.fullName}: {gp.totalScore.toFixed(1)}/22
              </Badge>
            ))}
          </div>
          <p className="text-xs sm:text-sm text-red-400/50">These GPs scored below 15 this month and may need additional support.</p>
        </div>
      )}

      {/* Performance Chart */}
      <Card variant="glass">
        <CardHeader className="pb-3 sm:pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 border border-violet-500/20 flex items-center justify-center">
              <BarChart3 className="h-4.5 w-4.5 text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base">Monthly Performance Overview</CardTitle>
              <CardDescription className="text-xs">
                Average scores for {isMobile ? MONTHS_SHORT[selectedMonth - 1] : MONTHS[selectedMonth - 1]} {selectedYear}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="w-full overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <div className="min-w-[500px] sm:min-w-0">
                <ResponsiveContainer width="100%" height={isMobile ? 280 : 350}>
                  <BarChart 
                    data={chartData} 
                    margin={{ top: 20, right: isMobile ? 10 : 30, left: isMobile ? 0 : 20, bottom: isMobile ? 80 : 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255, 255, 255, 0.04)" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={80} 
                      tick={{ fontSize: isMobile ? 10 : 11, fill: 'rgba(255,255,255,0.35)' }} 
                    />
                    <YAxis 
                      domain={[0, 24]} 
                      ticks={[0, 6, 12, 18, 24]} 
                      tick={{ fontSize: isMobile ? 10 : 12, fill: 'rgba(255,255,255,0.35)' }}
                      width={isMobile ? 30 : 40}
                    />
                    <Tooltip 
                      formatter={(value: number, name: string) => [value.toFixed(1), name]}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                      contentStyle={{ ...CHART_TOOLTIP_STYLE, fontSize: isMobile ? '12px' : '14px' }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      wrapperStyle={{ paddingTop: isMobile ? 10 : 20, fontSize: isMobile ? '11px' : '12px' }} 
                    />
                    <Bar dataKey="totalScore" name="Total Score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="appearance" name="Appearance" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="performance" name="Performance" fill="#d946ef" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 sm:h-64">
              <BarChart3 className="h-10 w-10 text-white/10 mb-3" />
              <p className="text-white/25 text-sm">No performance data available for this period</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Comparative Analytics */}
      <MonthlyTrendSection isMobile={isMobile} />

      {/* Cross-Team GP Comparison */}
      <TeamComparisonSection isMobile={isMobile} />
    </div>
  );
}

// ======================================
// Monthly Trend Analytics Component
// ======================================
function MonthlyTrendSection({ isMobile }: { isMobile: boolean }) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | undefined>(undefined);
  const { data: teams } = trpc.fmTeam.list.useQuery();
  const { data: trendData, isLoading } = trpc.dashboard.monthlyTrend.useQuery({ months: 6, teamId: selectedTeamId });
  const selectedTeamName = selectedTeamId ? teams?.find(t => t.id === selectedTeamId)?.teamName : undefined;

  if (isLoading) {
    return (
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/[0.05] animate-pulse" />
            <div className="space-y-1">
              <div className="h-4 w-48 rounded bg-white/[0.05] animate-pulse" />
              <div className="h-3 w-32 rounded bg-white/[0.03] animate-pulse" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 rounded-xl bg-white/[0.03] animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!trendData || trendData.length === 0) {
    return (
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20">
              <TrendingUp className="h-4.5 w-4.5 text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base">Monthly Trends</CardTitle>
              <CardDescription className="text-xs">Comparative analytics across months</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-48">
            <TrendingUp className="h-10 w-10 text-white/10 mb-3" />
            <p className="text-white/25 text-sm">Not enough data for trend analysis</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = trendData.some(d => d.totalEvaluations > 0);

  return (
    <div className="space-y-4">
      {/* Team Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-white/40" />
          <span className="text-sm text-white/50">Filter by team:</span>
        </div>
        <Select
          value={selectedTeamId?.toString() || "all"}
          onValueChange={(val) => setSelectedTeamId(val === "all" ? undefined : Number(val))}
        >
          <SelectTrigger className="w-[200px] h-9 text-sm bg-white/[0.04] border-white/[0.08] rounded-xl">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams?.map(team => (
              <SelectItem key={team.id} value={team.id.toString()}>{team.teamName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTeamName && (
          <Badge variant="outline" className="text-xs border-primary/30 text-primary">
            {selectedTeamName}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Score Trend Line Chart */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20">
              <TrendingUp className="h-4.5 w-4.5 text-violet-400" />
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
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradAppearance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradPerformance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d946ef" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#d946ef" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: isMobile ? 9 : 11, fill: 'rgba(255,255,255,0.35)' }}
                  tickFormatter={(v) => v.split(' ')[0]}
                />
                <YAxis 
                  domain={[0, 24]} 
                  ticks={[0, 6, 12, 18, 24]}
                  tick={{ fontSize: isMobile ? 9 : 11, fill: 'rgba(255,255,255,0.35)' }}
                  width={isMobile ? 28 : 35}
                />
                <Tooltip 
                  contentStyle={{ ...CHART_TOOLTIP_STYLE, fontSize: isMobile ? '11px' : '13px' }}
                  formatter={(value: number, name: string) => [value.toFixed(1), name]}
                />
                <Area type="monotone" dataKey="avgTotalScore" name="Total" stroke="#8b5cf6" fill="url(#gradTotal)" strokeWidth={2.5} dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 0 }} />
                <Area type="monotone" dataKey="avgAppearanceScore" name="Appearance" stroke="#6366f1" fill="url(#gradAppearance)" strokeWidth={1.5} dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} />
                <Area type="monotone" dataKey="avgPerformanceScore" name="Performance" stroke="#d946ef" fill="url(#gradPerformance)" strokeWidth={1.5} dot={{ r: 3, fill: '#d946ef', strokeWidth: 0 }} />
                <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '11px', paddingTop: 8 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-48">
              <TrendingUp className="h-10 w-10 text-white/10 mb-3" />
              <p className="text-white/25 text-sm">No trend data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evaluation Volume Bar Chart */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-indigo-500/20">
              <BarChart3 className="h-4.5 w-4.5 text-indigo-400" />
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: isMobile ? 9 : 11, fill: 'rgba(255,255,255,0.35)' }}
                  tickFormatter={(v) => v.split(' ')[0]}
                />
                <YAxis 
                  tick={{ fontSize: isMobile ? 9 : 11, fill: 'rgba(255,255,255,0.35)' }}
                  width={isMobile ? 28 : 35}
                />
                <Tooltip 
                  contentStyle={{ ...CHART_TOOLTIP_STYLE, fontSize: isMobile ? '11px' : '13px' }}
                />
                <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '11px', paddingTop: 8 }} />
                <Bar dataKey="totalEvaluations" name="Evaluations" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="uniqueGPs" name="GPs Evaluated" fill="#d946ef" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-48">
              <BarChart3 className="h-10 w-10 text-white/10 mb-3" />
              <p className="text-white/25 text-sm">No volume data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score Range (High/Low) */}
      <Card variant="glass" className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20">
              <Target className="h-4.5 w-4.5 text-violet-400" />
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
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center space-y-2 transition-all hover:border-white/[0.1] hover:bg-white/[0.04]">
                  <p className="text-xs text-white/40 font-medium">{m.label}</p>
                  <p className="text-lg font-bold text-white">{m.avgTotalScore > 0 ? m.avgTotalScore.toFixed(1) : '—'}</p>
                  <p className="text-[10px] text-white/30">avg score</p>
                  <div className="flex items-center justify-center gap-2 text-[10px]">
                    <span className="text-emerald-400">{m.totalEvaluations} evals</span>
                    <span className="text-white/20">·</span>
                    <span className="text-violet-400">{m.uniqueGPs} GPs</span>
                  </div>
                  {m.topScore > 0 && (
                    <div className="flex items-center justify-center gap-1.5 text-[10px]">
                      <span className="text-emerald-400">↑{m.topScore}</span>
                      <span className="text-white/20">/</span>
                      <span className="text-red-400">↓{m.lowScore}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32">
              <Target className="h-8 w-8 text-white/10 mb-2" />
              <p className="text-white/25 text-sm">No summary data available</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
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
        <div className="h-8 w-64 rounded-lg bg-white/[0.05] animate-pulse" />
        <div className="h-80 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
      </div>
    );
  }

  if (!comparisonData || comparisonData.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-400" />
            Team Comparison
          </h2>
          <p className="text-white/35 text-xs mt-0.5">Compare GP performance across teams</p>
        </div>
        <Card variant="glass">
          <CardContent className="flex flex-col items-center justify-center h-48 py-8">
            <Users className="h-10 w-10 text-white/10 mb-3" />
            <p className="text-white/30 text-sm">No team data available for comparison</p>
            <p className="text-white/15 text-xs mt-1">Add teams and evaluations to see cross-team analytics</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prepare data for team overview bar chart
  const teamOverviewData = comparisonData.map(team => ({
    name: team.teamName,
    fullName: `${team.teamName} (${team.floorManager})`,
    avgTotal: team.avgTotalScore,
    avgAppearance: team.avgAppearanceScore,
    avgPerformance: team.avgPerformanceScore,
    gpCount: team.gpCount,
    evalCount: team.totalEvaluations,
  }));

  // Prepare data for detailed GP comparison across teams
  const allGPs = comparisonData.flatMap(team => 
    team.gps.map((gp: { id: number; name: string; avgTotalScore: number; avgAppearanceScore: number; avgPerformanceScore: number; evaluationCount: number }) => ({
      ...gp,
      teamName: team.teamName,
    }))
  ).sort((a, b) => b.avgTotalScore - a.avgTotalScore);

  // Team colors for the chart
  const TEAM_COLORS = ['#8b5cf6', '#6366f1', '#10b981', '#f43f5e', '#3b82f6', '#eab308', '#ec4899', '#14b8a6'];

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-400" />
            Team Comparison
          </h2>
          <p className="text-white/35 text-xs mt-0.5">Compare GP performance across teams</p>
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
          {/* Team Average Scores Bar Chart */}
          <Card variant="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/70">Team Average Scores</CardTitle>
              <CardDescription className="text-xs text-white/30">Comparison of average total scores by team</CardDescription>
            </CardHeader>
            <CardContent>
              {teamOverviewData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, teamOverviewData.length * 60)}>
                  <BarChart data={teamOverviewData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis type="number" domain={[0, 22]} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={isMobile ? 60 : 100} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(20, 20, 35, 0.95)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        color: '#fff',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
                        padding: '10px 14px',
                      }}
                      formatter={(value: number, name: string) => [value.toFixed(1), name === 'avgTotal' ? 'Total Score' : name === 'avgAppearance' ? 'Appearance' : 'Performance']}
                      labelFormatter={(label) => {
                        const team = teamOverviewData.find(t => t.name === label);
                        return team?.fullName || label;
                      }}
                    />
                    <Bar dataKey="avgTotal" name="Total" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={20} />
                    <Bar dataKey="avgAppearance" name="Appearance" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={20} />
                    <Bar dataKey="avgPerformance" name="Performance" fill="#10b981" radius={[0, 6, 6, 0]} barSize={20} />
                    <Legend 
                      wrapperStyle={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}
                      iconType="circle"
                      iconSize={8}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-48">
                  <BarChart3 className="h-8 w-8 text-white/10 mb-2" />
                  <p className="text-white/25 text-sm">No team data available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team Summary Cards */}
          <div className="space-y-3">
            <Card variant="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/70">Team Rankings</CardTitle>
                <CardDescription className="text-xs text-white/30">Teams ranked by average total score</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {comparisonData.map((team, idx) => (
                  <div key={team.teamId} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-all">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold ${
                      idx === 0 ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' :
                      idx === 1 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                      idx === 2 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                      'bg-white/[0.05] text-white/40 border border-white/[0.08]'
                    }`}>
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white/80 truncate">{team.teamName}</p>
                        <span className="text-[10px] text-white/25">FM: {team.floorManager}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-white/30">{team.gpCount} GPs</span>
                        <span className="text-[10px] text-white/30">{team.totalEvaluations} evals</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        team.avgTotalScore >= 20 ? 'text-emerald-400' :
                        team.avgTotalScore >= 16 ? 'text-violet-400' :
                        team.avgTotalScore > 0 ? 'text-rose-400' : 'text-white/20'
                      }`}>
                        {team.avgTotalScore > 0 ? team.avgTotalScore.toFixed(1) : '—'}
                      </p>
                      <p className="text-[10px] text-white/25">avg score</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* Detailed View - All GPs across teams */
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/70">All GPs Across Teams</CardTitle>
            <CardDescription className="text-xs text-white/30">Individual GP performance ranked by total score ({allGPs.length} GPs total)</CardDescription>
          </CardHeader>
          <CardContent>
            {allGPs.length > 0 ? (
              <>
                {/* Chart */}
                <ResponsiveContainer width="100%" height={Math.min(500, Math.max(250, allGPs.length * 28))}>
                  <BarChart data={allGPs.slice(0, 20)} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis type="number" domain={[0, 22]} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      width={isMobile ? 80 : 120} 
                      tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} 
                      axisLine={false} 
                      tickLine={false} 
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(20, 20, 35, 0.95)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        color: '#fff',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
                        padding: '10px 14px',
                      }}
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

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-white/[0.06]">
                  {comparisonData.map((team, idx) => (
                    <div key={team.teamId} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TEAM_COLORS[idx % TEAM_COLORS.length] }} />
                      <span className="text-[11px] text-white/40">{team.teamName}</span>
                    </div>
                  ))}
                </div>

                {/* Table */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left py-2 px-2 text-white/30 font-medium">#</th>
                        <th className="text-left py-2 px-2 text-white/30 font-medium">GP Name</th>
                        <th className="text-left py-2 px-2 text-white/30 font-medium">Team</th>
                        <th className="text-right py-2 px-2 text-white/30 font-medium">Total</th>
                        <th className="text-right py-2 px-2 text-white/30 font-medium">Appear.</th>
                        <th className="text-right py-2 px-2 text-white/30 font-medium">Perf.</th>
                        <th className="text-right py-2 px-2 text-white/30 font-medium">Evals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allGPs.map((gp, idx) => (
                        <tr key={`${gp.id}-${gp.teamName}`} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="py-2 px-2 text-white/25">{idx + 1}</td>
                          <td className="py-2 px-2 text-white/70 font-medium">{gp.name}</td>
                          <td className="py-2 px-2">
                            <span className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TEAM_COLORS[comparisonData.findIndex(t => t.teamName === gp.teamName) % TEAM_COLORS.length] }} />
                              <span className="text-white/40">{gp.teamName}</span>
                            </span>
                          </td>
                          <td className={`py-2 px-2 text-right font-bold ${
                            gp.avgTotalScore >= 20 ? 'text-emerald-400' :
                            gp.avgTotalScore >= 16 ? 'text-violet-400' :
                            'text-rose-400'
                          }`}>{gp.avgTotalScore.toFixed(1)}</td>
                          <td className="py-2 px-2 text-right text-white/50">{gp.avgAppearanceScore.toFixed(1)}</td>
                          <td className="py-2 px-2 text-right text-white/50">{gp.avgPerformanceScore.toFixed(1)}</td>
                          <td className="py-2 px-2 text-right text-white/30">{gp.evaluationCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <Users className="h-8 w-8 text-white/10 mb-2" />
                <p className="text-white/25 text-sm">No GP data available for comparison</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
