import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, FileCheck, TrendingUp, FileSpreadsheet } from "lucide-react";
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

  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery({
    month: selectedMonth,
    year: selectedYear,
  });

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
                <Bar dataKey="totalScore" name="Total Score" fill="#1a1a1a" />
                <Bar dataKey="appearance" name="Appearance" fill="#4a4a4a" />
                <Bar dataKey="performance" name="Performance" fill="#7a7a7a" />
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
                {stats.gpStats.map((gp) => (
                  <TableRow key={gp.gpId}>
                    <TableCell className="font-medium">{gp.gpName}</TableCell>
                    <TableCell className="text-center">{gp.evalCount}</TableCell>
                    <TableCell className="text-center font-bold">{gp.avgTotal}</TableCell>
                    <TableCell className="text-center">{gp.avgHair}</TableCell>
                    <TableCell className="text-center">{gp.avgMakeup}</TableCell>
                    <TableCell className="text-center">{gp.avgOutfit}</TableCell>
                    <TableCell className="text-center">{gp.avgPosture}</TableCell>
                    <TableCell className="text-center">{gp.avgDealing}</TableCell>
                    <TableCell className="text-center">{gp.avgGamePerf}</TableCell>
                  </TableRow>
                ))}
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
