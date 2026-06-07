/**
 * Command Center — the operations cockpit.
 *
 * One page that answers "what's the state of the studio and what should I
 * do about it right now?":
 *   - an AI-written executive briefing (commandCenter.briefing)
 *   - the deep company-wide insight feed (dashboard.insights)
 *   - bulk AI coaching: select GPs → generate + save coaching plans
 *   - a live activity feed (dashboard.activityFeed)
 *   - global search / jump-to-anything (the Cmd+K palette)
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/PageHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Radar, Search, Sparkles, RefreshCw, Loader2, Wand2, ArrowRight, Users,
  TrendingDown, TrendingUp, Award, ScanLine, FileSpreadsheet, Clock,
  CalendarX, AlertTriangle, Activity, FileCheck, ChevronRight, Zap, ChevronsDown,
} from "lucide-react";
import { format } from "date-fns";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type InsightKind =
  | "missing_report" | "score_regression" | "score_improvement" | "coverage_gap"
  | "evaluation_stale" | "attendance_risk" | "error_spike" | "top_performer"
  | "sustained_decline";

const INSIGHT_ICON: Record<InsightKind, React.ComponentType<{ className?: string }>> = {
  score_regression: TrendingDown,
  score_improvement: TrendingUp,
  top_performer: Award,
  coverage_gap: ScanLine,
  missing_report: FileSpreadsheet,
  evaluation_stale: Clock,
  attendance_risk: CalendarX,
  error_spike: AlertTriangle,
  sustained_decline: ChevronsDown,
};

const SEVERITY_STYLE: Record<string, { ring: string; icon: string; chip: string; label: string }> = {
  alert: { ring: "border-rose-200 bg-rose-50/50", icon: "bg-rose-100 text-rose-700 border-rose-200", chip: "bg-rose-100 text-rose-700", label: "Alert" },
  warning: { ring: "border-amber-200 bg-amber-50/50", icon: "bg-amber-100 text-amber-700 border-amber-200", chip: "bg-amber-100 text-amber-700", label: "Watch" },
  recommendation: { ring: "border-sky-200 bg-sky-50/50", icon: "bg-sky-100 text-sky-700 border-sky-200", chip: "bg-sky-100 text-sky-700", label: "To-do" },
  celebration: { ring: "border-emerald-200 bg-emerald-50/50", icon: "bg-emerald-100 text-emerald-700 border-emerald-200", chip: "bg-emerald-100 text-emerald-700", label: "Win" },
  info: { ring: "border-slate-200 bg-slate-50/50", icon: "bg-slate-100 text-slate-700 border-slate-200", chip: "bg-slate-100 text-slate-600", label: "Info" },
};

const ACTIVITY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  report: FileSpreadsheet,
  evaluation: FileCheck,
  error_file: AlertTriangle,
  sync: RefreshCw,
};

function relativeTime(ts: string | Date): string {
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return format(d, "dd MMM");
}

export default function CommandCenterPage() {
  const [, setLocation] = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedGpIds, setSelectedGpIds] = useState<number[]>([]);
  const [gpSearch, setGpSearch] = useState("");

  const utils = trpc.useUtils();
  const { data: briefing, isLoading: briefingLoading, isFetching: briefingFetching, refetch: refetchBriefing } =
    trpc.commandCenter.briefing.useQuery(undefined, { staleTime: 1000 * 60 * 30 });
  const { data: insights, isLoading: insightsLoading } = trpc.dashboard.insights.useQuery({});
  const { data: activity } = trpc.dashboard.activityFeed.useQuery({ limit: 12 });
  const { data: gps } = trpc.gamePresenter.list.useQuery();

  const bulkCoach = trpc.commandCenter.bulkCoach.useMutation({
    onSuccess: (data) => {
      const { created, succeeded, failed } = data.totals;
      if (created === 0 && failed === 0) {
        toast.info("No new coaching plans were generated for the selected GPs.");
      } else if (failed === 0) {
        toast.success(`Created ${created} coaching plan${created === 1 ? "" : "s"} across ${succeeded} GP${succeeded === 1 ? "" : "s"}.`);
      } else {
        toast.warning(`Created ${created} plan${created === 1 ? "" : "s"} · ${failed} GP${failed === 1 ? "" : "s"} failed.`);
      }
      setSelectedGpIds([]);
      utils.dashboard.insights.invalidate();
    },
    onError: (err) => toast.error(err.message || "Bulk coaching failed"),
  });

  // GPs flagged by an alert/warning insight — the high-value coaching targets.
  const flaggedGpIds = useMemo(() => {
    const ids = new Set<number>();
    for (const i of insights ?? []) {
      if ((i.severity === "alert" || i.severity === "warning") && i.metadata?.gpId) {
        ids.add(i.metadata.gpId);
      }
    }
    return ids;
  }, [insights]);

  const filteredGps = useMemo(() => {
    const list = (gps ?? []) as Array<{ id: number; name: string }>;
    const q = gpSearch.trim().toLowerCase();
    const base = q ? list.filter(g => g.name.toLowerCase().includes(q)) : list;
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [gps, gpSearch]);

  const toggleGp = (id: number) =>
    setSelectedGpIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const selectFlagged = () => setSelectedGpIds(Array.from(flaggedGpIds));

  const insightCounts = useMemo(() => {
    const c = { alert: 0, warning: 0, celebration: 0, other: 0 };
    for (const i of insights ?? []) {
      if (i.severity === "alert") c.alert++;
      else if (i.severity === "warning") c.warning++;
      else if (i.severity === "celebration") c.celebration++;
      else c.other++;
    }
    return c;
  }, [insights]);

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen animate-fade-in">
      <PageHeader
        title="Command Center"
        subtitle="Your operations cockpit — the studio's state, signals, and one-click actions"
        icon={Radar}
        actions={
          <Button variant="outline" onClick={() => setPaletteOpen(true)} className="gap-2">
            <Search className="h-4 w-4" />
            <span>Search…</span>
            <kbd className="ml-1 hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 text-[10px] text-muted-foreground">⌘K</kbd>
          </Button>
        }
      />

      {/* Executive briefing — the AI's read on where the studio stands. */}
      <Card className="overflow-hidden border-violet-200/60 shadow-sm">
        <div className="h-0.5 bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />
        <CardHeader className="pb-3 bg-gradient-to-br from-white to-violet-50/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-violet-100 border border-violet-200">
                <Sparkles className="h-4.5 w-4.5 text-violet-700" />
              </div>
              <div>
                <CardTitle className="text-base">Executive briefing</CardTitle>
                <CardDescription>
                  {briefing
                    ? `${MONTHS[(briefing.dataMonth - 1 + 12) % 12]} ${briefing.dataYear} · ${briefing.insightCount} signal${briefing.insightCount === 1 ? "" : "s"} detected`
                    : "AI summary of the current operation"}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => refetchBriefing()}
              disabled={briefingFetching}
              title="Refresh briefing"
              aria-label="Refresh briefing"
            >
              <RefreshCw className={`h-4 w-4 ${briefingFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {briefingLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[92%]" />
              <Skeleton className="h-4 w-[78%]" />
            </div>
          ) : briefing?.briefing ? (
            <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{briefing.briefing}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not enough data to brief on yet — add evaluations and the AI summary will appear here.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Insights feed */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" /> Signals
            </h2>
            <div className="flex items-center gap-1.5">
              {insightCounts.alert > 0 && <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">{insightCounts.alert} alert</Badge>}
              {insightCounts.warning > 0 && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{insightCounts.warning} watch</Badge>}
              {insightCounts.celebration > 0 && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{insightCounts.celebration} win</Badge>}
            </div>
          </div>

          {insightsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : (insights && insights.length > 0) ? (
            <div className="space-y-2">
              {insights.map(insight => {
                const sev = SEVERITY_STYLE[insight.severity] ?? SEVERITY_STYLE.info;
                const Icon = INSIGHT_ICON[insight.kind as InsightKind] ?? Activity;
                return (
                  <div key={insight.id} className={`rounded-xl border p-3 flex items-start gap-3 transition-colors ${sev.ring}`}>
                    <span className={`h-9 w-9 shrink-0 rounded-lg border flex items-center justify-center ${sev.icon}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">{insight.title}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${sev.chip}`}>{sev.label}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{insight.description}</p>
                    </div>
                    {insight.action && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs shrink-0 self-center"
                        onClick={() => setLocation(insight.action!.href)}
                      >
                        {insight.action.label}
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <Award className="h-6 w-6 text-emerald-500" />
                All clear — no signals need attention right now.
              </CardContent>
            </Card>
          )}
        </div>

        {/* Activity feed */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Activity className="h-4 w-4 text-sky-500" /> Recent activity
          </h2>
          <Card>
            <CardContent className="p-2 divide-y divide-border">
              {(activity && activity.length > 0) ? activity.map(item => {
                const Icon = ACTIVITY_ICON[item.kind] ?? Activity;
                const row = (
                  <div className="flex items-center gap-2.5 px-2 py-2.5">
                    <span className="h-7 w-7 shrink-0 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 truncate">{item.title}</p>
                      {item.detail && <p className="text-[11px] text-muted-foreground truncate">{item.detail}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(item.timestamp)}</span>
                  </div>
                );
                return item.href ? (
                  <button key={item.id} type="button" onClick={() => setLocation(item.href!)} className="w-full text-left hover:bg-muted/50 transition-colors rounded-lg">
                    {row}
                  </button>
                ) : (
                  <div key={item.id}>{row}</div>
                );
              }) : (
                <p className="text-xs text-muted-foreground text-center py-6">No recent activity.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bulk AI coaching */}
      <Card className="overflow-hidden border-primary/15">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/15">
                <Wand2 className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Bulk AI coaching</CardTitle>
                <CardDescription>Select GPs and generate saved coaching plans for each in one click.</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectFlagged}
                disabled={flaggedGpIds.size === 0}
                title="Select every GP flagged by an alert or watch signal"
              >
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                Select flagged ({flaggedGpIds.size})
              </Button>
              <Button
                size="sm"
                onClick={() => bulkCoach.mutate({ gpIds: selectedGpIds, maxPerGp: 2 })}
                disabled={selectedGpIds.length === 0 || bulkCoach.isPending}
                className="gap-1.5"
              >
                {bulkCoach.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Generate plans ({selectedGpIds.length})</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter GPs…"
                value={gpSearch}
                onChange={(e) => setGpSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            {selectedGpIds.length > 0 && (
              <button type="button" onClick={() => setSelectedGpIds([])} className="text-xs text-muted-foreground hover:text-foreground">
                Clear selection
              </button>
            )}
          </div>

          {bulkCoach.isPending && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating coaching plans — each GP is a quick AI pass, so a large batch takes a moment.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[320px] overflow-y-auto pr-1">
            {filteredGps.map(gp => {
              const checked = selectedGpIds.includes(gp.id);
              const flagged = flaggedGpIds.has(gp.id);
              return (
                <button
                  key={gp.id}
                  type="button"
                  onClick={() => toggleGp(gp.id)}
                  className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all ${
                    checked ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card hover:border-primary/20 hover:bg-muted/40"
                  }`}
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 truncate">{gp.name}</p>
                    {flagged && <span className="text-[10px] text-amber-600 font-medium">flagged</span>}
                  </div>
                </button>
              );
            })}
            {filteredGps.length === 0 && (
              <p className="col-span-full text-xs text-muted-foreground text-center py-6">No GPs match your filter.</p>
            )}
          </div>

          {/* Per-GP results from the last run */}
          {bulkCoach.data && bulkCoach.data.results.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">Last run</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {bulkCoach.data.results.map(r => (
                  <div key={r.gpId} className="flex items-center gap-1.5 text-xs">
                    {"error" in r ? (
                      <><AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" /><span className="text-slate-600 truncate">{r.gpName}: failed</span></>
                    ) : (
                      <><ChevronRight className="h-3 w-3 text-emerald-500 shrink-0" /><span className="text-slate-600 truncate">{r.gpName}: {r.created} plan{r.created === 1 ? "" : "s"}</span></>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setLocation("/admin?tab=action-items")}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
              >
                <Users className="h-3 w-3" /> View all coaching plans
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
