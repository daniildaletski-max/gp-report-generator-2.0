import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { QueryError } from "@/components/QueryError";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GPDetailDrawer } from "@/components/GPDetailDrawer";
import { QuickEvalDialog } from "@/components/QuickEvalDialog";
import { formatDistanceToNow } from "date-fns";
import { MONTH_NAMES } from "@shared/const";
import {
  Sun, CheckCircle2, Circle, User, ListChecks, Zap, Sparkles,
  ClipboardCheck, CalendarClock, ArrowRight, Trophy,
} from "lucide-react";

/**
 * Today — the personal "do the work" surface. Deliberately NOT a second
 * dashboard: the Dashboard already shows the greeting, "what needs your
 * attention" insights and the activity feed. Today is action-first and
 * complements it with the two things that page can't do inline:
 *   1. Evaluations to do — the month's pending GPs (the core pain: only a
 *      fraction are evaluated), each knocked out with Quick-eval in seconds.
 *   2. My coaching tasks — open action items, completed inline.
 *
 * Reuses existing endpoints (evaluation.coverage, actionItems.list/stats/
 * complete) + the shared GPDetailDrawer and QuickEvalDialog.
 */

const EVAL_TARGET = 10; // a GP is "complete" for the month at >= 10 evals

type PendingGp = {
  gpId: number;
  gpName: string;
  teamName: string;
  evalCount: number;
  status: "missing" | "partial" | "complete";
};

