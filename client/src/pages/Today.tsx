import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GPDetailDrawer } from "@/components/GPDetailDrawer";
import { formatDistanceToNow } from "date-fns";
import {
  Sun, AlertTriangle, AlertCircle, Lightbulb, TrendingUp, Info,
  CheckCircle2, Circle, ArrowRight, User, Activity, Sparkles,
  CalendarClock, ListChecks, Zap,
} from "lucide-react";

/**
 * "Today" — the personal command center. Answers "what do I need to do
 * right now?" in one place by unifying three signals that were previously
 * scattered across the notifications bell, the command palette, the GP
 * drawer and a buried dashboard section:
 *   1. Needs action — server-computed insights (overdue coverage, missing
 *      reports, stale sync, regressions) each with a 1-click next step.
 *   2. My coaching tasks — open/in-progress action items, completed inline.
 *   3. Wins & activity — improvements + the recent activity feed (passive).
 *
 * Self-contained: reuses dashboard.insights / dashboard.activityFeed /
 * actionItems.list+stats+complete and the shared GPDetailDrawer — no
 * changes to the mega-pages.
 */

// ---- severity styling -------------------------------------------------------

type Severity = "alert" | "warning" | "recommendation" | "celebration" | "info";

const SEVERITY_META: Record<Severity, { icon: React.ElementType; ring: string; chip: string; dot: string }> = {
  alert:          { icon: AlertTriangle, ring: "border-rose-200 bg-rose-50/60",    chip: "text-rose-700 border-rose-200 bg-rose-50",       dot: "bg-rose-500" },
  warning:        { icon: AlertCircle,   ring: "border-amber-200 bg-amber-50/60",  chip: "text-amber-700 border-amber-200 bg-amber-50",    dot: "bg-amber-500" },
  recommendation: { icon: Lightbulb,     ring: "border-sky-200 bg-sky-50/50",      chip: "text-sky-700 border-sky-200 bg-sky-50",          dot: "bg-sky-500" },
  celebration:    { icon: TrendingUp,    ring: "border-emerald-200 bg-emerald-50/60", chip: "text-emerald-700 border-emerald-200 bg-emerald-50", dot: "bg-emerald-500" },
  info:           { icon: Info,          ring: "border-slate-200 bg-slate-50/60",  chip: "text-slate-600 border-slate-200 bg-slate-50",    dot: "bg-slate-400" },
};

const PRIORITY_META: Record<"high" | "medium" | "low", { label: string; chip: string }> = {
  high:   { label: "High",   chip: "text-rose-700 border-rose-200 bg-rose-50" },
  medium: { label: "Medium", chip: "text-amber-700 border-amber-200 bg-amber-50" },
  low:    { label: "Low",    chip: "text-slate-600 border-slate-200 bg-slate-50" },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function relTime(ts: Date | string | null | undefined): string {
  if (!ts) return "";
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); } catch { return ""; }
}

// ---- page -------------------------------------------------------------------

