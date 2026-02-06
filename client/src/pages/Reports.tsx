import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FileSpreadsheet, Download, Plus, Loader2, Sparkles, RefreshCw, Wand2, Trash2, Eye, Calendar, Users, TrendingUp, Search, Filter, X, Copy, CheckCircle, Cloud, ExternalLink } from "lucide-react";
import { format } from "date-fns";

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

export default function ReportsPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState<number | null>(null);
  const [showNewReport, setShowNewReport] = useState(false);
  const [viewingReport, setViewingReport] = useState<any>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  const [formData, setFormData] = useState({
    teamId: 0,
    reportMonth: 0,
    reportYear: new Date().getFullYear(),
    fmPerformance: "",
    goalsThisMonth: "",
    teamOverview: "",
    additionalComments: "",
  });

  const utils = trpc.useUtils();
  const { data: reports, isLoading, refetch } = trpc.report.list.useQuery();
  const { data: teams } = trpc.fmTeam.list.useQuery();
  const generateMutation = trpc.report.generate.useMutation();
  const exportMutation = trpc.report.exportToExcel.useMutation();
  const exportGoogleSheetsMutation = trpc.report.exportToGoogleSheets.useMutation();
  const [isExportingGoogleSheets, setIsExportingGoogleSheets] = useState<number | null>(null);
  const autoFillMutation = trpc.report.autoFillFields.useMutation();
  const deleteMutation = trpc.report.delete.useMutation({
    onSuccess: () => {
      toast.success("Report deleted successfully");
      utils.report.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete report");
    },
  });

  const [deletingReportId, setDeletingReportId] = useState<number | null>(null);

  // Statistics
  const stats = useMemo(() => {
    if (!reports) return { total: 0, thisMonth: 0, finalized: 0, exported: 0 };
    const now = new Date();
    return {
      total: reports.length,
      thisMonth: reports.filter(r => 
        r.report.reportMonth === now.getMonth() + 1 && 
        r.report.reportYear === now.getFullYear()
      ).length,
      finalized: reports.filter(r => r.report.status === 'finalized').length,
      exported: reports.filter(r => r.report.excelFileUrl).length,
    };
  }, [reports]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    if (!reports) return [];
    return reports.filter(item => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const teamName = item.team?.teamName?.toLowerCase() || "";
        const fmName = item.team?.floorManagerName?.toLowerCase() || "";
        if (!teamName.includes(query) && !fmName.includes(query)) return false;
      }
      if (filterYear && item.report.reportYear !== filterYear) return false;
      if (filterStatus && filterStatus !== "all" && item.report.status !== filterStatus) return false;
      return true;
    });
  }, [reports, searchQuery, filterYear, filterStatus]);

  const hasActiveFilters = searchQuery || filterYear || (filterStatus && filterStatus !== "all");

  const clearFilters = () => {
    setSearchQuery("");
    setFilterYear(null);
    setFilterStatus("all");
  };

  const handleDeleteReport = async (reportId: number) => {
    setDeletingReportId(reportId);
    try {
      await deleteMutation.mutateAsync({ id: reportId });
    } finally {
      setDeletingReportId(null);
    }
  };
  
  // Query for auto-fill data (simple stats)
  const { data: teamStats, refetch: refetchStats } = trpc.dashboard.stats.useQuery({
    month: formData.reportMonth || new Date().getMonth() + 1,
    year: formData.reportYear,
  }, {
    enabled: formData.teamId > 0 && formData.reportMonth > 0,
  });

  const [isAutoFilling, setIsAutoFilling] = useState(false);

  // Auto-generate all text fields using LLM
  const handleAutoFillAll = async () => {
    if (!formData.teamId || !formData.reportMonth) {
      toast.error("Please select team and month first");
      return;
    }

    setIsAutoFilling(true);
    try {
      const result = await autoFillMutation.mutateAsync({
        teamId: formData.teamId,
        reportMonth: formData.reportMonth,
        reportYear: formData.reportYear,
      });

      setFormData(prev => ({
        ...prev,
        fmPerformance: result.fmPerformance,
        goalsThisMonth: result.goalsThisMonth,
        teamOverview: result.teamOverview,
      }));

      toast.success("All fields auto-filled based on evaluation data", {
        description: `Generated from ${result.stats.totalGPs} GP evaluations`
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to auto-fill fields");
    } finally {
      setIsAutoFilling(false);
    }
  };

  // Simple auto-fill for Team Overview only (no LLM)
  const handleAutoFillOverview = async () => {
    const gpStats = (teamStats as { gpStats?: GPStat[] })?.gpStats;
    if (!teamStats || !gpStats || gpStats.length === 0) {
      toast.error("No evaluation data available for this month");
      return;
    }

    const stats = gpStats;
    const avgTotal = stats.reduce((sum: number, gp: GPStat) => sum + Number(gp.avgTotal), 0) / stats.length;
    const topPerformers = [...stats].sort((a: GPStat, b: GPStat) => Number(b.avgTotal) - Number(a.avgTotal)).slice(0, 3);
    const needsImprovement = stats.filter((gp: GPStat) => Number(gp.avgTotal) < 18);
    
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
  };

  const handleGenerate = async () => {
    if (!formData.teamId || !formData.reportMonth) {
      toast.error("Please select team and month");
      return;
    }

    setIsGenerating(true);
    try {
      await generateMutation.mutateAsync({
        ...formData,
        autoFill: true, // Always auto-fill empty fields with AI-generated content
      });
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
      
      // Show success message with email status
      if (result.emailSent && result.emailAddress) {
        toast.success(
          <div className="flex flex-col gap-1">
            <span>Excel file generated with embedded chart</span>
            <span className="text-xs text-green-200">📧 Report sent to {result.emailAddress}</span>
          </div>,
          { duration: 5000 }
        );
      } else if (result.emailAddress) {
        toast.success("Excel file generated. Email delivery pending...");
      } else {
        toast.success("Excel file generated with embedded chart");
      }
      
      window.open(result.excelUrl, "_blank");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to export report");
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportGoogleSheets = async (reportId: number) => {
    setIsExportingGoogleSheets(reportId);
    try {
      const result = await exportGoogleSheetsMutation.mutateAsync({ reportId });
      
      // Show success message with email status
      if (result.emailSent && result.emailAddress) {
        toast.success(
          <div className="flex flex-col gap-1">
            <span>Report uploaded to Google Drive!</span>
            <span className="text-xs text-green-200">📧 Report sent to {result.emailAddress}</span>
          </div>,
          { duration: 5000 }
        );
      } else {
        toast.success("Report uploaded to Google Drive!");
      }
      
      window.open(result.googleSheetsUrl, "_blank");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to export to Google Sheets");
    } finally {
      setIsExportingGoogleSheets(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'finalized':
        return <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">Finalized</Badge>;
      case 'generated':
        return <Badge variant="secondary">Generated</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6 min-h-screen animate-fade-in">
        {/* Page Header Skeleton */}
        <div className="page-header">
          <div className="skeleton-enhanced h-8 w-32 rounded-lg" />
          <div className="skeleton-enhanced h-4 w-64 rounded mt-2" />
        </div>
        
        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card-enhanced stat-card-cyan p-5">
              <div className="flex items-center gap-3">
                <div className="skeleton-enhanced h-10 w-10 rounded-xl" />
                <div className="flex-1">
                  <div className="skeleton-enhanced h-3 w-20 rounded mb-2" />
                  <div className="skeleton-enhanced h-6 w-16 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Table Skeleton */}
        <div className="unified-card">
          <div className="unified-card-header">
            <div className="skeleton-enhanced h-5 w-32 rounded" />
          </div>
          <div className="unified-card-body">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-enhanced h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Generate and manage Team Monthly Overview reports</p>
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
              <div className="grid grid-cols-3 gap-4">
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
                          {team.teamName}
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
              </div>

              {/* Auto-fill All Button */}
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAutoFillAll}
                  disabled={isAutoFilling || !formData.teamId || !formData.reportMonth}
                  className="w-full max-w-md"
                >
                  {isAutoFilling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating content with AI...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Auto-fill All Fields with AI
                    </>
                  )}
                </Button>
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
                      <Sparkles className="h-3 w-3 mr-1" />
                      Quick fill
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-stagger">
        <div className="stat-card-enhanced stat-card-cyan">
          <div className="icon-box">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Reports</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
        </div>
        <div className="stat-card-enhanced stat-card-teal">
          <div className="icon-box">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">This Month</p>
            <p className="text-2xl font-bold">{stats.thisMonth}</p>
          </div>
        </div>
        <div className="stat-card-enhanced stat-card-green">
          <div className="icon-box">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Finalized</p>
            <p className="text-2xl font-bold text-green-400">{stats.finalized}</p>
          </div>
        </div>
        <div className="stat-card-enhanced stat-card-amber">
          <div className="icon-box">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Exported</p>
            <p className="text-2xl font-bold">{stats.exported}</p>
          </div>
        </div>
      </div>

      <div className="unified-card">
        <div className="unified-card-header">
          <div className="flex items-center justify-between">
            <div className="section-header" style={{ paddingLeft: 0 }}>
              <h3 className="section-title">All Reports</h3>
              <p className="section-subtitle">
                {filteredReports.length} of {reports?.length || 0} reports
                {hasActiveFilters && " (filtered)"}
              </p>
            </div>
          </div>
        </div>
        <div className="unified-card-body space-y-4">
          {/* Filters */}
          <div className="filter-bar">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by team or FM name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={filterYear ? String(filterYear) : "all"} onValueChange={(v) => setFilterYear(v === "all" ? null : Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="All years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {[2024, 2025, 2026].map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="generated">Generated</SelectItem>
                <SelectItem value="finalized">Finalized</SelectItem>
              </SelectContent>
            </Select>
            
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {filteredReports.length > 0 ? (
            <div className="table-enhanced">
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
                  {filteredReports.map((item) => (
                    <TableRow key={item.report.id} className="table-row-enhanced">
                      <TableCell className="font-medium">{item.team?.teamName || "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {MONTHS[item.report.reportMonth - 1]} {item.report.reportYear}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.team?.floorManagerName || "-"}</TableCell>
                      <TableCell>{getStatusBadge(item.report.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(item.report.createdAt), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {/* View Report */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setViewingReport(item)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          
                          {/* Download/Export Excel */}
                          {item.report.excelFileUrl ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => window.open(item.report.excelFileUrl!, "_blank")}
                                title="Download Excel"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleExport(item.report.id)}
                                disabled={isExporting === item.report.id}
                                title="Regenerate Excel"
                              >
                                {isExporting === item.report.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleExport(item.report.id)}
                              disabled={isExporting === item.report.id}
                              title="Export to Excel"
                            >
                              {isExporting === item.report.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileSpreadsheet className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          
                          {/* Export to Google Sheets */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600 hover:text-green-700"
                            onClick={() => handleExportGoogleSheets(item.report.id)}
                            disabled={isExportingGoogleSheets === item.report.id}
                            title="Export to Google Sheets"
                          >
                            {isExportingGoogleSheets === item.report.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Cloud className="h-4 w-4" />
                            )}
                          </Button>
                          
                          {/* Delete */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                disabled={deletingReportId === item.report.id}
                              >
                                {deletingReportId === item.report.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Report</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the report for {item.team?.teamName} - {MONTHS[item.report.reportMonth - 1]} {item.report.reportYear}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteReport(item.report.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FileSpreadsheet className="h-8 w-8" />
              </div>
              <h3 className="empty-state-title">
                {hasActiveFilters ? "No matching reports" : "No reports yet"}
              </h3>
              <p className="empty-state-description">
                {hasActiveFilters 
                  ? "Try adjusting your filters"
                  : "Generate your first Team Monthly Overview report"}
              </p>
              {hasActiveFilters ? (
                <Button variant="outline" onClick={clearFilters} className="mt-4">
                  Clear Filters
                </Button>
              ) : (
                <Button onClick={() => setShowNewReport(true)} className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Report
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* View Report Dialog */}
      <Dialog open={!!viewingReport} onOpenChange={(open) => !open && setViewingReport(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewingReport?.team?.teamName} - {viewingReport && MONTHS[viewingReport.report.reportMonth - 1]} {viewingReport?.report.reportYear}
            </DialogTitle>
            <DialogDescription>
              Created on {viewingReport && format(new Date(viewingReport.report.createdAt), "dd MMMM yyyy")}
            </DialogDescription>
          </DialogHeader>
          
          {viewingReport && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-2">
                {getStatusBadge(viewingReport.report.status)}
                {viewingReport.report.excelFileUrl && (
                  <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                    <Download className="h-3 w-3 mr-1" />
                    Exported
                  </Badge>
                )}
              </div>
              
              {viewingReport.report.fmPerformance && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">FM Performance</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(viewingReport.report.fmPerformance, "FM Performance")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                    {viewingReport.report.fmPerformance}
                  </div>
                </div>
              )}
              
              {viewingReport.report.goalsThisMonth && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Goals This Month</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(viewingReport.report.goalsThisMonth, "Goals")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                    {viewingReport.report.goalsThisMonth}
                  </div>
                </div>
              )}
              
              {viewingReport.report.teamOverview && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Team Overview</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(viewingReport.report.teamOverview, "Team Overview")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                    {viewingReport.report.teamOverview}
                  </div>
                </div>
              )}
              
              {viewingReport.report.additionalComments && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Additional Notes</label>
                  <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                    {viewingReport.report.additionalComments}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end gap-2 pt-4 border-t">
                {viewingReport.report.excelFileUrl ? (
                  <Button onClick={() => window.open(viewingReport.report.excelFileUrl!, "_blank")}>
                    <Download className="h-4 w-4 mr-2" />
                    Download Excel
                  </Button>
                ) : (
                  <Button onClick={() => handleExport(viewingReport.report.id)} disabled={isExporting === viewingReport.report.id}>
                    {isExporting === viewingReport.report.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                    )}
                    Export to Excel
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  className="text-green-400 border-green-500/30 hover:bg-green-500/20"
                  onClick={() => handleExportGoogleSheets(viewingReport.report.id)} 
                  disabled={isExportingGoogleSheets === viewingReport.report.id}
                >
                  {isExportingGoogleSheets === viewingReport.report.id ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Cloud className="h-4 w-4 mr-2" />
                  )}
                  Google Sheets
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
