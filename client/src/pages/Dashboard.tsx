import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, FileCheck, TrendingUp, FileSpreadsheet, AlertTriangle, Award, Target, Calendar, BarChart3, PieChart, ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardContent } from "@/components/ui/glass-card";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from "recharts";
import { useIsMobile } from "@/hooks/useMobile";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Short month names for mobile
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
      { name: 'Excellent (20+)', value: excellent, color: '#22c55e' },
      { name: 'Good (16-19)', value: good, color: '#f59e0b' },
      { name: 'Needs Work (<16)', value: needsWork, color: '#ef4444' },
      { name: 'Not Evaluated', value: notEvaluated, color: '#4b5563' },
    ].filter(d => d.value > 0);
  }, [chartData]);

  const topPerformers = useMemo(() => 
    [...chartData].filter(gp => gp.totalScore > 0).sort((a, b) => b.totalScore - a.totalScore).slice(0, 3),
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
      <div className="p-4 sm:p-6 min-h-screen bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#16162a]">
        <div className="animate-pulse space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="h-10 w-full sm:w-40 bg-purple-500/10 rounded-xl skeleton" />
            <div className="h-10 w-full sm:w-28 bg-purple-500/10 rounded-xl skeleton" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 sm:h-32 bg-purple-500/10 rounded-xl sm:rounded-2xl skeleton" />
            ))}
          </div>
          <div className="h-64 bg-purple-500/10 rounded-xl sm:rounded-2xl skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 min-h-screen bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#16162a]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-xs sm:text-sm mt-1">Team performance overview</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[120px] sm:w-40">
              <Calendar className="h-4 w-4 mr-1.5 sm:mr-2 text-purple-400" />
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
            <SelectTrigger className="w-20 sm:w-24">
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
              <div className="icon-container icon-container-purple">
                <Target className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span className="font-medium text-white/80 text-sm sm:text-base">Evaluation Progress</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 sm:w-48">
                <Progress value={evaluationProgress} className="h-2 bg-purple-500/10" />
              </div>
              <span className="font-bold text-purple-400 text-sm sm:text-base">{evaluationProgress}%</span>
              <span className="text-white/40 text-xs sm:text-sm hidden sm:inline">({evaluatedGPs}/{totalGPs} GPs)</span>
            </div>
            {pendingGPs > 0 && (
              <Badge variant="amber" size="sm">{pendingGPs} pending</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setLocation('/upload')}>
              <Upload className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
            <Button size="sm" onClick={() => setLocation('/reports')}>
              <span className="hidden sm:inline">Generate Report</span>
              <span className="sm:hidden">Report</span>
              <ArrowRight className="ml-1 sm:ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={Users}
          value={stats?.totalGPs || 0}
          label="Game Presenters"
          color="purple"
        />
        <StatCard
          icon={FileCheck}
          value={stats?.totalEvaluations || 0}
          label="Total Evaluations"
          color="green"
        />
        <StatCard
          icon={TrendingUp}
          value={avgTeamScore > 0 ? avgTeamScore.toFixed(1) : '-'}
          suffix="/22"
          label="Team Average"
          color="amber"
        />
        <StatCard
          icon={FileSpreadsheet}
          value={stats?.totalReports || 0}
          label="Reports Generated"
          color="fuchsia"
        />
      </div>

      {/* Top Performers & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Top Performers */}
        <Card variant="glass">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex items-center gap-3">
              <div className="icon-container icon-container-amber">
                <Award className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Top Performers</CardTitle>
                <CardDescription>Highest scoring GPs</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {topPerformers.length > 0 ? (
              topPerformers.map((gp, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-purple-500/5 hover:bg-purple-500/10 transition-all duration-300"
                >
                  <div className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg font-bold text-xs sm:text-sm ${
                    idx === 0 ? 'bg-amber-500/20 text-amber-400' : 
                    idx === 1 ? 'bg-white/10 text-white/60' : 
                    'bg-orange-500/20 text-orange-400'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white/90 truncate text-xs sm:text-sm">{gp.fullName}</p>
                    <p className="text-[10px] sm:text-xs text-white/30">{gp.evalCount} evaluations</p>
                  </div>
                  <Badge variant="green" size="sm">{gp.totalScore.toFixed(1)}</Badge>
                </div>
              ))
            ) : (
              <div className="text-center py-6 sm:py-8 text-white/30 text-xs sm:text-sm">No evaluation data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Performance Distribution */}
        <Card variant="glass" className="lg:col-span-2">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex items-center gap-3">
              <div className="icon-container icon-container-violet">
                <PieChart className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Performance Distribution</CardTitle>
                <CardDescription>GP breakdown for {isMobile ? MONTHS_SHORT[selectedMonth - 1] : MONTHS[selectedMonth - 1]}</CardDescription>
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
                      >
                        {performanceDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          background: 'linear-gradient(145deg, rgba(35, 35, 60, 0.95) 0%, rgba(25, 25, 48, 0.9) 100%)', 
                          border: '1px solid rgba(255, 255, 255, 0.15)', 
                          borderRadius: '14px', 
                          color: '#fff',
                          backdropFilter: 'blur(20px)',
                          fontSize: isMobile ? '12px' : '14px',
                          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                        }} 
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full space-y-1.5 sm:space-y-2">
                  {performanceDistribution.map((entry, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg bg-purple-500/5 hover:bg-purple-500/10 transition-all duration-300"
                    >
                      <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-xs sm:text-sm text-white/60 flex-1 truncate">{entry.name}</span>
                      <span className="font-bold text-white text-xs sm:text-sm">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-36 sm:h-44 text-white/30 text-xs sm:text-sm">No data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Performance Alert */}
      {lowPerformers.length > 0 && (
        <GlassCard className="border-red-500/20 bg-red-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="icon-container icon-container-red">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <span className="font-semibold text-red-400 text-sm sm:text-base">
                Attention Required - {lowPerformers.length} GP{lowPerformers.length > 1 ? 's' : ''} Below Target
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
          <p className="text-xs sm:text-sm text-red-400/60">These GPs scored below 15 this month and may need additional support.</p>
        </GlassCard>
      )}

      {/* Performance Chart */}
      <Card variant="glass">
        <CardHeader className="pb-3 sm:pb-4">
          <div className="flex items-center gap-3">
            <div className="icon-container icon-container-purple">
              <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base">Monthly Performance Overview</CardTitle>
              <CardDescription>
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
                    margin={{ 
                      top: 20, 
                      right: isMobile ? 10 : 30, 
                      left: isMobile ? 0 : 20, 
                      bottom: isMobile ? 80 : 60 
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(139, 92, 246, 0.1)" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={isMobile ? 80 : 80} 
                      tick={{ fontSize: isMobile ? 10 : 11, fill: 'rgba(255,255,255,0.4)' }} 
                    />
                    <YAxis 
                      domain={[0, 24]} 
                      ticks={[0, 6, 12, 18, 24]} 
                      tick={{ fontSize: isMobile ? 10 : 12, fill: 'rgba(255,255,255,0.4)' }}
                      width={isMobile ? 30 : 40}
                    />
                    <Tooltip 
                      formatter={(value: number, name: string) => [value.toFixed(1), name]}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                      contentStyle={{ 
                        background: 'linear-gradient(145deg, rgba(35, 35, 60, 0.95) 0%, rgba(25, 25, 48, 0.9) 100%)', 
                        border: '1px solid rgba(255, 255, 255, 0.15)', 
                        borderRadius: '14px', 
                        color: '#fff',
                        backdropFilter: 'blur(20px)',
                        fontSize: isMobile ? '12px' : '14px',
                        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                      }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      wrapperStyle={{ paddingTop: isMobile ? 10 : 20, fontSize: isMobile ? '11px' : '12px' }} 
                    />
                    <Bar dataKey="totalScore" name="Total Score" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="appearance" name="Appearance" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="performance" name="Performance" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 sm:h-64 text-white/30 text-xs sm:text-sm">
              No performance data available for this period
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
