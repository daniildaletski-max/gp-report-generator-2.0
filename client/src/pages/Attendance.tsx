import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { GPDetailDrawer } from "@/components/GPDetailDrawer";
import { PageHeader } from "@/components/PageHeader";
import {
  CalendarCheck, Save, Loader2, Users, AlertTriangle,
  Clock, TrendingUp, TrendingDown, Minus, RotateCcw,
  ChevronDown, ChevronUp, Briefcase, Timer, CalendarX,
  Stethoscope, MessageSquare, BarChart3, Info, LineChart as LineChartIcon
} from "lucide-react";
import { MONTH_NAMES } from "@shared/const";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, BarChart, Bar,
} from "recharts";

interface AttendanceRow {
  gpId: number;
  gpName: string;
  mistakes: number;
  extraShifts: number;
  lateToWork: number;
  missedDays: number;
  sickLeaves: number;
  remarks: string;
  isDirty: boolean;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedRemarks, setExpandedRemarks] = useState<Set<number>>(new Set());
  const [drawerGpId, setDrawerGpId] = useState<number | null>(null);

  // When the user has unsaved edits and tries to switch team/month/year,
  // queue the pending change and confirm first instead of silently
  // overwriting their work via the data-refetch useEffect below.
  const [pendingFilterChange, setPendingFilterChange] = useState<
    | { kind: "team"; value: string }
    | { kind: "month"; value: number }
    | { kind: "year"; value: number }
    | null
  >(null);

  // Fetch teams
  const { data: teams, isLoading: teamsLoading } = trpc.fmTeam.list.useQuery();

  // Auto-select first team
  useEffect(() => {
    if (teams && teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(String(teams[0].id));
    }
  }, [teams, selectedTeamId]);

  const teamId = selectedTeamId ? Number(selectedTeamId) : undefined;

  // Fetch attendance data
  const { data: attendanceData, isLoading: attendanceLoading, refetch } = trpc.attendance.teamSummary.useQuery(
    { teamId: teamId!, month: selectedMonth, year: selectedYear },
    { enabled: !!teamId }
  );

  // Bulk update mutation
  const bulkUpdateMutation = trpc.attendance.bulkUpdate.useMutation({
    onSuccess: (result) => {
      toast.success(`Attendance saved for ${result.updated} GPs`);
      refetch();
      setRows(prev => prev.map(r => ({ ...r, isDirty: false })));
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  // Avoid wiping user edits when the query just refetches in the background.
  // Only repopulate rows when the underlying scope (team/month/year) changes
  // or when we currently have nothing showing.
  const lastLoadedScopeRef = useRef<string>("");
  useEffect(() => {
    if (!attendanceData?.items) return;
    const scope = `${teamId ?? "_"}:${selectedMonth}:${selectedYear}`;
    const isFirstLoadForScope = lastLoadedScopeRef.current !== scope;
    if (!isFirstLoadForScope && rows.some(r => r.isDirty)) return;
    lastLoadedScopeRef.current = scope;
    setRows(attendanceData.items.map(item => ({
      gpId: item.gamePresenter.id,
      gpName: item.gamePresenter.name,
      mistakes: item.monthlyStats?.mistakes ?? item.attendance?.mistakes ?? 0,
      extraShifts: item.attendance?.extraShifts ?? 0,
      lateToWork: item.attendance?.lateToWork ?? 0,
      missedDays: item.attendance?.missedDays ?? 0,
      sickLeaves: item.attendance?.sickLeaves ?? 0,
      remarks: item.attendance?.remarks ?? "",
      isDirty: false,
    })));
  // rows is intentionally omitted — we only consider its dirty state via a
  // ref-equivalent at read time. Including it would re-enter on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceData, teamId, selectedMonth, selectedYear]);

  // Update a single field
  const updateField = useCallback((gpId: number, field: keyof AttendanceRow, value: number | string) => {
    setRows(prev => prev.map(r =>
      r.gpId === gpId ? { ...r, [field]: value, isDirty: true } : r
    ));
  }, []);

  // Toggle remarks expansion
  const toggleRemarks = useCallback((gpId: number) => {
    setExpandedRemarks(prev => {
      const next = new Set(prev);
      if (next.has(gpId)) next.delete(gpId);
      else next.add(gpId);
      return next;
    });
  }, []);

  // Save all dirty rows
  const handleSave = useCallback(async () => {
    if (!teamId) return;
    const dirtyRows = rows.filter(r => r.isDirty);
    if (dirtyRows.length === 0) {
      toast.info("No changes to save");
      return;
    }
    setIsSaving(true);
    try {
      await bulkUpdateMutation.mutateAsync({
        teamId,
        month: selectedMonth,
        year: selectedYear,
        updates: dirtyRows.map(r => ({
          gpId: r.gpId,
          extraShifts: r.extraShifts,
          lateToWork: r.lateToWork,
          missedDays: r.missedDays,
          sickLeaves: r.sickLeaves,
          remarks: r.remarks || undefined,
        })),
      });
    } finally {
      setIsSaving(false);
    }
  }, [teamId, rows, selectedMonth, selectedYear, bulkUpdateMutation]);

  // Reset changes
  const handleReset = useCallback(() => {
    if (attendanceData?.items) {
      setRows(attendanceData.items.map(item => ({
        gpId: item.gamePresenter.id,
        gpName: item.gamePresenter.name,
        mistakes: item.monthlyStats?.mistakes ?? item.attendance?.mistakes ?? 0,
        extraShifts: item.attendance?.extraShifts ?? 0,
        lateToWork: item.attendance?.lateToWork ?? 0,
        missedDays: item.attendance?.missedDays ?? 0,
        sickLeaves: item.attendance?.sickLeaves ?? 0,
        remarks: item.attendance?.remarks ?? "",
        isDirty: false,
      })));
      toast.info("Changes reset");
    }
  }, [attendanceData]);

  // Computed totals
  const totals = useMemo(() => {
    return rows.reduce((acc, r) => ({
      mistakes: acc.mistakes + r.mistakes,
      extraShifts: acc.extraShifts + r.extraShifts,
      lateToWork: acc.lateToWork + r.lateToWork,
      missedDays: acc.missedDays + r.missedDays,
      sickLeaves: acc.sickLeaves + r.sickLeaves,
    }), { mistakes: 0, extraShifts: 0, lateToWork: 0, missedDays: 0, sickLeaves: 0 });
  }, [rows]);

  const hasDirtyRows = rows.some(r => r.isDirty);
  const selectedTeam = teams?.find(t => t.id === teamId);

  // Block accidental tab close / refresh while there are unsaved edits.
  useUnsavedChangesGuard(hasDirtyRows);

  const applyFilterChange = useCallback((change: NonNullable<typeof pendingFilterChange>) => {
    if (change.kind === "team") setSelectedTeamId(change.value);
    else if (change.kind === "month") setSelectedMonth(change.value);
    else if (change.kind === "year") setSelectedYear(change.value);
  }, []);

  const requestFilterChange = useCallback(
    (next: NonNullable<typeof pendingFilterChange>) => {
      if (!hasDirtyRows) {
        applyFilterChange(next);
        return;
      }
      setPendingFilterChange(next);
    },
    [hasDirtyRows, applyFilterChange],
  );

  const confirmDiscardAndApply = useCallback(() => {
    if (pendingFilterChange) {
      applyFilterChange(pendingFilterChange);
      setPendingFilterChange(null);
    }
  }, [pendingFilterChange, applyFilterChange]);

  // Year options
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen animate-fade-in">
      <PageHeader
        title="Attendance"
        subtitle="Track extra shifts, late arrivals, missed days, and sick leaves for your team"
        icon={CalendarCheck}
        actions={hasDirtyRows ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="glass-button text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-white font-semibold shadow-lg shadow-primary/20"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save Changes ({rows.filter(r => r.isDirty).length})
            </Button>
          </>
        ) : null}
      />

      {/* Filters Row */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Team Selector */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Team</label>
            <Select value={selectedTeamId} onValueChange={v => requestFilterChange({ kind: "team", value: v })}>
              <SelectTrigger className="glass-input h-10">
                <SelectValue placeholder="Select team..." />
              </SelectTrigger>
              <SelectContent>
                {teams?.map(team => (
                  <SelectItem key={team.id} value={String(team.id)}>
                    {team.teamName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Month Selector */}
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Month</label>
            <Select value={String(selectedMonth)} onValueChange={v => requestFilterChange({ kind: "month", value: Number(v) })}>
              <SelectTrigger className="glass-input h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Year Selector */}
          <div className="w-[120px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Year</label>
            <Select value={String(selectedYear)} onValueChange={v => requestFilterChange({ kind: "year", value: Number(v) })}>
              <SelectTrigger className="glass-input h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <SummaryCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Total Mistakes"
            value={totals.mistakes}
            color="red"
          />
          <SummaryCard
            icon={<Briefcase className="h-4 w-4" />}
            label="Extra Shifts"
            value={totals.extraShifts}
            color="green"
          />
          <SummaryCard
            icon={<Timer className="h-4 w-4" />}
            label="Late to Work"
            value={totals.lateToWork}
            color="amber"
          />
          <SummaryCard
            icon={<CalendarX className="h-4 w-4" />}
            label="Missed Days"
            value={totals.missedDays}
            color="rose"
          />
          <SummaryCard
            icon={<Stethoscope className="h-4 w-4" />}
            label="Sick Leaves"
            value={totals.sickLeaves}
            color="blue"
          />
        </div>
      )}

      {/* Attendance Trend Charts */}
      {teamId && (
        <AttendanceTrendCharts teamId={teamId} />
      )}

      {/* Attendance Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-foreground">
              {selectedTeam?.teamName || "Team"} — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </h3>
            {rows.length > 0 && (
              <Badge variant="outline" className="ml-2 text-xs border-primary/20 text-primary">
                {rows.length} GPs
              </Badge>
            )}
          </div>
          {hasDirtyRows && (
            <Badge className="bg-primary/15 text-primary border border-primary/25 text-xs">
              {rows.filter(r => r.isDirty).length} unsaved changes
            </Badge>
          )}
        </div>

        {teamsLoading || attendanceLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !teamId ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Select a team to view attendance</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <CalendarCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No game presenters found in this team</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-primary/10">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky left-0 bg-card z-10 min-w-[160px]">
                    GP Name
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[90px]">
                    <div className="flex items-center justify-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-red-400" />
                      Mistakes
                    </div>
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[100px]">
                    <div className="flex items-center justify-center gap-1">
                      <Briefcase className="h-3 w-3 text-green-400" />
                      Extra Shifts
                    </div>
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[100px]">
                    <div className="flex items-center justify-center gap-1">
                      <Timer className="h-3 w-3 text-amber-400" />
                      Late to Work
                    </div>
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[100px]">
                    <div className="flex items-center justify-center gap-1">
                      <CalendarX className="h-3 w-3 text-rose-400" />
                      Missed Days
                    </div>
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[100px]">
                    <div className="flex items-center justify-center gap-1">
                      <Stethoscope className="h-3 w-3 text-blue-400" />
                      Sick Leaves
                    </div>
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[60px]">
                    <div className="flex items-center justify-center gap-1">
                      <MessageSquare className="h-3 w-3 text-primary" />
                      Remarks
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <AttendanceTableRow
                    key={row.gpId}
                    row={row}
                    index={idx}
                    isExpanded={expandedRemarks.has(row.gpId)}
                    onToggleRemarks={() => toggleRemarks(row.gpId)}
                    onUpdateField={updateField}
                    onOpenProfile={setDrawerGpId}
                  />
                ))}
                {/* Totals Row */}
                <tr className="border-t-2 border-primary/20 bg-primary/5">
                  <td className="py-3 px-4 font-bold text-primary sticky left-0 bg-primary/5 z-10">
                    TOTAL ({rows.length} GPs)
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={`font-bold text-lg ${totals.mistakes > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {totals.mistakes}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={`font-bold text-lg ${totals.extraShifts > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                      {totals.extraShifts}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={`font-bold text-lg ${totals.lateToWork > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {totals.lateToWork}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={`font-bold text-lg ${totals.missedDays > 0 ? 'text-rose-400' : 'text-muted-foreground'}`}>
                      {totals.missedDays}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={`font-bold text-lg ${totals.sickLeaves > 0 ? 'text-blue-400' : 'text-muted-foreground'}`}>
                      {totals.sickLeaves}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center text-muted-foreground">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky Save Bar (mobile) */}
      {hasDirtyRows && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-lg border-t border-primary/15 z-50 sm:hidden">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-white font-semibold shadow-lg"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save {rows.filter(r => r.isDirty).length} Changes
          </Button>
        </div>
      )}

      <AlertDialog
        open={pendingFilterChange !== null}
        onOpenChange={(open) => { if (!open) setPendingFilterChange(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard {rows.filter(r => r.isDirty).length} unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingFilterChange?.kind === "team"
                ? "Switching team will discard your current edits."
                : pendingFilterChange?.kind === "month"
                  ? "Switching month will discard your current edits."
                  : "Switching year will discard your current edits."}
              {" "}Save first to keep them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on this view</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscardAndApply}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard &amp; switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GPDetailDrawer
        gpId={drawerGpId}
        open={drawerGpId !== null}
        onOpenChange={(open) => { if (!open) setDrawerGpId(null); }}
      />
    </div>
  );
}

// ============================================
// Attendance Table Row Component
// ============================================
function AttendanceTableRow({
  row,
  index,
  isExpanded,
  onToggleRemarks,
  onUpdateField,
  onOpenProfile,
}: {
  row: AttendanceRow;
  index: number;
  isExpanded: boolean;
  onToggleRemarks: () => void;
  onUpdateField: (gpId: number, field: keyof AttendanceRow, value: number | string) => void;
  onOpenProfile: (gpId: number) => void;
}) {
  return (
    <>
      <tr
        className={`border-b border-border/50 transition-colors duration-200 ${
          row.isDirty
            ? 'bg-primary/5 border-l-2 border-l-primary/40'
            : index % 2 === 0
            ? 'bg-transparent'
            : 'bg-muted/30'
        } hover:bg-muted/50`}
      >
        {/* GP Name */}
        <td className={`py-2.5 px-4 sticky left-0 z-10 ${
          row.isDirty ? 'bg-primary/5' : index % 2 === 0 ? 'bg-card' : 'bg-card/95'
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/15 to-primary/10 flex items-center justify-center border border-primary/15 shrink-0">
              <span className="text-[10px] font-bold text-primary">
                {row.gpName.charAt(0)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenProfile(row.gpId)}
              className="font-medium text-sm text-foreground hover:text-primary hover:underline truncate max-w-[120px] text-left"
            >
              {row.gpName}
            </button>
            {row.isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-slow shrink-0" />
            )}
          </div>
        </td>

        {/* Mistakes (read-only) */}
        <td className="py-2.5 px-2 text-center">
          <div className="relative group">
            <span className={`inline-flex items-center justify-center w-10 h-8 rounded-lg text-sm font-semibold ${
              row.mistakes > 0
                ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                : 'bg-muted/50 text-muted-foreground border border-border/50'
            }`}>
              {row.mistakes}
            </span>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card border border-border rounded px-2 py-1 text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Auto-populated from error files
            </div>
          </div>
        </td>

        {/* Extra Shifts */}
        <td className="py-2.5 px-2 text-center">
          <NumberInput
            value={row.extraShifts}
            onChange={v => onUpdateField(row.gpId, 'extraShifts', v)}
            color="green"
          />
        </td>

        {/* Late to Work */}
        <td className="py-2.5 px-2 text-center">
          <NumberInput
            value={row.lateToWork}
            onChange={v => onUpdateField(row.gpId, 'lateToWork', v)}
            color="amber"
          />
        </td>

        {/* Missed Days */}
        <td className="py-2.5 px-2 text-center">
          <NumberInput
            value={row.missedDays}
            onChange={v => onUpdateField(row.gpId, 'missedDays', v)}
            color="rose"
          />
        </td>

        {/* Sick Leaves */}
        <td className="py-2.5 px-2 text-center">
          <NumberInput
            value={row.sickLeaves}
            onChange={v => onUpdateField(row.gpId, 'sickLeaves', v)}
            color="blue"
          />
        </td>

        {/* Remarks Toggle */}
        <td className="py-2.5 px-2 text-center">
          <button
            onClick={onToggleRemarks}
            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
              row.remarks
                ? 'bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25'
                : 'bg-muted/50 text-muted-foreground border border-border/50 hover:bg-muted'
            }`}
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
          </button>
        </td>
      </tr>

      {/* Expanded Remarks Row */}
      {isExpanded && (
        <tr className={`border-b border-border/50 ${row.isDirty ? 'bg-primary/5' : 'bg-muted/20'}`}>
          <td colSpan={7} className="py-2 px-4">
            <div className="flex items-start gap-2 max-w-2xl">
              <MessageSquare className="h-4 w-4 text-primary mt-2 shrink-0" />
              <Textarea
                value={row.remarks}
                onChange={e => onUpdateField(row.gpId, 'remarks', e.target.value)}
                placeholder="Add remarks for this GP..."
                className="glass-input text-sm min-h-[60px] resize-y"
                rows={2}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================
// Number Input with +/- buttons
// ============================================
function NumberInput({
  value,
  onChange,
  color,
}: {
  value: number;
  onChange: (value: number) => void;
  color: 'green' | 'amber' | 'rose' | 'blue';
}) {
  const colorMap = {
    green: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', hover: 'hover:bg-green-500/20' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', hover: 'hover:bg-amber-500/20' },
    rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400', hover: 'hover:bg-rose-500/20' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', hover: 'hover:bg-blue-500/20' },
  };
  const c = colorMap[color];

  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className={`w-6 h-7 rounded-l-md flex items-center justify-center ${c.bg} ${c.border} border ${c.hover} transition-colors`}
        disabled={value === 0}
      >
        <Minus className={`h-3 w-3 ${value === 0 ? 'text-muted-foreground' : c.text}`} />
      </button>
      <input
        type="number"
        value={value}
        onChange={e => {
          const v = parseInt(e.target.value) || 0;
          onChange(Math.max(0, v));
        }}
        className={`w-10 h-7 text-center text-sm font-semibold border-y ${c.border} bg-transparent ${
          value > 0 ? c.text : 'text-muted-foreground'
        } focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
        min={0}
      />
      <button
        onClick={() => onChange(value + 1)}
        className={`w-6 h-7 rounded-r-md flex items-center justify-center ${c.bg} ${c.border} border ${c.hover} transition-colors`}
      >
        <TrendingUp className={`h-3 w-3 ${c.text}`} />
      </button>
    </div>
  );
}

// ============================================
// Summary Card Component
// ============================================
function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'red' | 'green' | 'amber' | 'rose' | 'blue';
}) {
  const colorMap = {
    red: { card: 'stat-card-red', icon: 'icon-container-red', text: 'text-red-400' },
    green: { card: 'stat-card-green', icon: 'icon-container-green', text: 'text-green-400' },
    amber: { card: 'stat-card-gold', icon: 'icon-container-gold', text: 'text-amber-400' },
    rose: { card: 'stat-card-rose', icon: 'icon-container-rose', text: 'text-rose-400' },
    blue: { card: 'stat-card-blue', icon: 'icon-container-blue', text: 'text-blue-400' },
  };
  const c = colorMap[color];

  return (
    <div className={`stat-card ${c.card} p-3 sm:p-4`}>
      <div className="flex items-center gap-3">
        <div className={`icon-container ${c.icon} w-9 h-9 sm:w-10 sm:h-10`}>
          {icon}
        </div>
        <div>
          <p className={`text-xl sm:text-2xl font-bold ${c.text}`}>{value}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}


// ============================================
// Attendance Trend Charts Component
// ============================================
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function AttendanceTrendCharts({ teamId }: { teamId: number }) {
  const [showCharts, setShowCharts] = useState(false);
  const { data: trends, isLoading } = trpc.attendance.trends.useQuery(
    { teamId, months: 6 },
    { enabled: !!teamId && showCharts }
  );

  const chartData = useMemo(() => {
    if (!trends) return [];
    return trends.map(t => ({
      name: `${SHORT_MONTHS[t.month - 1]} ${t.year}`,
      "Late Arrivals": t.totalLateToWork,
      "Missed Days": t.totalMissedDays,
      "Sick Leaves": t.totalSickLeaves,
      "Extra Shifts": t.totalExtraShifts,
      "Mistakes": t.totalMistakes,
      gpCount: t.gpCount,
    }));
  }, [trends]);

  const issuesData = useMemo(() => {
    if (!trends) return [];
    return trends.map(t => ({
      name: `${SHORT_MONTHS[t.month - 1]} ${t.year}`,
      total: t.totalLateToWork + t.totalMissedDays + t.totalSickLeaves,
      "Late Arrivals": t.totalLateToWork,
      "Missed Days": t.totalMissedDays,
      "Sick Leaves": t.totalSickLeaves,
    }));
  }, [trends]);

  if (!showCharts) {
    return (
      <div className="glass-card p-4">
        <Button
          variant="outline"
          className="w-full glass-button text-muted-foreground hover:text-foreground gap-2"
          onClick={() => setShowCharts(true)}
        >
          <LineChartIcon className="h-4 w-4 text-primary" />
          Show Attendance Trends (Last 6 Months)
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <LineChartIcon className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Attendance Trends</h3>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-[250px] w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="glass-card p-6 text-center text-muted-foreground">
        <LineChartIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No trend data available yet</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LineChartIcon className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Attendance Trends — Last 6 Months</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setShowCharts(false)}
        >
          Hide
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line Chart: Late Arrivals & Missed Days */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Late Arrivals & Missed Days</h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e3)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground, #6b7280)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--color-muted-foreground, #6b7280)', fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-popover, #fff)',
                    border: '1px solid var(--color-border, #e5e5e3)',
                    borderRadius: '8px',
                    color: 'var(--color-foreground, #111)',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="Late Arrivals"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ fill: '#f59e0b', r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="Missed Days"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  dot={{ fill: '#f43f5e', r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="Sick Leaves"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stacked Bar Chart: All Issues */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Monthly Issues Breakdown</h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={issuesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e3)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground, #6b7280)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--color-muted-foreground, #6b7280)', fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-popover, #fff)',
                    border: '1px solid var(--color-border, #e5e5e3)',
                    borderRadius: '8px',
                    color: 'var(--color-foreground, #111)',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Late Arrivals" stackId="issues" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Missed Days" stackId="issues" fill="#f43f5e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Sick Leaves" stackId="issues" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Mistakes & Extra Shifts Line */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Mistakes & Extra Shifts</h4>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e3)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground, #6b7280)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--color-muted-foreground, #6b7280)', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-popover, #fff)',
                  border: '1px solid var(--color-border, #e5e5e3)',
                  borderRadius: '8px',
                  color: 'var(--color-foreground, #111)',
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="Mistakes"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="Extra Shifts"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