export default function Today() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [drawerGpId, setDrawerGpId] = useState<number | null>(null);

  const insightsQ = trpc.dashboard.insights.useQuery({}, { staleTime: 60_000 });
  const tasksQ = trpc.actionItems.list.useQuery({}, { staleTime: 30_000 });
  const statsQ = trpc.actionItems.stats.useQuery({}, { staleTime: 30_000 });
  const activityQ = trpc.dashboard.activityFeed.useQuery({ limit: 8 }, { staleTime: 60_000 });

  const completeTask = trpc.actionItems.complete.useMutation({
    onSuccess: () => {
      utils.actionItems.list.invalidate();
      utils.actionItems.stats.invalidate();
      toast.success("Nice — marked done");
    },
    onError: (e) => toast.error("Could not update: " + e.message),
  });

  const insights = insightsQ.data ?? [];
  const needsAction = useMemo(
    () => insights.filter((i) => i.severity === "alert" || i.severity === "warning" || i.severity === "recommendation"),
    [insights],
  );
  const wins = useMemo(() => insights.filter((i) => i.severity === "celebration"), [insights]);

  const tasks = useMemo(() => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return [...(tasksQ.data ?? [])].sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (ad !== bd) return ad - bd; // soonest due first
      return rank[a.priority] - rank[b.priority];
    });
  }, [tasksQ.data]);

  const stats = statsQ.data;
  const activity = activityQ.data ?? [];
  const isLoading = insightsQ.isLoading || tasksQ.isLoading;

  // "N things need you" = action-required insights + overdue tasks.
  const needYou = needsAction.length + (stats?.overdue ?? 0);

  const firstName = (user?.name ?? "").trim().split(" ")[0] || "there";

  const openInsight = (i: (typeof insights)[number]) => {
    if (i.action?.href) navigate(i.action.href);
    else if (i.metadata?.gpId) setDrawerGpId(i.metadata.gpId);
  };

  return (
    <div className="space-y-6 p-4 md:p-6 animate-fade-in">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        subtitle={
          isLoading
            ? "Pulling together your day…"
            : needYou > 0
              ? `${needYou} thing${needYou === 1 ? "" : "s"} need${needYou === 1 ? "s" : ""} you today.`
              : "You're all caught up. Nothing needs you right now. ✨"
        }
        icon={Sun}
      />

      {/* quick stat strip */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatChip icon={AlertTriangle} label="Needs action" value={needsAction.length} tone="rose" />
          <StatChip icon={ListChecks} label="Open tasks" value={(stats?.open ?? 0) + (stats?.inProgress ?? 0)} tone="sky" />
          <StatChip icon={CalendarClock} label="Overdue" value={stats?.overdue ?? 0} tone="amber" />
          <StatChip icon={TrendingUp} label="Recent wins" value={wins.length} tone="emerald" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Needs action */}
          <Section title="Needs action" icon={Zap} count={needsAction.length}>
            {isLoading ? (
              <LoadingRows />
            ) : needsAction.length === 0 ? (
              <EmptyState icon={CheckCircle2} size="compact" title="All clear" description="No alerts or recommendations right now." />
            ) : (
              <div className="space-y-2">
                {needsAction.map((i) => {
                  const meta = SEVERITY_META[i.severity as Severity] ?? SEVERITY_META.info;
                  const Icon = meta.icon;
                  return (
                    <div key={i.id} className={`flex items-start gap-3 rounded-xl border p-3 ${meta.ring}`}>
                      <span className={`mt-0.5 shrink-0 h-8 w-8 rounded-lg border flex items-center justify-center ${meta.chip}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-foreground">{i.title}</p>
                        <p className="text-sm text-muted-foreground">{i.description}</p>
                        {i.metadata?.gpName && (
                          <button
                            onClick={() => i.metadata?.gpId && setDrawerGpId(i.metadata.gpId)}
                            className="text-xs text-primary hover:underline mt-0.5 inline-flex items-center gap-1"
                          >
                            <User className="h-3 w-3" /> {i.metadata.gpName}
                          </button>
                        )}
                      </div>
                      {(i.action?.href || i.metadata?.gpId) && (
                        <Button size="sm" variant="outline" className="shrink-0" onClick={() => openInsight(i)}>
                          {i.action?.label ?? "Open"}
                          <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* My coaching tasks */}
          <Section
            title="My coaching tasks"
            icon={ListChecks}
            count={tasks.length}
            badge={stats?.overdue ? `${stats.overdue} overdue` : undefined}
          >
            {isLoading ? (
              <LoadingRows />
            ) : tasks.length === 0 ? (
              <EmptyState icon={Sparkles} size="compact" title="No open tasks" description="Coaching items you create or accept from AI suggestions show up here." />
            ) : (
              <div className="space-y-2">
                {tasks.map((t) => {
                  const overdue = t.dueDate && new Date(t.dueDate) < new Date();
                  const pr = PRIORITY_META[t.priority];
                  return (
                    <div key={t.id} className="flex items-start gap-3 rounded-xl border bg-card p-3 hover:bg-muted/30 transition-colors">
                      <button
                        onClick={() => completeTask.mutate({ id: t.id })}
                        disabled={completeTask.isPending}
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600 transition-colors"
                        aria-label="Mark done"
                      >
                        <Circle className="h-5 w-5" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-foreground">{t.title}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <button
                            onClick={() => setDrawerGpId(t.gamePresenterId)}
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <User className="h-3 w-3" /> {t.gamePresenter?.name ?? "GP"}
                          </button>
                          <Badge variant="outline" className={`text-[10px] ${pr.chip}`}>{pr.label}</Badge>
                          {t.dueDate && (
                            <Badge variant="outline" className={`text-[10px] ${overdue ? "text-rose-700 border-rose-200 bg-rose-50" : "text-muted-foreground"}`}>
                              {overdue ? "Overdue " : "Due "}{relTime(t.dueDate)}
                            </Badge>
                          )}
                          {t.source === "ai_insight" && (
                            <Badge variant="outline" className="text-[10px] text-violet-700 border-violet-200 bg-violet-50">AI</Badge>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => completeTask.mutate({ id: t.id })} disabled={completeTask.isPending}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Done
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        {/* side column */}
        <div className="space-y-6">
          {/* Wins */}
          {wins.length > 0 && (
            <Section title="Recent wins" icon={TrendingUp} count={wins.length}>
              <div className="space-y-2">
                {wins.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => w.metadata?.gpId && setDrawerGpId(w.metadata.gpId)}
                    className="w-full text-left flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 hover:bg-emerald-50 transition-colors"
                  >
                    <TrendingUp className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-emerald-900">{w.title}</p>
                      <p className="text-xs text-emerald-700/80">{w.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Activity */}
          <Section title="Just happened" icon={Activity} count={activity.length}>
            {activityQ.isLoading ? (
              <LoadingRows rows={3} />
            ) : activity.length === 0 ? (
              <EmptyState icon={Activity} size="compact" title="Quiet so far" description="Uploads, reports and syncs will show up here." />
            ) : (
              <div className="space-y-1">
                {activity.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => a.href && navigate(a.href)}
                    className="w-full text-left flex items-start gap-2.5 rounded-lg p-2 hover:bg-muted/50 transition-colors"
                  >
                    <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                      a.status === "failed" ? "bg-rose-500" : a.status === "partial" ? "bg-amber-500" : "bg-emerald-500"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{a.title}</p>
                      {a.detail && <p className="text-xs text-muted-foreground truncate">{a.detail}</p>}
                      <p className="text-[11px] text-muted-foreground/70">{relTime(a.timestamp)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      <GPDetailDrawer gpId={drawerGpId} open={drawerGpId !== null} onOpenChange={(o) => { if (!o) setDrawerGpId(null); }} />
    </div>
  );
}

// ---- small building blocks --------------------------------------------------

function Section({ title, icon: Icon, count, badge, children }: {
  title: string; icon: React.ElementType; count?: number; badge?: string; children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">{title}</h3>
          {typeof count === "number" && count > 0 && (
            <Badge variant="outline" className="text-[10px] border-primary/20 text-primary">{count}</Badge>
          )}
        </div>
        {badge && <Badge variant="outline" className="text-[10px] text-rose-700 border-rose-200 bg-rose-50">{badge}</Badge>}
      </div>
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  );
}

function StatChip({ icon: Icon, label, value, tone }: {
  icon: React.ElementType; label: string; value: number; tone: "rose" | "sky" | "amber" | "emerald";
}) {
  const toneMap = {
    rose: "text-rose-600 bg-rose-50 border-rose-200",
    sky: "text-sky-600 bg-sky-50 border-sky-200",
    amber: "text-amber-600 bg-amber-50 border-amber-200",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-200",
  } as const;
  return (
    <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
      <span className={`h-9 w-9 rounded-lg border flex items-center justify-center ${toneMap[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
    </div>
  );
}
