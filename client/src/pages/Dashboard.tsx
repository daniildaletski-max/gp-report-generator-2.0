import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, FileCheck, TrendingUp, FileSpreadsheet, AlertCircle, CheckCircle2, Clock, ArrowRight, AlertTriangle, Award, Target, TrendingDown, Calendar, BarChart3, PieChart } from "lucide-react";
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

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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
    name: gp.gpName || "Unknown", // Full name (first + last)
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
      { name: 'Excellent (20+)', value: excellent, color: '#16a34a' },
      { name: 'Good (16-19)', value: good, color: '#f59e0b' },
      { name: 'Needs Work (<16)', value: needsWork, color: '#ef4444' },
      { name: 'Not Evaluated', value: notEvaluated, color: '#94a3b8' },
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
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="flex gap-4">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-28" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="h-64 lg:col-span-2" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with Month/Year Selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Team performance overview and analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedMonth.toString()}
            onValueChange={(v) => setSelectedMonth(Number(v))}
          >
            <SelectTrigger className="w-40">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
        <CardContent className="py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                <span className="font-medium">Evaluation Progress</span>
              </div>
              <div className="h-6 w-px bg-blue-200 dark:bg-blue-700" />
              <div className="flex items-center gap-2 text-sm">
                <Progress value={evaluationProgress} className="w-40 h-3" />
                <span className="font-bold text-blue-600">{evaluationProgress}%</span>
                <span className="text-muted-foreground">({evaluatedGPs}/{totalGPs} GPs)</span>
              </div>
              {pendingGPs > 0 && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                  {pendingGPs} pending
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setLocation('/upload')}>
                Upload Evaluations
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation('/admin')}>
                Manage GP Stats
              </Button>
              <Button size="sm" onClick={() => setLocation('/reports')}>
                Generate Report <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -mr-10 -mt-10" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Game Presenters
            </CardTitle>
            <Users className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalGPs || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Total registered GPs</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full -mr-10 -mt-10" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Evaluations
            </CardTitle>
            <FileCheck className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalEvaluations || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Total evaluations uploaded</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full -mr-10 -mt-10" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Team Average
            </CardTitle>
            <TrendingUp className="h-5 w-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {avgTeamScore > 0 ? avgTeamScore.toFixed(1) : '-'}
              <span className="text-lg text-muted-foreground">/24</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Average score this month</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full -mr-10 -mt-10" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reports
            </CardTitle>
            <FileSpreadsheet className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalReports || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Reports generated</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers & Performance Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Performers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Award className="h-5 w-5 text-amber-500" />
              Top Performers
            </CardTitle>
            <CardDescription>Highest scoring GPs this month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topPerformers.length > 0 ? (
              topPerformers.map((gp, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-white ${
                    idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-gray-400' : 'bg-amber-700'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{gp.fullName}</p>
                    <p className="text-xs text-muted-foreground">{gp.evalCount} evaluations</p>
                  </div>
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                    {gp.totalScore.toFixed(1)}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                No evaluation data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Distribution Pie Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PieChart className="h-5 w-5 text-blue-500" />
              Performance Distribution
            </CardTitle>
            <CardDescription>GP performance breakdown for {MONTHS[selectedMonth - 1]}</CardDescription>
          </CardHeader>
          <CardContent>
            {performanceDistribution.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <RechartsPieChart>
                    <Pie
                      data={performanceDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {performanceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {performanceDistribution.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-sm flex-1">{entry.name}</span>
                      <span className="font-medium">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-44 text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low Performance Alert */}
      {lowPerformers.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertTriangle className="h-4 w-4" />
              Attention Required - {lowPerformers.length} GP{lowPerformers.length > 1 ? 's' : ''} Below Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowPerformers.map((gp, idx) => (
                <Badge key={idx} variant="outline" className="bg-white dark:bg-orange-950 border-orange-300 text-orange-700 dark:text-orange-300">
                  {gp.fullName}: {gp.totalScore.toFixed(1)}/24
                </Badge>
              ))}
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
              These GPs scored below 15 this month and may need additional support or training.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Monthly Performance Overview Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Monthly Performance Overview
          </CardTitle>
          <CardDescription>
            Average scores for {MONTHS[selectedMonth - 1]} {selectedYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={80}
                  tick={{ fontSize: 12 }}
                  className="fill-muted-foreground"
                />
                <YAxis domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} className="fill-muted-foreground" />
                <Tooltip 
                  formatter={(value: number, name: string) => [value.toFixed(1), name]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
                <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 20 }} />
                <Bar dataKey="totalScore" name="Total Score" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="appearance" name="Appearance" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="performance" name="Performance" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <FileCheck className="h-12 w-12 mb-4 opacity-50" />
              <p>No evaluation data for {MONTHS[selectedMonth - 1]} {selectedYear}</p>
              <Button variant="outline" className="mt-4" onClick={() => setLocation('/upload')}>
                Upload Evaluations
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Statistics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Statistics</CardTitle>
          <CardDescription>
            Complete breakdown for {MONTHS[selectedMonth - 1]} {selectedYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gpStats && gpStats.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Game Presenter</TableHead>
                    <TableHead className="text-center">Evals</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Hair</TableHead>
                    <TableHead className="text-center">Makeup</TableHead>
                    <TableHead className="text-center">Outfit</TableHead>
                    <TableHead className="text-center">Posture</TableHead>
                    <TableHead className="text-center">Dealing</TableHead>
                    <TableHead className="text-center">Game Perf</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gpStats.map((gp: GPStat) => {
                    const total = Number(gp.avgTotal);
                    const getScoreColor = (score: string, max: number = 3) => {
                      const val = Number(score);
                      const pct = val / max;
                      if (pct >= 0.8) return "text-green-600 font-medium";
                      if (pct >= 0.6) return "text-yellow-600";
                      if (pct < 0.4 && val > 0) return "text-red-600";
                      return "";
                    };
                    const getTotalBadge = () => {
                      if (total >= 20) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
                      if (total >= 16) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
                      if (total > 0) return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
                      return "bg-gray-100 text-gray-500";
                    };
                    return (
                      <TableRow key={gp.gpId} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{gp.gpName}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="font-mono">
                            {gp.evalCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md font-bold ${getTotalBadge()}`}>
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
        </CardContent>
      </Card>
    </div>
  );
}
