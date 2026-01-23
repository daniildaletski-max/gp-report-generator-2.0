import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, FileCheck, TrendingUp, FileSpreadsheet, AlertTriangle, Award, Target, Calendar, BarChart3, PieChart, ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from "recharts";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
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
      <div className="p-6 min-h-screen bg-[#08080f]">
        <div className="space-y-6 animate-fade-in">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-8 w-48 skeleton-enhanced rounded-xl" />
              <div className="h-4 w-32 skeleton-enhanced rounded-lg" />
            </div>
            <div className="flex gap-3">
              <div className="h-10 w-40 skeleton-enhanced rounded-xl" />
              <div className="h-10 w-28 skeleton-enhanced rounded-xl" />
            </div>
          </div>
          {/* Progress bar skeleton */}
          <div className="unified-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="h-12 w-12 skeleton-enhanced rounded-xl" />
                <div className="space-y-2">
                  <div className="h-4 w-32 skeleton-enhanced rounded-lg" />
                  <div className="h-2 w-48 skeleton-enhanced rounded-full" />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="h-10 w-24 skeleton-enhanced rounded-xl" />
                <div className="h-10 w-36 skeleton-enhanced rounded-xl" />
              </div>
            </div>
          </div>
          {/* Stats cards skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="stat-card-enhanced h-32 skeleton-enhanced rounded-2xl" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
          {/* Charts skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="unified-card h-72 skeleton-enhanced rounded-2xl" />
            <div className="unified-card h-72 lg:col-span-2 skeleton-enhanced rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#08080f]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 animate-fade-in">
        <div className="page-header mb-0">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Team performance overview</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-40 glass-input rounded-xl border-purple-500/15 hover:border-purple-500/30 transition-colors">
              <Calendar className="h-4 w-4 mr-2 text-purple-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#12121e]/95 backdrop-blur-xl border-purple-500/20 rounded-xl shadow-xl shadow-purple-500/10">
              {MONTHS.map((month, idx) => (
                <SelectItem key={idx} value={(idx + 1).toString()} className="rounded-lg hover:bg-purple-500/10 focus:bg-purple-500/15">{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24 glass-input rounded-xl border-purple-500/15 hover:border-purple-500/30 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#12121e]/95 backdrop-blur-xl border-purple-500/20 rounded-xl shadow-xl shadow-purple-500/10">
              {[2024, 2025, 2026].map((year) => (
                <SelectItem key={year} value={year.toString()} className="rounded-lg hover:bg-purple-500/10 focus:bg-purple-500/15">{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="unified-card p-5 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="icon-box icon-box-purple">
                <Target className="h-5 w-5" />
              </div>
              <div className="section-header">
                <span className="section-title text-base">Evaluation Progress</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-52 relative">
                <Progress value={evaluationProgress} className="h-2.5 bg-purple-500/10 rounded-full" />
                <div 
                  className="absolute -top-1 h-4 w-4 bg-purple-500 rounded-full border-2 border-[#08080f] shadow-lg shadow-purple-500/30 transition-all duration-500"
                  style={{ left: `calc(${evaluationProgress}% - 8px)` }}
                />
              </div>
              <span className="font-bold text-purple-400 counter-value text-lg">{evaluationProgress}%</span>
              <span className="text-white/40 text-sm">({evaluatedGPs}/{totalGPs} GPs)</span>
            </div>
            {pendingGPs > 0 && (
              <span className="badge-base badge-amber animate-pulse-slow">{pendingGPs} pending</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setLocation('/upload')} className="btn-secondary text-sm rounded-xl px-5">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            <Button size="sm" onClick={() => setLocation('/reports')} className="btn-primary text-sm rounded-xl px-5 group">
              Generate Report
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger">
        <div className="stat-card-enhanced purple group">
          <div className="flex items-start justify-between mb-4">
            <div className="icon-box icon-box-purple group-hover:scale-110 transition-transform duration-300">
              <Users className="h-5 w-5" />
            </div>
            <span className="text-xs text-purple-400/60 uppercase tracking-wide font-medium">Total</span>
          </div>
          <div className="text-4xl font-bold text-white mb-1 counter-value">{stats?.totalGPs || 0}</div>
          <p className="text-sm text-white/40">Game Presenters</p>
        </div>

        <div className="stat-card-enhanced green group">
          <div className="flex items-start justify-between mb-4">
            <div className="icon-box icon-box-green group-hover:scale-110 transition-transform duration-300">
              <FileCheck className="h-5 w-5" />
            </div>
            <span className="text-xs text-green-400/60 uppercase tracking-wide font-medium">This Month</span>
          </div>
          <div className="text-4xl font-bold text-white mb-1 counter-value">{stats?.totalEvaluations || 0}</div>
          <p className="text-sm text-white/40">Total Evaluations</p>
        </div>

        <div className="stat-card-enhanced amber group">
          <div className="flex items-start justify-between mb-4">
            <div className="icon-box icon-box-amber group-hover:scale-110 transition-transform duration-300">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="text-xs text-amber-400/60 uppercase tracking-wide font-medium">Average</span>
          </div>
          <div className="text-4xl font-bold text-white mb-1">
            <span className="counter-value">{avgTeamScore > 0 ? avgTeamScore.toFixed(1) : '-'}</span>
            <span className="text-lg text-white/25 font-normal ml-1">/22</span>
          </div>
          <p className="text-sm text-white/40">Team Average</p>
        </div>

        <div className="stat-card-enhanced fuchsia group">
          <div className="flex items-start justify-between mb-4">
            <div className="icon-box icon-box-fuchsia group-hover:scale-110 transition-transform duration-300">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <span className="text-xs text-fuchsia-400/60 uppercase tracking-wide font-medium">Generated</span>
          </div>
          <div className="text-4xl font-bold text-white mb-1 counter-value">{stats?.totalReports || 0}</div>
          <p className="text-sm text-white/40">Reports Generated</p>
        </div>
      </div>

      {/* Top Performers & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Performers */}
        <div className="unified-card overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="unified-card-header">
            <div className="icon-box icon-box-amber">
              <Award className="h-5 w-5" />
            </div>
            <div className="section-header">
              <h3 className="section-title">Top Performers</h3>
              <p className="section-subtitle">Highest scoring GPs</p>
            </div>
          </div>
          <div className="unified-card-body space-y-2">
            {topPerformers.length > 0 ? (
              topPerformers.map((gp, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-purple-500/5 hover:bg-purple-500/10 hover:translate-x-1 transition-all duration-300 group">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-xl font-bold text-sm transition-transform group-hover:scale-110 ${
                    idx === 0 ? 'bg-gradient-to-br from-amber-500/30 to-amber-600/20 text-amber-400 shadow-lg shadow-amber-500/20' : 
                    idx === 1 ? 'bg-gradient-to-br from-slate-400/20 to-slate-500/10 text-slate-300' : 
                    'bg-gradient-to-br from-orange-500/25 to-orange-600/15 text-orange-400'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white/90 truncate text-sm">{gp.fullName}</p>
                    <p className="text-xs text-white/30">{gp.evalCount} evaluations</p>
                  </div>
                  <span className="score-pill score-pill-excellent font-bold">{gp.totalScore.toFixed(1)}</span>
                </div>
              ))
            ) : (
              <div className="empty-state py-8">
                <div className="empty-state-icon">
                  <Award className="h-8 w-8 text-purple-400/50" />
                </div>
                <p className="empty-state-title">No top performers yet</p>
                <p className="empty-state-description">Upload evaluations to see rankings</p>
              </div>
            )}
          </div>
        </div>

        {/* Performance Distribution */}
        <div className="unified-card overflow-hidden lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <div className="unified-card-header">
            <div className="icon-box icon-box-violet">
              <PieChart className="h-5 w-5" />
            </div>
            <div className="section-header">
              <h3 className="section-title">Performance Distribution</h3>
              <p className="section-subtitle">GP breakdown for {MONTHS[selectedMonth - 1]}</p>
            </div>
          </div>
          <div className="unified-card-body">
            {performanceDistribution.length > 0 ? (
              <div className="flex items-center gap-8">
                <ResponsiveContainer width="45%" height={190}>
                  <RechartsPieChart>
                    <Pie 
                      data={performanceDistribution} 
                      cx="50%" 
                      cy="50%" 
                      innerRadius={50} 
                      outerRadius={75} 
                      paddingAngle={4} 
                      dataKey="value"
                      stroke="rgba(8,8,15,0.8)"
                      strokeWidth={2}
                    >
                      {performanceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(18,18,30,0.95)', 
                        border: '1px solid rgba(139, 92, 246, 0.2)', 
                        borderRadius: '12px', 
                        color: '#fff',
                        backdropFilter: 'blur(12px)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                      }} 
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2.5">
                  {performanceDistribution.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-3 rounded-xl bg-purple-500/5 hover:bg-purple-500/10 transition-all duration-300 group">
                      <div className="w-4 h-4 rounded-lg shadow-lg" style={{ backgroundColor: entry.color, boxShadow: `0 4px 12px ${entry.color}40` }} />
                      <span className="text-sm text-white/60 flex-1 group-hover:text-white/80 transition-colors">{entry.name}</span>
                      <span className="font-bold text-white text-lg counter-value">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state h-48">
                <div className="empty-state-icon">
                  <PieChart className="h-8 w-8 text-purple-400/50" />
                </div>
                <p className="empty-state-title">No distribution data</p>
                <p className="empty-state-description">Data will appear after evaluations are processed</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Low Performance Alert */}
      {lowPerformers.length > 0 && (
        <div className="alert-card alert-card-danger animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center gap-4 mb-4">
            <div className="icon-box icon-box-red animate-pulse-slow">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <span className="font-semibold text-red-400 text-lg">
                Attention Required
              </span>
              <p className="text-sm text-red-400/60">{lowPerformers.length} GP{lowPerformers.length > 1 ? 's' : ''} below target score</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-3 pl-16">
            {lowPerformers.map((gp, idx) => (
              <span key={idx} className="score-pill score-pill-poor">
                {gp.fullName}: {gp.totalScore.toFixed(1)}/22
              </span>
            ))}
          </div>
          <p className="text-sm text-red-400/50 pl-16">These GPs scored below 15 this month and may need additional support or coaching.</p>
        </div>
      )}

      {/* Performance Chart */}
      <div className="unified-card overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
        <div className="unified-card-header">
          <div className="icon-box icon-box-purple">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="section-header">
            <h3 className="section-title">Monthly Performance Overview</h3>
            <p className="section-subtitle">Average scores for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
          </div>
        </div>
        <div className="unified-card-body">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <defs>
                  <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.8}/>
                  </linearGradient>
                  <linearGradient id="appearanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.8}/>
                  </linearGradient>
                  <linearGradient id="performanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#d97706" stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(139, 92, 246, 0.08)" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} axisLine={{ stroke: 'rgba(139, 92, 246, 0.1)' }} />
                <YAxis domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tick={{ fill: 'rgba(255,255,255,0.4)' }} axisLine={{ stroke: 'rgba(139, 92, 246, 0.1)' }} />
                <Tooltip 
                  formatter={(value: number, name: string) => [value.toFixed(1), name]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  contentStyle={{ 
                    backgroundColor: 'rgba(18,18,30,0.95)', 
                    border: '1px solid rgba(139, 92, 246, 0.2)', 
                    borderRadius: '14px', 
                    color: '#fff',
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    padding: '12px 16px'
                  }}
                  cursor={{ fill: 'rgba(139, 92, 246, 0.05)' }}
                />
                <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 20 }} />
                <Bar dataKey="totalScore" name="Total Score" fill="url(#totalGradient)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="appearance" name="Appearance" fill="url(#appearanceGradient)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="performance" name="Performance" fill="url(#performanceGradient)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state h-72">
              <div className="empty-state-icon">
                <FileCheck className="h-10 w-10 text-purple-400/50" />
              </div>
              <p className="empty-state-title">No evaluation data</p>
              <p className="empty-state-description">Upload evaluations for {MONTHS[selectedMonth - 1]} {selectedYear} to see performance metrics</p>
              <Button variant="outline" className="mt-6 btn-secondary rounded-xl" onClick={() => setLocation('/upload')}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Evaluations
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Statistics Table */}
      <div className="unified-card overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
        <div className="unified-card-header">
          <div className="icon-box icon-box-violet">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="section-header">
            <h3 className="section-title">Detailed Statistics</h3>
            <p className="section-subtitle">Complete breakdown for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
          </div>
        </div>
        <div className="unified-card-body p-0">
          {gpStats && gpStats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table-enhanced w-full">
                <thead>
                  <tr>
                    <th>Game Presenter</th>
                    <th className="text-center">Evals</th>
                    <th className="text-center">Total</th>
                    <th className="text-center">Hair</th>
                    <th className="text-center">Makeup</th>
                    <th className="text-center">Outfit</th>
                    <th className="text-center">Posture</th>
                    <th className="text-center">Dealing</th>
                    <th className="text-center">Game Perf</th>
                  </tr>
                </thead>
                <tbody>
                  {gpStats.map((gp: GPStat) => {
                    const total = Number(gp.avgTotal);
                    const getScoreColor = (score: string, max: number = 3) => {
                      const val = Number(score);
                      const pct = val / max;
                      if (pct >= 0.8) return "text-green-400 font-medium";
                      if (pct >= 0.6) return "text-amber-400";
                      if (pct < 0.4 && val > 0) return "text-red-400";
                      return "text-white/40";
                    };
                    const getTotalPill = () => {
                      if (total >= 20) return "score-pill-excellent";
                      if (total >= 16) return "score-pill-good";
                      if (total > 0) return "score-pill-poor";
                      return "score-pill-neutral";
                    };
                    return (
                      <tr key={gp.gpId}>
                        <td className="font-medium text-white/90">{gp.gpName}</td>
                        <td className="text-center">
                          <span className="text-white/50 text-sm">{gp.evalCount}</span>
                        </td>
                        <td className="text-center">
                          <span className={`score-pill ${getTotalPill()}`}>{gp.avgTotal}</span>
                        </td>
                        <td className={`text-center ${getScoreColor(gp.avgHair)}`}>{gp.avgHair}</td>
                        <td className={`text-center ${getScoreColor(gp.avgMakeup)}`}>{gp.avgMakeup}</td>
                        <td className={`text-center ${getScoreColor(gp.avgOutfit)}`}>{gp.avgOutfit}</td>
                        <td className={`text-center ${getScoreColor(gp.avgPosture)}`}>{gp.avgPosture}</td>
                        <td className={`text-center ${getScoreColor(gp.avgDealing, 6)}`}>{gp.avgDealing}</td>
                        <td className={`text-center ${getScoreColor(gp.avgGamePerf, 6)}`}>{gp.avgGamePerf}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state h-40">
              <div className="empty-state-icon" style={{ width: '60px', height: '60px' }}>
                <BarChart3 className="h-6 w-6 text-purple-400/50" />
              </div>
              <p className="empty-state-title">No statistics available</p>
              <p className="empty-state-description">Data for {MONTHS[selectedMonth - 1]} {selectedYear} will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
