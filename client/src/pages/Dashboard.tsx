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
const PIE_COLORS = ['#f59e0b', '#f97316', '#d946ef', '#6b7280'];

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
              <Calendar className="h-4 w-4 mr-1.5 sm:mr-2 text-amber-400/70" />
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
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-fuchsia-500/10 border border-amber-500/20 flex items-center justify-center">
                <Target className="h-4.5 w-4.5 text-amber-400" />
              </div>
              <span className="font-medium text-white/70 text-sm sm:text-base">Evaluation Progress</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 sm:w-48">
                <Progress value={evaluationProgress} className="h-2 bg-white/[0.06]" />
              </div>
              <span className="font-bold text-amber-300 text-sm sm:text-base">{evaluationProgress}%</span>
              <span className="text-white/35 text-xs sm:text-sm hidden sm:inline">({evaluatedGPs}/{totalGPs} GPs)</span>
            </div>
            {pendingGPs > 0 && (
              <Badge variant="amber" size="sm">{pendingGPs} pending</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation('/upload')} className="border-white/[0.1] text-white/60 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.15] rounded-xl">
              <Upload className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
            <Button size="sm" onClick={() => setLocation('/reports')} className="bg-gradient-to-r from-amber-500 to-fuchsia-600 hover:from-amber-600 hover:to-violet-700 text-white rounded-xl shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all duration-300">
              <span className="hidden sm:inline">Generate Report</span>
              <span className="sm:hidden">Report</span>
              <ArrowRight className="ml-1 sm:ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Users} value={stats?.totalGPs || 0} label="Game Presenters" color="amber" />
        <StatCard icon={FileCheck} value={stats?.totalEvaluations || 0} label="Total Evaluations" color="orange" />
        <StatCard icon={TrendingUp} value={avgTeamScore > 0 ? avgTeamScore.toFixed(1) : '-'} suffix="/22" label="Team Average" color="amber" />
        <StatCard icon={FileSpreadsheet} value={stats?.totalReports || 0} label="Reports Generated" color="green" />
      </div>

      {/* Top Performers & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Top Performers */}
        <Card variant="glass">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 flex items-center justify-center">
                <Award className="h-4.5 w-4.5 text-amber-400" />
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
                    idx === 0 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 
                    idx === 1 ? 'bg-white/[0.06] text-white/50 border border-white/[0.08]' : 
                    'bg-orange-500/10 text-orange-400/70 border border-orange-500/15'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white/85 truncate text-xs sm:text-sm">{gp.fullName}</p>
                    <p className="text-[10px] sm:text-xs text-white/25">{gp.evalCount} eval{gp.evalCount !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/15 px-2 py-0.5 rounded-md">
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
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-amber-500/10 border border-fuchsia-500/20 flex items-center justify-center">
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
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-fuchsia-500/10 border border-amber-500/20 flex items-center justify-center">
              <BarChart3 className="h-4.5 w-4.5 text-amber-400" />
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
                    <Bar dataKey="totalScore" name="Total Score" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="appearance" name="Appearance" fill="#f97316" radius={[4, 4, 0, 0]} />
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
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
              <TrendingUp className="h-4.5 w-4.5 text-amber-400" />
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
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
              <TrendingUp className="h-4.5 w-4.5 text-amber-400" />
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
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradAppearance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
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
                <Area type="monotone" dataKey="avgTotalScore" name="Total" stroke="#f59e0b" fill="url(#gradTotal)" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} />
                <Area type="monotone" dataKey="avgAppearanceScore" name="Appearance" stroke="#f97316" fill="url(#gradAppearance)" strokeWidth={1.5} dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }} />
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
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500/20 to-emerald-500/20 border border-orange-500/20">
              <BarChart3 className="h-4.5 w-4.5 text-orange-400" />
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
                <Bar dataKey="totalEvaluations" name="Evaluations" fill="#f59e0b" radius={[6, 6, 0, 0]} />
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
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
              <Target className="h-4.5 w-4.5 text-amber-400" />
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
                    <span className="text-amber-400">{m.uniqueGPs} GPs</span>
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
