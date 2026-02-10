import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CalendarCheck, Save, Loader2, Users, AlertTriangle,
  Clock, TrendingUp, TrendingDown, Minus, RotateCcw,
  ChevronDown, ChevronUp, Briefcase, Timer, CalendarX,
  Stethoscope, MessageSquare, BarChart3, Info
} from "lucide-react";
import { MONTH_NAMES } from "@shared/const";

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

  // Populate rows from fetched data
  useEffect(() => {
    if (attendanceData?.items) {
      setRows(attendanceData.items.map(item => ({
        gpId: item.gamePresenter.id,
        gpName: item.gamePresenter.name,
        mistakes: item.attendance?.mistakes ?? item.monthlyStats?.mistakes ?? 0,
        extraShifts: item.attendance?.extraShifts ?? 0,
        lateToWork: item.attendance?.lateToWork ?? 0,
        missedDays: item.attendance?.missedDays ?? 0,
        sickLeaves: item.attendance?.sickLeaves ?? 0,
        remarks: item.attendance?.remarks ?? "",
        isDirty: false,
      })));
    }
  }, [attendanceData]);

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
        mistakes: item.attendance?.mistakes ?? item.monthlyStats?.mistakes ?? 0,
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

  // Year options
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="page-header">
          <h1 className="page-title flex items-center gap-3">
            <div className="icon-container-gold">
              <CalendarCheck className="h-5 w-5" />
            </div>
            Attendance Management
          </h1>
          <p className="page-subtitle mt-1">
            Track extra shifts, late arrivals, missed days, and sick leaves for your team
          </p>
        </div>
        {hasDirtyRows && (
          <div className="flex items-center gap-2">
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
              className="bg-gradient-to-r from-[#d4af37] to-[#b8860b] hover:from-[#e6c84b] hover:to-[#d4af37] text-black font-semibold shadow-lg shadow-[#d4af37]/20"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save Changes ({rows.filter(r => r.isDirty).length})
            </Button>
          </div>
        )}
      </div>

      {/* Filters Row */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Team Selector */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Team</label>
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
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
            <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
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
            <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
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

      {/* Attendance Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-[#d4af37]/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#d4af37]" />
            <h3 className="font-semibold text-foreground/90">
              {selectedTeam?.teamName || "Team"} — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </h3>
            {rows.length > 0 && (
              <Badge variant="outline" className="ml-2 text-xs border-[#d4af37]/20 text-[#d4af37]">
                {rows.length} GPs
              </Badge>
            )}
          </div>
          {hasDirtyRows && (
            <Badge className="bg-[#d4af37]/15 text-[#d4af37] border border-[#d4af37]/25 text-xs">
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
                <tr className="border-b border-[#d4af37]/10">
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
                      <MessageSquare className="h-3 w-3 text-[#d4af37]" />
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
                  />
                ))}
                {/* Totals Row */}
                <tr className="border-t-2 border-[#d4af37]/20 bg-[#d4af37]/5">
                  <td className="py-3 px-4 font-bold text-[#d4af37] sticky left-0 bg-[#d4af37]/5 z-10">
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
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-lg border-t border-[#d4af37]/15 z-50 sm:hidden">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-gradient-to-r from-[#d4af37] to-[#b8860b] hover:from-[#e6c84b] hover:to-[#d4af37] text-black font-semibold shadow-lg"
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
}: {
  row: AttendanceRow;
  index: number;
  isExpanded: boolean;
  onToggleRemarks: () => void;
  onUpdateField: (gpId: number, field: keyof AttendanceRow, value: number | string) => void;
}) {
  return (
    <>
      <tr
        className={`border-b border-white/5 transition-colors duration-200 ${
          row.isDirty
            ? 'bg-[#d4af37]/5 border-l-2 border-l-[#d4af37]/40'
            : index % 2 === 0
            ? 'bg-transparent'
            : 'bg-white/[0.02]'
        } hover:bg-white/[0.04]`}
      >
        {/* GP Name */}
        <td className={`py-2.5 px-4 sticky left-0 z-10 ${
          row.isDirty ? 'bg-[#d4af37]/5' : index % 2 === 0 ? 'bg-card' : 'bg-card/95'
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#d4af37]/15 to-[#b8860b]/10 flex items-center justify-center border border-[#d4af37]/15 shrink-0">
              <span className="text-[10px] font-bold text-[#d4af37]">
                {row.gpName.charAt(0)}
              </span>
            </div>
            <span className="font-medium text-sm text-foreground/90 truncate max-w-[120px]">
              {row.gpName}
            </span>
            {row.isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37] animate-pulse-slow shrink-0" />
            )}
          </div>
        </td>

        {/* Mistakes (read-only) */}
        <td className="py-2.5 px-2 text-center">
          <div className="relative group">
            <span className={`inline-flex items-center justify-center w-10 h-8 rounded-lg text-sm font-semibold ${
              row.mistakes > 0
                ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                : 'bg-white/5 text-muted-foreground border border-white/5'
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
                ? 'bg-[#d4af37]/15 text-[#d4af37] border border-[#d4af37]/20 hover:bg-[#d4af37]/25'
                : 'bg-white/5 text-muted-foreground border border-white/5 hover:bg-white/10'
            }`}
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
          </button>
        </td>
      </tr>

      {/* Expanded Remarks Row */}
      {isExpanded && (
        <tr className={`border-b border-white/5 ${row.isDirty ? 'bg-[#d4af37]/5' : 'bg-white/[0.01]'}`}>
          <td colSpan={7} className="py-2 px-4">
            <div className="flex items-start gap-2 max-w-2xl">
              <MessageSquare className="h-4 w-4 text-[#d4af37] mt-2 shrink-0" />
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
        <Minus className={`h-3 w-3 ${value === 0 ? 'text-muted-foreground/30' : c.text}`} />
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
