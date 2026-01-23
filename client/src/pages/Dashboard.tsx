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
      { name: 'Excellent (20+)', value: excellent, color: '#30d158' },
      { name: 'Good (16-19)', value: good, color: '#ffd60a' },
      { name: 'Needs Work (<16)', value: needsWork, color: '#ff453a' },
      { name: 'Not Evaluated', value: notEvaluated, color: '#48484a' },
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
      <div className="p-6 min-h-screen bg-[#0d0d14]">
        <div className="animate-pulse space-y-6">
          <div className="flex gap-4">
            <div className="h-10 w-40 bg-white/[0.04] rounded-xl" />
            <div className="h-10 w-28 bg-white/[0.04] rounded-xl" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-white/[0.04] rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#0d0d14]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">Team performance overview</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-40 input-base">
              <Calendar className="h-4 w-4 mr-2 text-white/40" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a24] border-white/[0.08] rounded-xl">
              {MONTHS.map((month, idx) => (
                <SelectItem key={idx} value={(idx + 1).toString()}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24 input-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a24] border-white/[0.08] rounded-xl">
              {[2024, 2025, 2026].map((year) => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="card-base p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="icon-container icon-container-cyan">
                <Target className="h-5 w-5" />
              </div>
              <span className="font-medium text-white/80">Evaluation Progress</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-48">
                <Progress value={evaluationProgress} className="h-2 bg-white/[0.06]" />
              </div>
              <span className="font-bold text-[#64d2ff]">{evaluationProgress}%</span>
              <span className="text-white/40 text-sm">({evaluatedGPs}/{totalGPs} GPs)</span>
            </div>
            {pendingGPs > 0 && (
              <span className="badge-base badge-amber">{pendingGPs} pending</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation('/upload')} className="btn-secondary text-sm">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            <Button size="sm" onClick={() => setLocation('/reports')} className="btn-primary text-sm">
              Generate Report
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card stat-card-cyan">
          <div className="flex items-start justify-between mb-3">
            <div className="icon-container icon-container-cyan">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{stats?.totalGPs || 0}</div>
          <p className="text-sm text-white/40">Game Presenters</p>
        </div>

        <div className="stat-card stat-card-green">
          <div className="flex items-start justify-between mb-3">
            <div className="icon-container icon-container-green">
              <FileCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{stats?.totalEvaluations || 0}</div>
          <p className="text-sm text-white/40">Total Evaluations</p>
        </div>

        <div className="stat-card stat-card-amber">
          <div className="flex items-start justify-between mb-3">
            <div className="icon-container icon-container-amber">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {avgTeamScore > 0 ? avgTeamScore.toFixed(1) : '-'}
            <span className="text-lg text-white/30 font-normal">/22</span>
          </div>
          <p className="text-sm text-white/40">Team Average</p>
        </div>

        <div className="stat-card stat-card-purple">
          <div className="flex items-start justify-between mb-3">
            <div className="icon-container icon-container-purple">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{stats?.totalReports || 0}</div>
          <p className="text-sm text-white/40">Reports Generated</p>
        </div>
      </div>

      {/* Top Performers & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Performers */}
        <div className="card-base overflow-hidden">
          <div className="p-4 border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="icon-container icon-container-amber">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Top Performers</h3>
                <p className="text-xs text-white/40">Highest scoring GPs</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {topPerformers.length > 0 ? (
              topPerformers.map((gp, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
                  <div className={`flex items-center justify-center w-9 h-9 rounded-lg font-bold text-sm ${
                    idx === 0 ? 'bg-[#ffd60a]/20 text-[#ffd60a]' : 
                    idx === 1 ? 'bg-white/10 text-white/60' : 
                    'bg-[#ac8e68]/20 text-[#ac8e68]'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white/90 truncate text-sm">{gp.fullName}</p>
                    <p className="text-xs text-white/30">{gp.evalCount} evaluations</p>
                  </div>
                  <span className="badge-base badge-green font-bold">{gp.totalScore.toFixed(1)}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-white/30 text-sm">No evaluation data yet</div>
            )}
          </div>
        </div>

        {/* Performance Distribution */}
        <div className="card-base overflow-hidden lg:col-span-2">
          <div className="p-4 border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="icon-container icon-container-purple">
                <PieChart className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Performance Distribution</h3>
                <p className="text-xs text-white/40">GP breakdown for {MONTHS[selectedMonth - 1]}</p>
              </div>
            </div>
          </div>
          <div className="p-4">
            {performanceDistribution.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={180}>
                  <RechartsPieChart>
                    <Pie data={performanceDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {performanceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff' }} />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {performanceDistribution.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02]">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-sm text-white/60 flex-1">{entry.name}</span>
                      <span className="font-bold text-white">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-44 text-white/30 text-sm">No data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Low Performance Alert */}
      {lowPerformers.length > 0 && (
        <div className="card-base p-4 border-[#ff453a]/20 bg-[#ff453a]/[0.04]">
          <div className="flex items-center gap-3 mb-3">
            <div className="icon-container icon-container-red">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <span className="font-semibold text-[#ff453a]">
              Attention Required - {lowPerformers.length} GP{lowPerformers.length > 1 ? 's' : ''} Below Target
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {lowPerformers.map((gp, idx) => (
              <span key={idx} className="badge-base badge-red">{gp.fullName}: {gp.totalScore.toFixed(1)}/22</span>
            ))}
          </div>
          <p className="text-sm text-[#ff453a]/60">These GPs scored below 15 this month and may need additional support.</p>
        </div>
      )}

      {/* Performance Chart */}
      <div className="card-base overflow-hidden">
        <div className="p-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="icon-container icon-container-cyan">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Monthly Performance Overview</h3>
              <p className="text-xs text-white/40">Average scores for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                <YAxis domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tick={{ fill: 'rgba(255,255,255,0.4)' }} />
                <Tooltip 
                  formatter={(value: number, name: string) => [value.toFixed(1), name]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff' }}
                />
                <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 20 }} />
                <Bar dataKey="totalScore" name="Total Score" fill="#64d2ff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="appearance" name="Appearance" fill="#30d158" radius={[4, 4, 0, 0]} />
                <Bar dataKey="performance" name="Performance" fill="#ffd60a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-white/30">
              <FileCheck className="h-12 w-12 mb-4 opacity-30" />
              <p>No evaluation data for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
              <Button variant="outline" className="mt-4 btn-secondary" onClick={() => setLocation('/upload')}>Upload Evaluations</Button>
            </div>
          )}
        </div>
      </div>

      {/* Statistics Table */}
      <div className="card-base overflow-hidden">
        <div className="p-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="icon-container icon-container-cyan">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Detailed Statistics</h3>
              <p className="text-xs text-white/40">Complete breakdown for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          {gpStats && gpStats.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.04] hover:bg-transparent">
                    <TableHead className="text-white/50 font-medium text-xs uppercase tracking-wide">Game Presenter</TableHead>
                    <TableHead className="text-center text-white/50 font-medium text-xs uppercase tracking-wide">Evals</TableHead>
                    <TableHead className="text-center text-white/50 font-medium text-xs uppercase tracking-wide">Total</TableHead>
                    <TableHead className="text-center text-white/50 font-medium text-xs uppercase tracking-wide">Hair</TableHead>
                    <TableHead className="text-center text-white/50 font-medium text-xs uppercase tracking-wide">Makeup</TableHead>
                    <TableHead className="text-center text-white/50 font-medium text-xs uppercase tracking-wide">Outfit</TableHead>
                    <TableHead className="text-center text-white/50 font-medium text-xs uppercase tracking-wide">Posture</TableHead>
                    <TableHead className="text-center text-white/50 font-medium text-xs uppercase tracking-wide">Dealing</TableHead>
                    <TableHead className="text-center text-white/50 font-medium text-xs uppercase tracking-wide">Game Perf</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gpStats.map((gp: GPStat) => {
                    const total = Number(gp.avgTotal);
                    const getScoreColor = (score: string, max: number = 3) => {
                      const val = Number(score);
                      const pct = val / max;
                      if (pct >= 0.8) return "text-[#30d158]";
                      if (pct >= 0.6) return "text-[#ffd60a]";
                      if (pct < 0.4 && val > 0) return "text-[#ff453a]";
                      return "text-white/40";
                    };
                    const getTotalBadge = () => {
                      if (total >= 20) return "badge-green";
                      if (total >= 16) return "badge-amber";
                      if (total > 0) return "badge-red";
                      return "badge-gray";
                    };
                    return (
                      <TableRow key={gp.gpId} className="border-white/[0.04] hover:bg-white/[0.02]">
                        <TableCell className="font-medium text-white/90">{gp.gpName}</TableCell>
                        <TableCell className="text-center">
                          <span className="badge-base badge-gray">{gp.evalCount}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`badge-base font-bold ${getTotalBadge()}`}>{gp.avgTotal}</span>
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
            <div className="flex items-center justify-center h-32 text-white/30 text-sm">
              No evaluation data for {MONTHS[selectedMonth - 1]} {selectedYear}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
