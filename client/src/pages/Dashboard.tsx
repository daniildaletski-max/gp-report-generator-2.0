import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Users, FileCheck, FileSpreadsheet, TrendingUp } from "lucide-react";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export default function DashboardPage() {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const { data: evaluations, isLoading: evalsLoading } = trpc.evaluation.list.useQuery();
  const { data: reports, isLoading: reportsLoading } = trpc.report.list.useQuery();
  const { data: gamePresenters, isLoading: gpsLoading } = trpc.gamePresenter.list.useQuery();
  const { data: monthlyStats, isLoading: statsLoading } = trpc.evaluation.getMonthlyStats.useQuery({
    year: selectedYear,
    month: selectedMonth,
  });

  const isLoading = evalsLoading || reportsLoading || gpsLoading || statsLoading;

  const chartData = useMemo(() => {
    if (!monthlyStats) return [];
    return monthlyStats.map((stat) => ({
      name: stat.gpName?.split(" ")[0] || "Unknown",
      fullName: stat.gpName,
      totalScore: Number(stat.avgTotalScore) || 0,
      appearance: (Number(stat.avgHairScore || 0) + Number(stat.avgMakeupScore || 0) + Number(stat.avgOutfitScore || 0)),
      performance: (Number(stat.avgDealingStyleScore || 0) + Number(stat.avgGamePerformanceScore || 0)),
    }));
  }, [monthlyStats]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of Game Presenter evaluations</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of Game Presenter evaluations and reports
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={selectedMonth.toString()}
            onValueChange={(v) => setSelectedMonth(parseInt(v))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month) => (
                <SelectItem key={month.value} value={month.value.toString()}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedYear.toString()}
            onValueChange={(v) => setSelectedYear(parseInt(v))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Game Presenters</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{gamePresenters?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total registered GPs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Evaluations</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{evaluations?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total evaluations uploaded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthlyStats?.length || 0}</div>
            <p className="text-xs text-muted-foreground">GPs evaluated this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reports</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reports?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Reports generated</p>
          </CardContent>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Performance Overview</CardTitle>
            <CardDescription>
              Average scores for {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45} 
                    textAnchor="end" 
                    height={80}
                    interval={0}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => value.toFixed(1)}
                    labelFormatter={(label, payload) => payload[0]?.payload?.fullName || label}
                  />
                  <Legend />
                  <Bar dataKey="totalScore" name="Total Score" fill="hsl(var(--primary))" />
                  <Bar dataKey="appearance" name="Appearance" fill="hsl(var(--chart-2))" />
                  <Bar dataKey="performance" name="Performance" fill="hsl(var(--chart-3))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {monthlyStats && monthlyStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Statistics</CardTitle>
            <CardDescription>
              Detailed breakdown for {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                {monthlyStats.map((stat) => (
                  <TableRow key={stat.gpId}>
                    <TableCell className="font-medium">{stat.gpName}</TableCell>
                    <TableCell className="text-center">{stat.evaluationCount}</TableCell>
                    <TableCell className="text-center font-bold">
                      {stat.avgTotalScore ? Number(stat.avgTotalScore).toFixed(1) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {stat.avgHairScore ? Number(stat.avgHairScore).toFixed(1) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {stat.avgMakeupScore ? Number(stat.avgMakeupScore).toFixed(1) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {stat.avgOutfitScore ? Number(stat.avgOutfitScore).toFixed(1) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {stat.avgPostureScore ? Number(stat.avgPostureScore).toFixed(1) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {stat.avgDealingStyleScore ? Number(stat.avgDealingStyleScore).toFixed(1) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {stat.avgGamePerformanceScore ? Number(stat.avgGamePerformanceScore).toFixed(1) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {(!monthlyStats || monthlyStats.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-1">No data for this period</h3>
            <p className="text-muted-foreground">
              Upload evaluation screenshots for {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear} to see statistics
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