export default function Today() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [drawerGpId, setDrawerGpId] = useState<number | null>(null);
  const [quickEval, setQuickEval] = useState<{ id: number; name?: string } | null>(null);

  const coverageQ = trpc.evaluation.coverage.useQuery({ month, year }, { staleTime: 60_000 });
  const tasksQ = trpc.actionItems.list.useQuery({}, { staleTime: 30_000 });
  const statsQ = trpc.actionItems.stats.useQuery({}, { staleTime: 30_000 });

  const completeTask = trpc.actionItems.complete.useMutation({
    onSuccess: () => {
      utils.actionItems.list.invalidate();
      utils.actionItems.stats.invalidate();
      toast.success("Nice — marked done");
    },
    onError: (e) => toast.error("Could not update: " + e.message),
  });

  // Flatten coverage → totals + the pending queue (missing first, then the
  // GPs furthest from target).
  const { totalGps, completeGps, pending } = useMemo(() => {
    const teams = coverageQ.data ?? [];
    let total = 0;
    let complete = 0;
    const q: PendingGp[] = [];
    for (const team of teams) {
      total += team.summary.total;
      complete += team.summary.complete;
      for (const gp of team.gps) {
        if (gp.status !== "complete") {
          q.push({ gpId: gp.gpId, gpName: gp.gpName, teamName: team.teamName, evalCount: gp.evalCount, status: gp.status });
        }
      }
    }
    const rank = { missing: 0, partial: 1, complete: 2 } as const;
    q.sort((a, b) => (rank[a.status] - rank[b.status]) || (a.evalCount - b.evalCount) || a.gpName.localeCompare(b.gpName));
    return { totalGps: total, completeGps: complete, pending: q };
  }, [coverageQ.data]);

  const tasks = useMemo(() => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return [...(tasksQ.data ?? [])].sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return rank[a.priority] - rank[b.priority];
    });
  }, [tasksQ.data]);

  const stats = statsQ.data;
  const isLoading = coverageQ.isLoading || tasksQ.isLoading;
  const isError = coverageQ.isError || tasksQ.isError || statsQ.isError;
  const retryAll = () => { coverageQ.refetch(); tasksQ.refetch(); statsQ.refetch(); };
  const firstName = (user?.name ?? "").trim().split(" ")[0] || "there";
  const pct = totalGps > 0 ? Math.round((completeGps / totalGps) * 100) : 0;

  // Quick-eval invalidates coverage so a GP's progress updates live.
  const onEvalSaved = () => utils.evaluation.coverage.invalidate();

  return (
    <div className="space-y-6 p-4 md:p-6 animate-fade-in">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        subtitle={
          isLoading
            ? "Pulling together your work…"
            : pending.length === 0
              ? `Every GP is fully evaluated for ${MONTH_NAMES[month - 1]}. ✨`
              : `${pending.length} GP${pending.length === 1 ? "" : "s"} still need evaluations this month.`
        }
        icon={Sun}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/assistant")}>
              <Sparkles className="h-4 w-4 mr-1.5 text-primary" /> Ask AI
            </Button>
            {pending.length > 0 && (
              <Button size="sm" onClick={() => setQuickEval({ id: pending[0].gpId, name: pending[0].gpName })}>
                <Zap className="h-4 w-4 mr-1.5" /> Evaluate next
              </Button>
            )}
          </div>
        }
      />

      {isError && (
        <Card><CardContent className="p-0"><QueryError title="Couldn't load your day" onRetry={retryAll} /></CardContent></Card>
      )}

      {/* progress strip */}
      {!isError && !isLoading && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                {MONTH_NAMES[month - 1]} {year} — evaluation progress
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {completeGps}/{totalGps} complete · {pct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      {!isError && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Evaluations to do */}
        <div className="lg:col-span-2">
          <Section title="Evaluations to do" icon={ClipboardCheck} count={pending.length}>
            {isLoading ? (
              <LoadingRows />
            ) : pending.length === 0 ? (
              <EmptyState icon={Trophy} size="compact" title="All evaluated" description={`Every GP has reached ${EVAL_TARGET} evaluations this month. Great work.`} />
            ) : (
              <div className="space-y-2">
                {pending.map((p) => (
                  <div key={p.gpId} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/30 transition-colors">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{p.gpName.charAt(0)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <button onClick={() => setDrawerGpId(p.gpId)} className="font-medium text-sm text-foreground hover:text-primary hover:underline truncate block text-left">
                        {p.gpName}
                      </button>
                      <p className="text-xs text-muted-foreground truncate">{p.teamName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20 hidden sm:block">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[11px] tabular-nums text-muted-foreground">{p.evalCount}/{EVAL_TARGET}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                          <div className={`h-full rounded-full ${p.status === "missing" ? "bg-rose-400" : "bg-amber-400"}`} style={{ width: `${Math.min(100, (p.evalCount / EVAL_TARGET) * 100)}%` }} />
                        </div>
                      </div>
                      <Button size="sm" onClick={() => setQuickEval({ id: p.gpId, name: p.gpName })}>
                        <Zap className="h-4 w-4 mr-1" /> Evaluate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* My coaching tasks */}
        <div>
          <Section
            title="My coaching tasks"
            icon={ListChecks}
            count={tasks.length}
            badge={stats?.overdue ? `${stats.overdue} overdue` : undefined}
          >
            {isLoading ? (
              <LoadingRows rows={3} />
            ) : tasks.length === 0 ? (
              <EmptyState icon={Sparkles} size="compact" title="No open tasks" description="Coaching items you create or accept from AI suggestions show up here." />
            ) : (
              <div className="space-y-2">
                {tasks.map((t) => {
                  const overdue = t.dueDate && new Date(t.dueDate) < new Date();
                  return (
                    <div key={t.id} className="flex items-start gap-2.5 rounded-xl border bg-card p-3">
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
                          <button onClick={() => setDrawerGpId(t.gamePresenterId)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                            <User className="h-3 w-3" /> {t.gamePresenter?.name ?? "GP"}
                          </button>
                          {t.dueDate && (
                            <Badge variant="outline" className={`text-[10px] ${overdue ? "text-rose-700 border-rose-200 bg-rose-50" : "text-muted-foreground"}`}>
                              <CalendarClock className="h-3 w-3 mr-1" />{overdue ? "Overdue " : "Due "}{relTime(t.dueDate)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => completeTask.mutate({ id: t.id })} disabled={completeTask.isPending}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      </div>
      )}

      <GPDetailDrawer gpId={drawerGpId} open={drawerGpId !== null} onOpenChange={(o) => { if (!o) setDrawerGpId(null); }} />

      <QuickEvalDialog
        gpId={quickEval?.id ?? null}
        gpName={quickEval?.name}
        open={quickEval !== null}
        onOpenChange={(o) => { if (!o) setQuickEval(null); }}
        onSaved={onEvalSaved}
      />
    </div>
  );
}

// ---- helpers ----------------------------------------------------------------

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

function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
    </div>
  );
}
