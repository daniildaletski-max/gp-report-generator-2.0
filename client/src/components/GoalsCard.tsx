import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Target, Loader2, Settings2, CheckCircle2, AlertTriangle, Gauge } from "lucide-react";
import { MONTH_NAMES } from "@shared/const";

/**
 * Monthly goals — the management-targets card. Shows each tracked metric
 * with its live actual, a progress bar, and an on-track/at-risk status
 * chip; admins set the targets inline via the dialog. Company-wide (one
 * shared database), period follows the host page's month/year selection.
 */

type GoalStatus = "achieved" | "on_track" | "at_risk" | "behind";

const STATUS_STYLE: Record<GoalStatus, { chip: string; bar: string; label: string }> = {
  achieved: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", label: "Achieved" },
  on_track: { chip: "bg-sky-50 text-sky-700 border-sky-200", bar: "bg-sky-500", label: "On track" },
  at_risk: { chip: "bg-amber-50 text-amber-700 border-amber-200", bar: "bg-amber-500", label: "At risk" },
  behind: { chip: "bg-rose-50 text-rose-700 border-rose-200", bar: "bg-rose-500", label: "Behind" },
};

function StatusChip({ status }: { status: GoalStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${s.chip}`}>
      {status === "achieved" ? <CheckCircle2 className="h-3 w-3" /> : status === "behind" || status === "at_risk" ? <AlertTriangle className="h-3 w-3" /> : <Gauge className="h-3 w-3" />}
      {s.label}
    </span>
  );
}

export function GoalsCard({ month, year }: { month: number; year: number }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.goals.overview.useQuery({ month, year });
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card variant="glass">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
              <Target className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base">Monthly goals</CardTitle>
              <CardDescription className="text-xs">
                {MONTH_NAMES[month - 1]} {year} · {data ? `${data.elapsedPct}% of the month gone` : "…"}
                {data?.isDefault && " · default targets"}
              </CardDescription>
            </div>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setEditOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" />
              Set targets
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : data.progress.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No goals tracked this month{isAdmin ? " — set targets to start." : "."}
          </p>
        ) : (
          data.progress.map(item => (
            <div key={item.key}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {item.unit === "%" ? `${item.actual}%` : item.actual}
                    <span className="text-xs text-muted-foreground font-normal">
                      {" "}/ {item.unit === "%" ? `${item.target}%` : item.target}
                    </span>
                  </span>
                  <StatusChip status={item.status as GoalStatus} />
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${STATUS_STYLE[item.status as GoalStatus].bar}`}
                  style={{ width: `${Math.min(100, item.pct)}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{item.detail}</p>
            </div>
          ))
        )}
        {data?.notes && (
          <p className="text-xs text-muted-foreground border-t border-border pt-3">{data.notes}</p>
        )}
      </CardContent>

      {isAdmin && (
        <GoalsEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          month={month}
          year={year}
          current={data ?? null}
          onSaved={() => {
            utils.goals.overview.invalidate();
            utils.dashboard.insights.invalidate();
          }}
        />
      )}
    </Card>
  );
}

function GoalsEditDialog({
  open, onOpenChange, month, year, current, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  month: number;
  year: number;
  current: { targets: { targetAvgScore: number | null; targetCoveragePct: number | null; targetEvalsPerGp: number; targetMaxMistakes: number | null }; notes: string | null } | null;
  onSaved: () => void;
}) {
  // Local string state so fields can be cleared (= stop tracking).
  const [avgScore, setAvgScore] = useState<string>(current?.targets.targetAvgScore?.toString() ?? "18");
  const [coverage, setCoverage] = useState<string>(current?.targets.targetCoveragePct?.toString() ?? "80");
  const [evalsPerGp, setEvalsPerGp] = useState<string>(current?.targets.targetEvalsPerGp?.toString() ?? "10");
  const [maxMistakes, setMaxMistakes] = useState<string>(current?.targets.targetMaxMistakes?.toString() ?? "");

  const update = trpc.goals.update.useMutation({
    onSuccess: () => {
      toast.success("Targets saved");
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const numOrNull = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const onSave = () => {
    const evals = numOrNull(evalsPerGp);
    update.mutate({
      month,
      year,
      targetAvgScore: numOrNull(avgScore),
      targetCoveragePct: numOrNull(coverage) == null ? null : Math.round(numOrNull(coverage)!),
      ...(evals != null ? { targetEvalsPerGp: Math.round(evals) } : {}),
      targetMaxMistakes: numOrNull(maxMistakes) == null ? null : Math.round(numOrNull(maxMistakes)!),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Targets — {MONTH_NAMES[month - 1]} {year}</DialogTitle>
          <DialogDescription>
            Company-wide targets for the month. Leave a field empty to stop tracking that metric.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Average score <span className="text-muted-foreground font-normal">/22</span></label>
              <Input type="number" step="0.1" min="1" max="22" value={avgScore} onChange={e => setAvgScore(e.target.value)} placeholder="e.g. 18" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Coverage <span className="text-muted-foreground font-normal">%</span></label>
              <Input type="number" step="1" min="1" max="100" value={coverage} onChange={e => setCoverage(e.target.value)} placeholder="e.g. 80" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Evals per GP</label>
              <Input type="number" step="1" min="1" max="100" value={evalsPerGp} onChange={e => setEvalsPerGp(e.target.value)} placeholder="10" />
              <p className="text-[11px] text-muted-foreground">Evals a GP needs to count as covered.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mistakes ceiling</label>
              <Input type="number" step="1" min="0" max="100" value={maxMistakes} onChange={e => setMaxMistakes(e.target.value)} placeholder="off" />
              <p className="text-[11px] text-muted-foreground">Max mistakes any single GP may have.</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={update.isPending} className="gap-1.5">
            {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save targets
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Compact current-month strip for the Command Center: one chip per
 * tracked metric. Quiet when everything is on track; loud (amber/rose)
 * the moment a goal slips.
 */
export function GoalsStrip() {
  const { data } = trpc.goals.overview.useQuery(undefined, { staleTime: 60_000 });
  if (!data || data.progress.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-xl border border-border bg-card px-3 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 mr-1">
        <Target className="h-3.5 w-3.5 text-primary" /> Goals
      </span>
      {data.progress.map(item => {
        const s = STATUS_STYLE[item.status as GoalStatus];
        return (
          <span key={item.key} className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border ${s.chip}`}>
            {item.label}:
            <span className="tabular-nums font-semibold">
              {item.unit === "%" ? `${item.actual}%` : item.actual}/{item.unit === "%" ? `${item.target}%` : item.target}
            </span>
          </span>
        );
      })}
      <span className="ml-auto text-[10px] text-muted-foreground tabular-nums hidden sm:inline">
        {data.elapsedPct}% of month
      </span>
    </div>
  );
}
