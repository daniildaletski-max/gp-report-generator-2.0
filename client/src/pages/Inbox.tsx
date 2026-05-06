/**
 * FM Inbox — unified action queue for the Floor Manager.
 *
 * Replaces the (broken) /compare page. Aggregates everything the FM
 * has been ignoring or hasn't seen yet into one prioritised list:
 *
 *   1. Auto-generated insights (cadence drift, score regressions,
 *      attendance anomalies) from `dashboard.insights`.
 *   2. Open action items across the FM's GPs from
 *      `actionItems.list` — sorted by priority + status.
 *   3. Recent activity feed (last evals, persona syncs, action item
 *      changes) from `dashboard.activityFeed`.
 *
 * Each row is one click away from the page that resolves it
 * (Workspace, Attendance, Admin > Persona, GP Portal).
 *
 * Intentionally a single scrollable list with section headers
 * instead of tabs — the FM scans top-down each morning and addresses
 * the items in priority order.
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Inbox as InboxIcon, AlertTriangle, Clock, Flag, Sparkles, ArrowRight,
  Activity, CheckCircle2, Users, Zap, Calendar, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function InboxPage() {
  const { user } = useAuth();
  const [selectedTeamId, setSelectedTeamId] = useState<number | undefined>(undefined);
  const { data: teams } = trpc.fmTeam.list.useQuery();

  // Auto-pick first team for FM (admins see "all" by default).
  // We don't store this in URL — Inbox is a daily glance, not a
  // shareable view; the team filter is a personal choice.
  const effectiveTeamId = selectedTeamId ?? teams?.[0]?.id;

  const { data: insights, isLoading: insightsLoading } = trpc.dashboard.insights.useQuery({
    teamId: effectiveTeamId,
  });
  const { data: feed, isLoading: feedLoading } = trpc.dashboard.activityFeed.useQuery({
    teamId: effectiveTeamId,
    limit: 8,
  });
  const { data: actionItems, refetch: refetchActions } = trpc.actionItems.list.useQuery({
    teamId: effectiveTeamId ?? null,
    includeAllStatuses: false,
  });

  const completeMutation = trpc.actionItems.complete.useMutation({
    onSuccess: () => { toast.success("Marked complete"); refetchActions(); },
    onError: (e) => toast.error(e.message),
  });

  // Sort action items: high priority first, then in_progress, then due date.
  const sortedActions = useMemo(() => {
    const list = (actionItems ?? []).slice();
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    list.sort((a, b) => {
      const pa = priorityRank[a.priority ?? "medium"] ?? 99;
      const pb = priorityRank[b.priority ?? "medium"] ?? 99;
      if (pa !== pb) return pa - pb;
      // in_progress > open at same priority
      if (a.status !== b.status) {
        if (a.status === "in_progress") return -1;
        if (b.status === "in_progress") return 1;
      }
      // older due date first
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    });
    return list;
  }, [actionItems]);

  // Top-level summary used in the page header.
  const summary = useMemo(() => {
    const ins = insights ?? [];
    const acts = sortedActions;
    return {
      insights: ins.length,
      criticalInsights: ins.filter(i => (i as any).severity === "critical" || (i as any).severity === "high").length,
      actions: acts.length,
      highPriority: acts.filter(a => a.priority === "high").length,
    };
  }, [insights, sortedActions]);

  return (
    <div className="space-y-5 p-4 md:p-6 min-h-screen animate-fade-in">
      <PageHeader
        title="Inbox"
        subtitle="What needs your attention right now — anomalies, action items, recent activity"
        icon={InboxIcon}
        actions={(
          <div className="flex items-center gap-2 flex-wrap">
            <SummaryPill icon={AlertTriangle} value={summary.criticalInsights} label="Critical" tone="rose" />
            <SummaryPill icon={Flag} value={summary.highPriority} label="High pri" tone="amber" />
            <SummaryPill icon={Activity} value={summary.actions} label="Open" tone="sky" />
          </div>
        )}
      />

      {/* Team filter — only shown when the user has more than one team. */}
      {teams && teams.length > 1 && (
        <div className="glass-card p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Team:</span>
          <button
            onClick={() => setSelectedTeamId(undefined)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              selectedTeamId === undefined
                ? "bg-primary/15 text-primary border-primary/30 font-semibold"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            All teams
          </button>
          {teams.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTeamId(t.id)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                selectedTeamId === t.id
                  ? "bg-primary/15 text-primary border-primary/30 font-semibold"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {t.teamName}
            </button>
          ))}
        </div>
      )}

      {/* Section: Insights — the system telling the FM about problems. */}
      <Section
        icon={Sparkles}
        title="What you need to know"
        subtitle="Auto-generated from cadence, evaluations, and attendance"
        count={insights?.length ?? 0}
        tone="violet"
      >
        {insightsLoading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : (insights?.length ?? 0) === 0 ? (
          <EmptyHint
            icon={CheckCircle2}
            text="No active anomalies. Your team's looking good."
          />
        ) : (
          <div className="space-y-1.5">
            {insights!.map((ins, idx) => (
              <InsightRow key={idx} insight={ins as any} />
            ))}
          </div>
        )}
      </Section>

      {/* Section: Action items — manual + auto-flagged coaching tasks. */}
      <Section
        icon={Flag}
        title="Coaching actions"
        subtitle="Open action items across your GPs, sorted by priority"
        count={sortedActions.length}
        tone="amber"
      >
        {sortedActions.length === 0 ? (
          <EmptyHint
            icon={CheckCircle2}
            text="Nothing pending. Add notes from the Workspace coaching panel as you evaluate."
          />
        ) : (
          <div className="space-y-1.5">
            {sortedActions.slice(0, 12).map((item: any) => (
              <ActionItemRow
                key={item.id}
                item={item}
                onComplete={() => completeMutation.mutate({ id: item.id })}
                isCompleting={completeMutation.isPending}
              />
            ))}
            {sortedActions.length > 12 && (
              <p className="text-[11px] text-slate-500 text-center pt-2">
                + {sortedActions.length - 12} more — narrow by team filter to see them.
              </p>
            )}
          </div>
        )}
      </Section>

      {/* Section: Recent activity — what happened recently. */}
      <Section
        icon={Activity}
        title="Recent activity"
        subtitle="Latest evaluations, syncs, and resolved items"
        count={feed?.length ?? 0}
        tone="sky"
      >
        {feedLoading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : (feed?.length ?? 0) === 0 ? (
          <EmptyHint icon={Clock} text="No recent activity." />
        ) : (
          <div className="space-y-1.5">
            {feed!.map((entry: any) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ============================================
// Section wrapper — colour-coded heading + count badge.
// ============================================
function Section({
  icon: Icon, title, subtitle, count, tone, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  count: number;
  tone: "violet" | "amber" | "sky";
  children: React.ReactNode;
}) {
  const accent = tone === "violet" ? "from-violet-300 to-violet-400 bg-violet-100 text-violet-700"
    : tone === "amber" ? "from-amber-300 to-amber-400 bg-amber-100 text-amber-700"
      : "from-sky-300 to-sky-400 bg-sky-100 text-sky-700";
  return (
    <Card className="overflow-hidden">
      <div className={`h-0.5 bg-gradient-to-r ${accent.split(" ")[0]} ${accent.split(" ")[1]}`} aria-hidden />
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={`h-9 w-9 rounded-xl border flex items-center justify-center ${accent.split(" ")[2]} ${accent.split(" ")[3]}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <p className="text-[11px] text-slate-500">{subtitle}</p>
            </div>
          </div>
          <Badge variant="outline" className="tabular-nums">{count}</Badge>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// ============================================
// SummaryPill — header chip
// ============================================
function SummaryPill({
  icon: Icon, value, label, tone,
}: { icon: React.ComponentType<{ className?: string }>; value: number; label: string; tone: "rose" | "amber" | "sky" }) {
  const cls = tone === "rose"
    ? "bg-rose-50 border-rose-200 text-rose-700"
    : tone === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-sky-50 border-sky-200 text-sky-700";
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-sm font-bold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
    </div>
  );
}

// ============================================
// EmptyHint — replaces the cluttered "no data" blob with a friendly
// one-liner. Used when a section is intentionally empty (clean state)
// rather than failing.
// ============================================
function EmptyHint({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-slate-50 border border-slate-200/60">
      <Icon className="h-4 w-4 text-slate-400 shrink-0" />
      <p className="text-xs text-slate-600">{text}</p>
    </div>
  );
}

// ============================================
// InsightRow — single row from dashboard.insights. The shape isn't
// fully typed across the app (kind/severity are strings); we render
// defensively and link to whichever page resolves the issue.
// ============================================
function InsightRow({ insight }: { insight: any }) {
  const sev = (insight.severity ?? "medium") as string;
  const tone = sev === "critical" ? "border-rose-300 bg-rose-50/60" :
    sev === "high" ? "border-amber-300 bg-amber-50/60" :
      sev === "low" ? "border-slate-200 bg-slate-50/40" :
        "border-amber-200 bg-amber-50/40";
  const sevText = sev === "critical" ? "text-rose-700" :
    sev === "high" ? "text-amber-700" :
      sev === "low" ? "text-slate-500" :
        "text-amber-600";
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${tone}`}>
      <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${sevText}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">
          {insight.title ?? insight.kind ?? "Anomaly"}
        </p>
        {insight.description && (
          <p className="text-xs text-slate-600 mt-0.5">{insight.description}</p>
        )}
        {insight.gpName && (
          <p className="text-[10px] text-slate-500 mt-0.5">
            <Users className="h-2.5 w-2.5 inline mr-1" />
            {insight.gpName}
          </p>
        )}
      </div>
      {insight.href && (
        <Link
          href={insight.href}
          className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 hover:text-amber-900 inline-flex items-center gap-0.5 shrink-0"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

// ============================================
// ActionItemRow — single action item row with quick "complete"
// inline so the FM can clear easy items without leaving the page.
// ============================================
function ActionItemRow({
  item, onComplete, isCompleting,
}: { item: any; onComplete: () => void; isCompleting: boolean }) {
  const tone = item.priority === "high"
    ? "border-rose-200 bg-rose-50/40"
    : item.priority === "low"
      ? "border-slate-200 bg-white"
      : "border-amber-200 bg-amber-50/40";
  const sevText = item.priority === "high"
    ? "text-rose-700"
    : item.priority === "low"
      ? "text-slate-500"
      : "text-amber-700";
  const due = item.dueDate ? new Date(item.dueDate) : null;
  const overdue = due ? due.getTime() < Date.now() : false;
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${tone}`}>
      <Flag className={`h-4 w-4 shrink-0 mt-0.5 ${sevText}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-slate-500">
          {item.gamePresenter?.name && (
            <span className="inline-flex items-center gap-0.5">
              <Users className="h-2.5 w-2.5" />
              {item.gamePresenter.name}
            </span>
          )}
          <span className="uppercase tracking-wider">{item.category ?? "general"}</span>
          {item.status === "in_progress" && (
            <Badge className="bg-sky-100 text-sky-700 border-sky-200 text-[9px] uppercase">in progress</Badge>
          )}
          {due && (
            <span className={`inline-flex items-center gap-0.5 ${overdue ? "text-rose-600 font-semibold" : ""}`}>
              <Calendar className="h-2.5 w-2.5" />
              {format(due, "MMM d")} {overdue && "(overdue)"}
            </span>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-[11px] gap-1 shrink-0"
        onClick={onComplete}
        disabled={isCompleting}
      >
        {isCompleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
        Done
      </Button>
    </div>
  );
}

// ============================================
// ActivityRow — tiny activity feed row with icon + timestamp.
// ============================================
function ActivityRow({ entry }: { entry: any }) {
  const iconFor = (kind: string) => {
    if (kind === "evaluation") return Zap;
    if (kind === "persona_sync") return Activity;
    if (kind === "action_item") return Flag;
    if (kind === "report") return Calendar;
    return Activity;
  };
  const Icon = iconFor(entry.kind ?? "");
  const ts = entry.timestamp ? new Date(entry.timestamp) : null;
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-lg border border-slate-200 bg-white">
      <span className="h-7 w-7 shrink-0 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center">
        <Icon className="h-3 w-3 text-sky-600" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-700 truncate">{entry.title ?? entry.kind ?? "Activity"}</p>
        {entry.detail && (
          <p className="text-[10px] text-slate-500 truncate mt-0.5">{entry.detail}</p>
        )}
      </div>
      {ts && (
        <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
          {format(ts, "MMM d HH:mm")}
        </span>
      )}
    </div>
  );
}
