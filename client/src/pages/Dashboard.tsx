import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, FileCheck, TrendingUp, FileSpreadsheet, AlertCircle, CheckCircle2, Clock, ArrowRight, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

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
  const evaluatedGPs = stats?.thisMonthGPs || 0;
  const evaluationProgress = totalGPs > 0 ? Math.round((evaluatedGPs / totalGPs) * 100) : 0;
  const pendingGPs = totalGPs - evaluatedGPs;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg" />
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded-lg" />
          <div className="h-64 bg-gray-200 rounded-lg" />
        </div>
      </div>
    );
  }

  // Prepare chart data
  const chartData = stats?.gpStats?.map((gp) => ({
    name: gp.gpName?.split(" ")[0] || "Unknown", // First name only for chart
    fullName: gp.gpName,
    totalScore: Number(gp.avgTotal),
    appearance: Number(gp.avgAppearance),
    performance: Number(gp.avgPerformance),
  })) || [];

  // Find GPs needing attention (score < 15)
  const lowPerformers = chartData.filter(gp => gp.totalScore > 0 && gp.totalScore < 15);

  return (
    <div className="p-6 space-y-6">
      {/* Month/Year Selector */}
      <div className="flex items-center gap-4">
        <Select
          value={selectedMonth.toString()}
          onValueChange={(v) => setSelectedMonth(Number(v))}
        >
          <SelectTrigger className="w-40">
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

      {/* Quick Actions Bar */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <span className="font-medium">Quick Actions</span>
              </div>
              <div className="h-6 w-px bg-blue-200" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Progress:</span>
                <Progress value={evaluationProgress} className="w-32 h-2" />
                <span className="font-medium">{evaluationProgress}%</span>
                <span className="text-muted-foreground">({evaluatedGPs}/{totalGPs} GPs)</span>
              </div>
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

      {/* Low Performance Alert */}
      {lowPerformers.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              Attention Required - {lowPerformers.length} GP{lowPerformers.length > 1 ? 's' : ''} Below Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowPerformers.map((gp, idx) => (
                <Badge key={idx} variant="outline" className="bg-white border-orange-300 text-orange-700">
                  {gp.fullName}: {gp.totalScore.toFixed(1)}/22
                </Badge>
              ))}
            </div>
            <p className="text-xs text-orange-600 mt-2">
              These GPs scored below 15 this month and may need additional support or training.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Game Presenters
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalGPs || 0}</div>
            <p className="text-xs text-muted-foreground">Total registered GPs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Evaluations
            </CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalEvaluations || 0}</div>
            <p className="text-xs text-muted-foreground">Total evaluations uploaded</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.thisMonthGPs || 0}</div>
            <p className="text-xs text-muted-foreground">GPs evaluated this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reports
            </CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalReports || 0}</div>
            <p className="text-xs text-muted-foreground">Reports generated</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Performance Overview Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Performance Overview</CardTitle>
          <p className="text-sm text-muted-foreground">
            Average scores for {MONTHS[selectedMonth - 1]} {selectedYear}
          </p>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={80}
                  tick={{ fontSize: 12 }}
                />
                <YAxis domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} />
                <Tooltip 
                  formatter={(value: number, name: string) => [value.toFixed(1), name]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                />
                <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 20 }} />
                <Bar dataKey="totalScore" name="Total Score" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="appearance" name="Appearance" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="performance" name="Performance" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No evaluation data for {MONTHS[selectedMonth - 1]} {selectedYear}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Statistics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Statistics</CardTitle>
          <p className="text-sm text-muted-foreground">
            Detailed breakdown for {MONTHS[selectedMonth - 1]} {selectedYear}
          </p>
        </CardHeader>
        <CardContent>
          {stats?.gpStats && stats.gpStats.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game Presenter</TableHead>
                  <TableHead className="text-center">Evaluations</TableHead>
                  <TableHead className="text-center">Avg Total</TableHead>
                  <TableHead className="text-center">Hair</TableHead>
                  <TableHead className="text-center">Makeup</TableHead>
                  <TableHead className="text-center">Outfit</TableHead>
                  <TableHead className="text-center">Posture</TableHead>
                  <TableHead className="text-center">Dealing</TableHead>
                  <TableHead className="text-center">Game Perf</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.gpStats.map((gp) => {
                  const total = Number(gp.avgTotal);
                  const getScoreColor = (score: string, max: number = 3) => {
                    const val = Number(score);
                    const pct = val / max;
                    if (pct >= 0.8) return "text-green-600 font-medium";
                    if (pct >= 0.6) return "text-yellow-600";
                    if (pct < 0.4) return "text-red-600";
                    return "";
                  };
                  const getTotalColor = () => {
                    if (total >= 20) return "bg-green-100 text-green-800";
                    if (total >= 16) return "bg-yellow-100 text-yellow-800";
                    return "bg-red-100 text-red-800";
                  };
                  return (
                    <TableRow key={gp.gpId} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{gp.gpName}</TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-medium">
                          {gp.evalCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-1 rounded font-bold ${getTotalColor()}`}>
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
