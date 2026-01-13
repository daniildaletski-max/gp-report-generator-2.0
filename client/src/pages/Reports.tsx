import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FileSpreadsheet, Download, Plus, Loader2, Eye } from "lucide-react";
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
    teamName: "",
    floorManagerName: "",
    reportMonth: "",
    reportYear: new Date().getFullYear(),
    fmPerformance: "",
    goalsThisMonth: "",
    teamOverview: "",
    additionalComments: "",
  });

  const { data: reports, isLoading, refetch } = trpc.report.list.useQuery();
  const generateMutation = trpc.report.generate.useMutation();
  const exportMutation = trpc.report.exportToExcel.useMutation();

  const handleGenerate = async () => {
    if (!formData.teamName || !formData.reportMonth) {
      toast.error("Please fill in required fields");
      return;
    }

    setIsGenerating(true);
    try {
      await generateMutation.mutateAsync(formData);
      toast.success("Report generated successfully");
      setShowNewReport(false);
      setFormData({
        teamName: "",
        floorManagerName: "",
        reportMonth: "",
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
          <p className="text-muted-foreground">
            Generate and manage Team Monthly Overview reports
          </p>
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
              <DialogTitle>Generate New Report</DialogTitle>
              <DialogDescription>
                Create a new Team Monthly Overview report with aggregated evaluation data
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="teamName">Team Name *</Label>
                  <Input
                    id="teamName"
                    placeholder="e.g., Team Omnicron"
                    value={formData.teamName}
                    onChange={(e) =>
                      setFormData({ ...formData, teamName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="floorManagerName">Floor Manager</Label>
                  <Input
                    id="floorManagerName"
                    placeholder="e.g., Andri Saaret"
                    value={formData.floorManagerName}
                    onChange={(e) =>
                      setFormData({ ...formData, floorManagerName: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reportMonth">Report Month *</Label>
                  <Select
                    value={formData.reportMonth}
                    onValueChange={(value) =>
                      setFormData({ ...formData, reportMonth: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem key={month} value={month}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reportYear">Report Year *</Label>
                  <Input
                    id="reportYear"
                    type="number"
                    value={formData.reportYear}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        reportYear: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fmPerformance">FM Performance (Self Evaluation)</Label>
                <Textarea
                  id="fmPerformance"
                  placeholder="Evaluate your performance as a Floor Manager..."
                  rows={4}
                  value={formData.fmPerformance}
                  onChange={(e) =>
                    setFormData({ ...formData, fmPerformance: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goalsThisMonth">Goals This Month</Label>
                <Textarea
                  id="goalsThisMonth"
                  placeholder="What were your goals for this month?"
                  rows={3}
                  value={formData.goalsThisMonth}
                  onChange={(e) =>
                    setFormData({ ...formData, goalsThisMonth: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teamOverview">Team Overview</Label>
                <Textarea
                  id="teamOverview"
                  placeholder="General overview of your team's performance..."
                  rows={3}
                  value={formData.teamOverview}
                  onChange={(e) =>
                    setFormData({ ...formData, teamOverview: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="additionalComments">Additional Comments</Label>
                <Textarea
                  id="additionalComments"
                  placeholder="Any additional comments..."
                  rows={2}
                  value={formData.additionalComments}
                  onChange={(e) =>
                    setFormData({ ...formData, additionalComments: e.target.value })
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowNewReport(false)}
                >
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
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.teamName}</TableCell>
                    <TableCell>
                      {report.reportMonth} {report.reportYear}
                    </TableCell>
                    <TableCell>{report.floorManagerName || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          report.status === "finalized"
                            ? "default"
                            : report.status === "generated"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(report.createdAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {report.excelFileUrl ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(report.excelFileUrl!, "_blank")}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport(report.id)}
                            disabled={isExporting === report.id}
                          >
                            {isExporting === report.id ? (
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
