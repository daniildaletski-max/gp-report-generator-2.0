import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileCheck, FileSpreadsheet, Clock } from "lucide-react";
import { format } from "date-fns";

export default function DashboardPage() {
  const { data: dashboardStats, isLoading } = trpc.dashboard.stats.useQuery();

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of Game Presenter evaluations and reports
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Game Presenters</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats?.totalGPs || 0}</div>
            <p className="text-xs text-muted-foreground">Total registered GPs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Evaluations</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats?.totalEvaluations || 0}</div>
            <p className="text-xs text-muted-foreground">Total evaluations uploaded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reports</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats?.totalReports || 0}</div>
            <p className="text-xs text-muted-foreground">Reports generated</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats?.recentEvaluations?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Recent evaluations</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Evaluations</CardTitle>
          <CardDescription>
            Latest uploaded Game Presenter evaluations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dashboardStats?.recentEvaluations && dashboardStats.recentEvaluations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game Presenter</TableHead>
                  <TableHead>Game</TableHead>
                  <TableHead className="text-center">Total Score</TableHead>
                  <TableHead>Evaluator</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboardStats.recentEvaluations.map((item) => (
                  <TableRow key={item.evaluation.id}>
                    <TableCell className="font-medium">
                      {item.gamePresenter?.name || "Unknown"}
                    </TableCell>
                    <TableCell>{item.evaluation.game || "-"}</TableCell>
                    <TableCell className="text-center font-bold">
                      {item.evaluation.totalScore || "-"}
                    </TableCell>
                    <TableCell>{item.evaluation.evaluatorName || "-"}</TableCell>
                    <TableCell>
                      {item.evaluation.evaluationDate 
                        ? format(new Date(item.evaluation.evaluationDate), "dd MMM yyyy")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No evaluations uploaded yet. Start by uploading evaluation screenshots.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
