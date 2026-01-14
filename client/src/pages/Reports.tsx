import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FileSpreadsheet, Download, Plus, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { format } from "date-fns";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function ReportsPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState<number | null>(null);
  const [showNewReport, setShowNewReport] = useState(false);
  
  const [formData, setFormData] = useState({
    teamId: 0,
    reportMonth: 0,
    reportYear: new Date().getFullYear(),
    fmPerformance: "",
    goalsThisMonth: "",
    teamOverview: "",
    additionalComments: "",
  });

  const { data: reports, isLoading, refetch } = trpc.report.list.useQuery();
  const { data: teams } = trpc.fmTeam.list.useQuery();
  const generateMutation = trpc.report.generate.useMutation();
  const exportMutation = trpc.report.exportToExcel.useMutation();
  
  // Query for auto-fill data
  const { data: teamStats, refetch: refetchStats } = trpc.dashboard.stats.useQuery({
    month: formData.reportMonth || new Date().getMonth() + 1,
    year: formData.reportYear,
  }, {
    enabled: formData.teamId > 0 && formData.reportMonth > 0,
  });

  const [isAutoFilling, setIsAutoFilling] = useState(false);

  // Auto-generate Team Overview based on stats
  const handleAutoFillOverview = async () => {
    if (!teamStats || !teamStats.gpStats || teamStats.gpStats.length === 0) {
      toast.error("No evaluation data available for this month");
      return;
    }

    setIsAutoFilling(true);
    try {
      const stats = teamStats.gpStats;
      const avgTotal = stats.reduce((sum, gp) => sum + Number(gp.avgTotal), 0) / stats.length;
      const topPerformers = [...stats].sort((a, b) => Number(b.avgTotal) - Number(a.avgTotal)).slice(0, 3);
      const needsImprovement = stats.filter(gp => Number(gp.avgTotal) < 18);
      
      let overview = `Team Performance Summary for ${MONTHS[formData.reportMonth - 1]} ${formData.reportYear}:\n\n`;
      overview += `• Total GPs Evaluated: ${stats.length}\n`;
      overview += `• Average Team Score: ${avgTotal.toFixed(1)}/24\n\n`;
      
      overview += `Top Performers:\n`;
      topPerformers.forEach((gp, i) => {
        overview += `${i + 1}. ${gp.gpName} - ${gp.avgTotal}/24\n`;
      });
      
      if (needsImprovement.length > 0) {
        overview += `\nNeeds Improvement:\n`;
        needsImprovement.forEach(gp => {
          overview += `• ${gp.gpName} (${gp.avgTotal}/24)\n`;
        });
      }
      
      setFormData(prev => ({ ...prev, teamOverview: overview }));
      toast.success("Team Overview auto-filled based on evaluation data");
    } catch (error) {
      toast.error("Failed to auto-fill");
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleGenerate = async () => {
    if (!formData.teamId || !formData.reportMonth) {
      toast.error("Please select team and month");
      return;
    }

    setIsGenerating(true);
    try {
      await generateMutation.mutateAsync(formData);
      toast.success("Report generated successfully");
      setShowNewReport(false);
      setFormData({
        teamId: 0,
        reportMonth: 0,
        reportYear: new Date().getFullYear(),
        fmPerformance: "",
        goalsThisMonth: "",
        teamOverview: "",
        additionalComments: "",
      });
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async (reportId: number) => {
    setIsExporting(reportId);
    try {
      const result = await exportMutation.mutateAsync({ reportId });
      toast.success("Excel file generated");
      window.open(result.excelUrl, "_blank");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to export report");
    } finally {
      setIsExporting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Generate and manage Team Monthly Overview reports</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Generate and manage Team Monthly Overview reports</p>
        </div>
        
        <Dialog open={showNewReport} onOpenChange={setShowNewReport}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Report
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Generate Team Monthly Overview</DialogTitle>
              <DialogDescription>
                Create a new monthly report for your team
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Team *</label>
                  <Select
                    value={formData.teamId ? String(formData.teamId) : ""}
                    onValueChange={(v) => setFormData({ ...formData, teamId: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams?.map((team) => (
                        <SelectItem key={team.id} value={String(team.id)}>
                          {team.teamName} ({team.floorManagerName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Month *</label>
                  <Select
                    value={formData.reportMonth ? String(formData.reportMonth) : ""}
                    onValueChange={(v) => setFormData({ ...formData, reportMonth: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month, idx) => (
                        <SelectItem key={month} value={String(idx + 1)}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Year</label>
                <Select
                  value={String(formData.reportYear)}
                  onValueChange={(v) => setFormData({ ...formData, reportYear: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026].map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">FM Performance (Self Evaluation)</label>
                <Textarea
                  placeholder="Describe your performance this month..."
                  value={formData.fmPerformance}
                  onChange={(e) => setFormData({ ...formData, fmPerformance: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Goals This Month</label>
                  <Textarea
                    placeholder="What were your goals?"
                    value={formData.goalsThisMonth}
                    onChange={(e) => setFormData({ ...formData, goalsThisMonth: e.target.value })}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Team Overview</label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleAutoFillOverview}
                      disabled={isAutoFilling || !formData.teamId || !formData.reportMonth}
                      className="text-xs"
                    >
                      {isAutoFilling ? (
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      Auto-fill from data
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Overview of team performance..."
                    value={formData.teamOverview}
                    onChange={(e) => setFormData({ ...formData, teamOverview: e.target.value })}
                    rows={4}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Additional Notes</label>
                <Textarea
                  placeholder="Any additional comments..."
                  value={formData.additionalComments}
                  onChange={(e) => setFormData({ ...formData, additionalComments: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNewReport(false)}>
                  Cancel
                </Button>
                <Button onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>Generate Report</>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Reports</CardTitle>
          <CardDescription>
            View and export generated Team Monthly Overview reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reports && reports.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Floor Manager</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((item) => (
                  <TableRow key={item.report.id}>
                    <TableCell className="font-medium">{item.team?.teamName || "Unknown"}</TableCell>
                    <TableCell>
                      {MONTHS[item.report.reportMonth - 1]} {item.report.reportYear}
                    </TableCell>
                    <TableCell>{item.team?.floorManagerName || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.report.status === "finalized"
                            ? "default"
                            : item.report.status === "generated"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {item.report.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(item.report.createdAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {item.report.excelFileUrl ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(item.report.excelFileUrl!, "_blank")}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport(item.report.id)}
                            disabled={isExporting === item.report.id}
                          >
                            {isExporting === item.report.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <FileSpreadsheet className="h-4 w-4 mr-1" />
                                Export Excel
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No reports yet</h3>
              <p className="text-muted-foreground mb-4">
                Generate your first Team Monthly Overview report
              </p>
              <Button onClick={() => setShowNewReport(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Report
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
