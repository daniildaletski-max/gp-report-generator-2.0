import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useUrlState, urlString, urlNumber } from "@/hooks/useUrlState";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ActiveFiltersBar } from "@/components/ActiveFiltersBar";
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
import { FileSpreadsheet, Download, Plus, Loader2, Sparkles, RefreshCw, Wand2, Trash2, Eye, Calendar, Users, TrendingUp, Search, Filter, X, Copy, CheckCircle, ExternalLink, Sheet } from "lucide-react";
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
  const [generationStep, setGenerationStep] = useState(0); // 0=idle, 1=generating, 2=building excel, 3=sending email, 4=done
  const [isExporting, setIsExporting] = useState<number | null>(null);
  const [showNewReport, setShowNewReport] = useState(false);
  const [viewingReport, setViewingReport] = useState<any>(null);
  
  // Filters — persisted to URL so refreshing and sharing keep them.
  const [searchQuery, setSearchQuery] = useUrlState("q", "", urlString.parse, urlString.serialize);
  const [filterYear, setFilterYear] = useUrlState<number | null>(
    "year",
    null,
    raw => urlNumber.parse(raw),
    urlNumber.serialize,
  );
  const [filterStatus, setFilterStatus] = useUrlState(
    "status",
    "all",
    urlString.parse,
    v => (v === "all" ? null : v),
  );
  const [filterTeam, setFilterTeam] = useUrlState(
    "team",
    "all",
    urlString.parse,
    v => (v === "all" ? null : v),
  );

  // Search input ref so `/` can focus it from anywhere on the page.
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      // Don't intercept when the user is already typing in a field.
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  
  const [formData, setFormData] = useState(() => ({
    teamId: 0,
    reportMonth: 0,
    reportYear: new Date().getFullYear(),
    fmPerformance: "",
    goalsThisMonth: "",
    teamOverview: "",
    additionalComments: "",
  }));

  const utils = trpc.useUtils();
  const { data: reports, isLoading, refetch } = trpc.report.list.useQuery();
  const { data: teams } = trpc.fmTeam.list.useQuery();
  const generateMutation = trpc.report.generate.useMutation();
  const exportMutation = trpc.report.exportToExcel.useMutation();
  // Bulk-generate for every team the user can see — one click ships
  // every monthly report + email instead of looping per team manually.
  const generateAllMutation = trpc.report.generateAllForMonth.useMutation({
    onSuccess: (data) => {
      const failedNames = data.results.filter(r => r.status === "failed").map(r => r.teamName);
      if (data.totals.failed === 0) {
        toast.success(`All ${data.totals.succeeded} reports generated · ${data.totals.emailsSent} email${data.totals.emailsSent === 1 ? '' : 's'} sent`);
      } else {
        toast.warning(`${data.totals.succeeded} succeeded, ${data.totals.failed} failed`, {
          description: failedNames.length > 0 ? `Failed: ${failedNames.join(', ')}` : undefined,
          duration: 12000,
        });
      }
      utils.report.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Bulk generate failed: ${err.message}`);
    },
  });
  const googleSheetsExportMutation = trpc.report.exportToGoogleSheets.useMutation();
  const { data: googleSheetsStatus } = trpc.report.googleSheetsAvailable.useQuery();
  const [isExportingSheets, setIsExportingSheets] = useState<number | null>(null);
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
      if (filterTeam && filterTeam !== "all" && item.report.teamId !== Number(filterTeam)) return false;
      if (filterYear && item.report.reportYear !== filterYear) return false;
      if (filterStatus && filterStatus !== "all" && item.report.status !== filterStatus) return false;
      return true;
    });
  }, [reports, searchQuery, filterYear, filterStatus, filterTeam]);

  const hasActiveFilters = searchQuery || filterYear || (filterStatus && filterStatus !== "all") || (filterTeam && filterTeam !== "all");

  const clearFilters = () => {
    setSearchQuery("");
    setFilterYear(null);
    setFilterStatus("all");
    setFilterTeam("all");
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
    overview += `• Average Team Score: ${avgTotal.toFixed(1)}/22\n\n`;
    
    overview += `Top Performers:\n`;
    topPerformers.forEach((gp, i) => {
      overview += `${i + 1}. ${gp.gpName} - ${gp.avgTotal}/22\n`;
    });
    
    if (needsImprovement.length > 0) {
      overview += `\nNeeds Improvement:\n`;
      needsImprovement.forEach(gp => {
        overview += `• ${gp.gpName} (${gp.avgTotal}/22)\n`;
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
    setGenerationStep(1);
    try {
      const result = await generateMutation.mutateAsync({
        ...formData,
        autoFill: true, // Always auto-fill empty fields with AI-generated content
      });
      setGenerationStep(2);

      // Automatically export to Excel and send email with attachment
      let emailSent = false;
      let emailAddress: string | null = null;
      let excelUrl: string | null = null;
      try {
        setGenerationStep(2);
        const exportResult = await exportMutation.mutateAsync({ reportId: result.id });
        emailSent = exportResult.emailSent;
        emailAddress = exportResult.emailAddress;
        excelUrl = exportResult.excelUrl;
        setGenerationStep(3);
      } catch (exportError: any) {
        console.warn("Auto-export failed:", exportError);
        // Report was still created successfully, just export failed
      }
      setGenerationStep(4);

      if (emailSent && emailAddress) {
        toast.success(
          <div className="flex flex-col gap-1">
            <span>Report generated & exported successfully</span>
            <span className="text-xs text-green-200">📧 Excel report sent to {emailAddress}</span>
          </div>,
          { duration: 6000 }
        );
      } else if (excelUrl) {
        toast.success("Report generated & Excel exported successfully");
      } else {
        toast.success("Report generated successfully");
      }

      // Auto-open the Excel file if available
      if (excelUrl) {
        window.open(excelUrl, "_blank");
      }

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
      setTimeout(() => setGenerationStep(0), 1500);
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


  const handleGoogleSheetsExport = async (reportId: number) => {
    setIsExportingSheets(reportId);
    try {
      const result = await googleSheetsExportMutation.mutateAsync({ reportId });
      toast.success(
        <div className="flex flex-col gap-1">
          <span>Google Sheet created successfully</span>
          <a href={result.spreadsheetUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-300 underline">Open in Google Sheets</a>
        </div>,
        { duration: 8000 }
      );
      window.open(result.spreadsheetUrl, "_blank");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to export to Google Sheets");
    } finally {
      setIsExportingSheets(null);
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
            <div key={i} className="stat-card-enhanced stat-card-violet p-5">
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
      <PageHeader
        title="Reports"
        subtitle="Generate and manage Team Monthly Overview reports"
        icon={FileSpreadsheet}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                const now = new Date();
                if (!confirm(`Generate Team Monthly Overview reports for ALL teams for ${now.toLocaleString('en-US', { month: 'long', year: 'numeric' })}?\n\nEach team's report will be created and emailed to its FM.`)) return;
                generateAllMutation.mutate({
                  reportMonth: now.getMonth() + 1,
                  reportYear: now.getFullYear(),
                });
              }}
              disabled={generateAllMutation.isPending}
              title="Generate + email reports for every team in one click"
            >
              {generateAllMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating all…</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> Generate ALL teams</>
              )}
            </Button>
            <Button onClick={() => setShowNewReport(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Report
            </Button>
          </div>
        }
      />
      <Dialog open={showNewReport} onOpenChange={setShowNewReport}>
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
                      {Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
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

              {/* Generation Progress Indicator */}
              {isGenerating && generationStep > 0 && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing Report...
                  </div>
                  <div className="space-y-2">
                    {[
                      { step: 1, label: 'Generating report with AI analysis' },
                      { step: 2, label: 'Building Excel workbook with charts' },
                      { step: 3, label: 'Sending email to floor manager' },
                    ].map(({ step, label }) => (
                      <div key={step} className="flex items-center gap-2.5 text-sm">
                        {generationStep > step ? (
                          <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                        ) : generationStep === step ? (
                          <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-border shrink-0" />
                        )}
                        <span className={generationStep >= step ? 'text-foreground' : 'text-muted-foreground'}>
                          {label}
                        </span>
                      </div>
                    ))}
                    {generationStep >= 4 && (
                      <div className="flex items-center gap-2.5 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                        <span className="text-green-400 font-medium">Complete!</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNewReport(false)} disabled={isGenerating}>
                  Cancel
                </Button>
                <Button onClick={handleGenerate} disabled={isGenerating || !formData.teamId || !formData.reportMonth} className="bg-gradient-to-r from-primary to-primary/80 text-white hover:from-primary/90 hover:to-primary">
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {generationStep === 1 ? 'Generating...' : generationStep === 2 ? 'Building Excel...' : generationStep === 3 ? 'Sending Email...' : 'Finishing...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate, Export & Email
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-stagger">
        <div className="stat-card-enhanced stat-card-violet">
          <div className="icon-box">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Reports</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
        </div>
        <div className="stat-card-enhanced stat-card-indigo">
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
        <div className="stat-card-enhanced stat-card-violet">
          <div className="icon-box">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Exported</p>
            <p className="text-2xl font-bold">{stats.exported}</p>
          </div>
        </div>
      </div>

      {/* Coverage Matrix — at-a-glance month × team grid showing report
          status. Replaces the need to scroll the long All Reports table
          to answer "did Team X get a March report yet?". Click any cell
          to view (filled) or generate (empty) that team's report for
          that month. */}
      <CoverageMatrix
        reports={reports}
        teams={teams}
        onOpenReport={(report) => setViewingReport(report)}
        onCreateForCell={(teamId, month, year) => {
          setFormData(prev => ({ ...prev, teamId, reportMonth: month, reportYear: year }));
          setShowNewReport(true);
        }}
      />

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
                ref={searchInputRef}
                placeholder="Search by team or FM name… (press / to focus)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams?.map((team) => (
                  <SelectItem key={team.id} value={String(team.id)}>{team.teamName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
              <Select value={filterYear ? String(filterYear) : "all"} onValueChange={(v) => setFilterYear(v === "all" ? null : Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="All years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
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

          {/* Active filter pills — show what's currently being filtered */}
          {hasActiveFilters && (
            <ActiveFiltersBar
              pills={[
                ...(searchQuery ? [{ key: "q", label: `"${searchQuery}"`, onRemove: () => setSearchQuery("") }] : []),
                ...(filterYear ? [{ key: "year", label: `Year: ${filterYear}`, onRemove: () => setFilterYear(null) }] : []),
                ...(filterStatus && filterStatus !== "all" ? [{ key: "status", label: `Status: ${filterStatus}`, onRemove: () => setFilterStatus("all") }] : []),
                ...(filterTeam && filterTeam !== "all"
                  ? [{
                      key: "team",
                      label: `Team: ${teams?.find(t => t.id === Number(filterTeam))?.teamName ?? filterTeam}`,
                      onRemove: () => setFilterTeam("all"),
                    }]
                  : []),
              ]}
              onClearAll={clearFilters}
            />
          )}

          {filteredReports.length > 0 ? (
            <>
            {/* Mobile card grid (< md) */}
            <div className="md:hidden space-y-2">
              {filteredReports.map((item) => (
                <div key={item.report.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{item.team?.teamName || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.team?.floorManagerName || "—"}</p>
                    </div>
                    {getStatusBadge(item.report.status)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Badge variant="outline" className="text-[10px] py-0 h-5 px-1.5">
                      {MONTHS[item.report.reportMonth - 1]} {item.report.reportYear}
                    </Badge>
                    <span>·</span>
                    <span>{format(new Date(item.report.createdAt), "dd MMM yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap pt-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setViewingReport(item)}
                    >
                      <Eye className="h-3 w-3 mr-1" /> View
                    </Button>
                    {item.report.excelFileUrl ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => window.open(item.report.excelFileUrl!, "_blank")}
                      >
                        <Download className="h-3 w-3 mr-1" /> Excel
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleExport(item.report.id)}
                        disabled={isExporting === item.report.id}
                      >
                        {isExporting === item.report.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="h-3 w-3 mr-1" />
                        )}
                        Export
                      </Button>
                    )}
                    {item.report.googleSheetsUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-green-600"
                        onClick={() => window.open(item.report.googleSheetsUrl!, "_blank")}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" /> Sheet
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="table-enhanced hidden md:block">
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
                          
                          {/* Google Sheets Export */}
                          {googleSheetsStatus?.available && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-400 hover:text-green-300"
                              onClick={() => handleGoogleSheetsExport(item.report.id)}
                              disabled={isExportingSheets === item.report.id}
                              title={item.report.googleSheetsUrl ? "Regenerate Google Sheet" : "Export to Google Sheets"}
                            >
                              {isExportingSheets === item.report.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sheet className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          
                          {/* Open existing Google Sheet */}
                          {item.report.googleSheetsUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-400 hover:text-green-300"
                              onClick={() => window.open(item.report.googleSheetsUrl!, "_blank")}
                              title="Open Google Sheet"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}

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
            </>
          ) : (
            <EmptyState
              icon={FileSpreadsheet}
              title={hasActiveFilters ? "No matching reports" : "No reports yet"}
              description={
                hasActiveFilters
                  ? "Try adjusting your filters or clearing them to see all reports."
                  : "Generate your first Team Monthly Overview report to get started."
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => setShowNewReport(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create report
                  </Button>
                )
              }
            />
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

                {/* Google Sheets */}
                {googleSheetsStatus?.available && (
                  viewingReport.report.googleSheetsUrl ? (
                    <Button variant="outline" className="border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => window.open(viewingReport.report.googleSheetsUrl!, "_blank")}>
                      <Sheet className="h-4 w-4 mr-2" />
                      Open Google Sheet
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                      onClick={() => handleGoogleSheetsExport(viewingReport.report.id)}
                      disabled={isExportingSheets === viewingReport.report.id}
                    >
                      {isExportingSheets === viewingReport.report.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sheet className="h-4 w-4 mr-2" />
                      )}
                      Export to Google Sheets
                    </Button>
                  )
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// Coverage Matrix — month × team grid that gives the FM an at-a-glance
// answer to "which teams still need a report this month?". Replaces the
// scrolling-the-list-and-counting workflow that used to be the only way
// to see coverage.
// ============================================

type ReportListItem = {
  report: { id: number; teamId: number | null; reportMonth: number; reportYear: number; status?: string | null; excelFileUrl?: string | null };
  team: { id: number; teamName: string; floorManagerName?: string | null } | null;
};

function CoverageMatrix({
  reports,
  teams,
  onOpenReport,
  onCreateForCell,
}: {
  reports?: ReportListItem[];
  teams?: { id: number; teamName: string; floorManagerName: string }[];
  onOpenReport: (report: ReportListItem) => void;
  onCreateForCell: (teamId: number, month: number, year: number) => void;
}) {
  // 6-month window: 5 prior months + current, oldest-left to newest-right
  const months = useMemo(() => {
    const now = new Date();
    const out: { month: number; year: number; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      });
    }
    return out;
  }, []);

  // Index: `${teamId}-${year}-${month}` → report.
  // Keep the FIRST report seen for any (team, year, month) tuple. The
  // list comes back from the server ordered newest-first, so the first
  // iteration is the newest report — and we want the matrix to reflect
  // the newest state (status/color and click-through target should point
  // at the most recent regeneration, not stale older copies).
  const reportIndex = useMemo(() => {
    const idx = new Map<string, ReportListItem>();
    for (const r of reports ?? []) {
      if (r.report.teamId == null) continue;
      const key = `${r.report.teamId}-${r.report.reportYear}-${r.report.reportMonth}`;
      if (!idx.has(key)) idx.set(key, r);
    }
    return idx;
  }, [reports]);

  const sortedTeams = useMemo(
    () => (teams ? [...teams].sort((a, b) => a.teamName.localeCompare(b.teamName)) : []),
    [teams],
  );

  // Coverage stats for the current month — tells the FM at the top of
  // the page how many teams still need a report THIS month.
  const currentMonth = months[months.length - 1];
  const currentMonthCount = sortedTeams.reduce((n, t) => {
    return reportIndex.has(`${t.id}-${currentMonth.year}-${currentMonth.month}`) ? n + 1 : n;
  }, 0);
  const totalTeams = sortedTeams.length;
  const missingCount = totalTeams - currentMonthCount;

  if (sortedTeams.length === 0) {
    return null;
  }

  return (
    <Card className="border border-amber-200/50 shadow-sm overflow-hidden">
      {/* Gold shimmer accent at top */}
      <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
      <CardHeader className="pb-3 bg-gradient-to-br from-white to-amber-50/30">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-100 border border-amber-200">
                <Calendar className="h-3.5 w-3.5 text-amber-700" />
              </div>
              Coverage matrix
            </CardTitle>
            <CardDescription className="mt-1">
              {missingCount === 0 ? (
                <span className="text-emerald-600 font-medium">✓ All {totalTeams} teams covered for {MONTHS[currentMonth.month - 1]}</span>
              ) : (
                <span>
                  <span className="font-semibold text-slate-700">{currentMonthCount}/{totalTeams}</span> teams covered for {MONTHS[currentMonth.month - 1]}
                  {" — "}<span className="text-amber-600 font-medium">{missingCount} missing</span>
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />Finalized
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />Draft
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-500">
              <span className="h-2 w-2 rounded-full border border-slate-300 bg-slate-100 shrink-0" />Missing
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <div className="inline-grid min-w-full" style={{ gridTemplateColumns: `minmax(160px, 1.5fr) repeat(${months.length}, minmax(72px, 1fr))` }}>
          {/* Header row */}
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 py-2.5 px-3 sticky left-0 bg-amber-50/60 border-b border-amber-200/50">
            Team
          </div>
          {months.map((m, i) => (
            <div
              key={`h-${i}`}
              className={`text-[11px] font-semibold uppercase tracking-wider text-center py-2.5 border-b ${
                i === months.length - 1
                  ? "text-amber-700 bg-amber-50/60 border-amber-200/50"
                  : "text-slate-400 bg-slate-50/40 border-slate-200/50"
              }`}
            >
              {m.label}
            </div>
          ))}

          {/* Data rows */}
          {sortedTeams.map((team) => (
            <CoverageRow
              key={team.id}
              team={team}
              months={months}
              reportIndex={reportIndex}
              onOpenReport={onOpenReport}
              onCreateForCell={onCreateForCell}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CoverageRow({
  team,
  months,
  reportIndex,
  onOpenReport,
  onCreateForCell,
}: {
  team: { id: number; teamName: string; floorManagerName: string };
  months: { month: number; year: number; label: string }[];
  reportIndex: Map<string, ReportListItem>;
  onOpenReport: (report: ReportListItem) => void;
  onCreateForCell: (teamId: number, month: number, year: number) => void;
}) {
  return (
    <>
      <div className="py-2.5 px-3 sticky left-0 bg-white border-b border-slate-100 min-w-0 hover:bg-amber-50/30 transition-colors">
        <p className="text-sm font-semibold text-slate-800 truncate">{team.teamName}</p>
        {team.floorManagerName && (
          <p className="text-[11px] text-slate-400 truncate">{team.floorManagerName}</p>
        )}
      </div>
      {months.map((m, i) => {
        const key = `${team.id}-${m.year}-${m.month}`;
        const r = reportIndex.get(key);
        const status = r?.report.status;
        const isFinalized = status === "finalized";
        const isDraft = !!r && !isFinalized;
        const isCurrentMonth = i === months.length - 1;
        const tooltip = r
          ? `${MONTHS[m.month - 1]} ${m.year} — ${isFinalized ? "Finalized" : "Draft"} (click to open)`
          : `${MONTHS[m.month - 1]} ${m.year} — no report yet (click to generate)`;
        return (
          <button
            key={`${key}-cell`}
            type="button"
            title={tooltip}
            onClick={() => (r ? onOpenReport(r) : onCreateForCell(team.id, m.month, m.year))}
            className={`relative h-12 border-b flex items-center justify-center transition-all duration-200 group ${
              isFinalized
                ? "bg-emerald-50/80 hover:bg-emerald-100 border-emerald-100/60"
                : isDraft
                  ? "bg-amber-50/80 hover:bg-amber-100 border-amber-100/60"
                  : isCurrentMonth
                    ? "bg-amber-50/30 hover:bg-amber-50 border-amber-100/40"
                    : "bg-white hover:bg-slate-50 border-slate-100/60"
            }`}
          >
            {isFinalized && (
              <div className="flex flex-col items-center gap-0.5">
                <CheckCircle className="h-4 w-4 text-emerald-600 group-hover:scale-110 transition-transform" />
              </div>
            )}
            {isDraft && (
              <div className="flex flex-col items-center gap-0.5">
                <FileSpreadsheet className="h-4 w-4 text-amber-600 group-hover:scale-110 transition-transform" />
              </div>
            )}
            {!r && (
              <Plus className={`h-3.5 w-3.5 transition-all duration-200 ${
                isCurrentMonth ? "text-amber-400/70 group-hover:text-amber-600" : "text-slate-300 group-hover:text-slate-500"
              }`} />
            )}
          </button>
        );
      })}
    </>
  );
}
