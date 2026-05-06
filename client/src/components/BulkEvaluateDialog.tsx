/**
 * BulkEvaluateDialog — "Shift Recap" mode for the Workspace.
 *
 * Use case: at the end of a shift the FM has just observed 5–10 GPs
 * and needs to record evaluations for all of them. The single-GP
 * Quick Evaluate is already 30 sec/GP, but switching between GPs
 * loses the shift context and forces 6 separate score-rows per GP.
 *
 * This dialog lays out one row per GP, with all 6 criteria as
 * inline button strips. The FM ticks scores down the column,
 * adds an optional bulk-comment template, and submits all matching
 * rows in one batch via `evaluation.create` calls in parallel.
 *
 * Behaviour:
 *  - Only rows with all 6 criteria scored are submitted (the rest are
 *    treated as "not on shift today", no eval created for them).
 *  - Pre-fill: each row's defaults come from the GP's `suggestedScores`
 *    (server-side weighted average of last 3 evals) so stable GPs
 *    are essentially one-click confirm.
 *  - Submit creates evals concurrently and reports success/fail
 *    counts. Partial failures keep the rest visible so the FM can
 *    retry specific rows.
 *  - Hot-key arrow-keys navigate between rows and criteria.
 */

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Calendar, Users, ChevronDown, ChevronUp, Eraser, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type CadenceGP = {
  gpId: number;
  gpName: string;
  urgency: "never" | "overdue" | "due-soon" | "fresh";
  daysSince: number | null;
  suggestedScores: {
    hair: number | null;
    makeup: number | null;
    outfit: number | null;
    posture: number | null;
    dealing: number | null;
    perf: number | null;
    sampleSize: number;
    confidence: "low" | "medium" | "high";
  } | null;
  lastSubscores: {
    hair: number | null;
    makeup: number | null;
    outfit: number | null;
    posture: number | null;
    dealing: number | null;
    perf: number | null;
  } | null;
};

type CK = "hair" | "makeup" | "outfit" | "posture" | "dealing" | "perf";
const CRIT: Array<{ key: CK; label: string; max: number }> = [
  { key: "hair", label: "Hair", max: 3 },
  { key: "makeup", label: "Mkup", max: 3 },
  { key: "outfit", label: "Outf", max: 3 },
  { key: "posture", label: "Post", max: 3 },
  { key: "dealing", label: "Deal", max: 5 },
  { key: "perf", label: "Perf", max: 5 },
];

type RowState = {
  hair: number | null;
  makeup: number | null;
  outfit: number | null;
  posture: number | null;
  dealing: number | null;
  perf: number | null;
  game: string;
};

const EMPTY_ROW: RowState = {
  hair: null, makeup: null, outfit: null, posture: null, dealing: null, perf: null, game: "",
};

export function BulkEvaluateButton({
  gps,
  evaluatorName,
  onCommitted,
}: {
  gps: CadenceGP[];
  evaluatorName: string;
  onCommitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={gps.length === 0}
        onClick={() => setOpen(true)}
      >
        <Users className="h-3.5 w-3.5" />
        Bulk evaluate
      </Button>
      {open && (
        <BulkEvaluateDialog
          gps={gps}
          evaluatorName={evaluatorName}
          onClose={() => setOpen(false)}
          onCommitted={() => {
            onCommitted();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function BulkEvaluateDialog({
  gps,
  evaluatorName,
  onClose,
  onCommitted,
}: {
  gps: CadenceGP[];
  evaluatorName: string;
  onClose: () => void;
  onCommitted: () => void;
}) {
  // Today's date in YYYY-MM-DD for the date picker.
  const [evalDate, setEvalDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [evaluator, setEvaluator] = useState<string>(evaluatorName);
  const [game, setGame] = useState<string>("");

  // Per-row state. Default: pre-fill from suggestedScores when
  // available, falling back to lastSubscores. Empty when neither.
  const initialRows = useMemo<Record<number, RowState>>(() => {
    const out: Record<number, RowState> = {};
    for (const gp of gps) {
      const s = gp.suggestedScores;
      const fallback = gp.lastSubscores;
      out[gp.gpId] = {
        hair: s?.hair ?? fallback?.hair ?? null,
        makeup: s?.makeup ?? fallback?.makeup ?? null,
        outfit: s?.outfit ?? fallback?.outfit ?? null,
        posture: s?.posture ?? fallback?.posture ?? null,
        dealing: s?.dealing ?? fallback?.dealing ?? null,
        perf: s?.perf ?? fallback?.perf ?? null,
        game: "",
      };
    }
    return out;
  }, [gps]);

  const [rows, setRows] = useState<Record<number, RowState>>(initialRows);
  const [included, setIncluded] = useState<Set<number>>(new Set()); // GPs FM is actually scoring this round
  const [submitting, setSubmitting] = useState(false);
  const [submitResults, setSubmitResults] = useState<{ ok: number; failed: number; errors: Array<{ gpName: string; error: string }> } | null>(null);
  const [showOnlyOverdue, setShowOnlyOverdue] = useState(true);

  const createMutation = trpc.evaluation.create.useMutation();

  const visibleGps = useMemo(() => {
    if (showOnlyOverdue) {
      return gps.filter(g => g.urgency === "never" || g.urgency === "overdue" || g.urgency === "due-soon");
    }
    return gps;
  }, [gps, showOnlyOverdue]);

  const setScore = useCallback((gpId: number, key: CK, value: number) => {
    setRows(prev => ({
      ...prev,
      [gpId]: { ...prev[gpId], [key]: value },
    }));
    setIncluded(prev => new Set(prev).add(gpId));
  }, []);

  const clearRow = useCallback((gpId: number) => {
    setRows(prev => ({ ...prev, [gpId]: { ...EMPTY_ROW } }));
    setIncluded(prev => {
      const n = new Set(prev);
      n.delete(gpId);
      return n;
    });
  }, []);

  const restoreSuggested = useCallback((gpId: number) => {
    const original = initialRows[gpId];
    if (original) {
      setRows(prev => ({ ...prev, [gpId]: { ...original, game: prev[gpId]?.game ?? "" } }));
    }
  }, [initialRows]);

  // Eligibility: a row is submittable when it's INCLUDED (FM
  // explicitly scored at least one criterion this round) AND every
  // one of the 6 criteria has a numeric score.
  const submittable = useMemo(() => {
    const out: number[] = [];
    for (const gpId of Array.from(included)) {
      const r = rows[gpId];
      if (!r) continue;
      const allSet = CRIT.every(c => typeof r[c.key] === "number" && (r[c.key] as number) >= 0);
      if (allSet) out.push(gpId);
    }
    return out;
  }, [rows, included]);

  const handleSubmit = useCallback(async () => {
    if (submittable.length === 0) {
      toast.error("Score every criterion for at least one GP before submitting.");
      return;
    }
    setSubmitting(true);
    setSubmitResults(null);
    const date = new Date(evalDate);
    const errors: Array<{ gpName: string; error: string }> = [];
    let ok = 0;
    // Concurrent creates — server enforces ownership and computes
    // totalScore on its own, so we can fan out without coordination.
    await Promise.all(submittable.map(async (gpId) => {
      const r = rows[gpId];
      const gp = gps.find(g => g.gpId === gpId);
      if (!r || !gp) return;
      try {
        await createMutation.mutateAsync({
          gamePresenterId: gpId,
          evaluatorName: evaluator || undefined,
          evaluationDate: date,
          game: r.game || game || undefined,
          hairScore: r.hair ?? undefined,
          makeupScore: r.makeup ?? undefined,
          outfitScore: r.outfit ?? undefined,
          postureScore: r.posture ?? undefined,
          dealingStyleScore: r.dealing ?? undefined,
          gamePerformanceScore: r.perf ?? undefined,
        });
        ok++;
      } catch (e: any) {
        errors.push({ gpName: gp.gpName, error: e?.message || "Unknown error" });
      }
    }));
    setSubmitting(false);
    setSubmitResults({ ok, failed: errors.length, errors });
    if (ok > 0) toast.success(`Submitted ${ok} evaluation${ok === 1 ? "" : "s"}`);
    if (errors.length > 0) toast.error(`${errors.length} failed — see details below`);
    if (errors.length === 0 && ok > 0) {
      // Clear the included set so the FM doesn't accidentally re-submit.
      setIncluded(new Set());
      onCommitted();
    }
  }, [submittable, rows, gps, evalDate, evaluator, game, createMutation, onCommitted]);

  const totalEvalsToSubmit = submittable.length;
  const partial = Array.from(included).length - totalEvalsToSubmit;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Bulk evaluate — Shift recap
          </DialogTitle>
          <DialogDescription>
            Score every GP you observed on this shift. Rows you don&apos;t touch stay unsubmitted. Defaults come from each GP&apos;s last 3 evals.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-2">
          <label className="flex items-center gap-2 text-xs">
            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <Input
              type="date"
              value={evalDate}
              onChange={(e) => setEvalDate(e.target.value)}
              className="h-8 text-xs"
            />
          </label>
          <Input
            placeholder="Evaluator name (optional)"
            value={evaluator}
            onChange={(e) => setEvaluator(e.target.value)}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Default game (optional, applies to rows without per-row game)"
            value={game}
            onChange={(e) => setGame(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div className="flex items-center justify-between gap-2 pb-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <button
              type="button"
              onClick={() => setShowOnlyOverdue(s => !s)}
              className="text-amber-700 hover:underline"
            >
              {showOnlyOverdue ? `Showing ${visibleGps.length} due / overdue · show all (${gps.length})` : `Showing all ${gps.length} · only show due / overdue`}
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700">{totalEvalsToSubmit} ready</Badge>
            {partial > 0 && (
              <Badge className="bg-amber-50 border-amber-200 text-amber-700">{partial} incomplete</Badge>
            )}
          </div>
        </div>

        {/* Eval grid — one row per GP. Sticky-ish header for criteria. */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="text-left px-2 py-2 font-semibold text-slate-600 min-w-[140px]">GP</th>
                {CRIT.map(c => (
                  <th key={c.key} className="px-1 py-2 font-semibold text-slate-600 text-center">
                    {c.label}
                    <span className="block text-[9px] font-normal text-slate-400">/{c.max}</span>
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold text-slate-600 text-center min-w-[80px]">Total</th>
                <th className="px-2 py-2 text-center w-12"></th>
              </tr>
            </thead>
            <tbody>
              {visibleGps.map((gp, idx) => {
                const r = rows[gp.gpId] ?? EMPTY_ROW;
                const isIncluded = included.has(gp.gpId);
                const allSet = CRIT.every(c => typeof r[c.key] === "number");
                const total = CRIT.reduce((s, c) => s + (Number(r[c.key]) || 0), 0);
                const rowState = isIncluded
                  ? (allSet ? "ready" : "partial")
                  : "untouched";
                const rowClass = rowState === "ready"
                  ? "bg-emerald-50/40"
                  : rowState === "partial"
                    ? "bg-amber-50/40"
                    : idx % 2 === 0 ? "bg-white" : "bg-slate-50/40";
                return (
                  <tr key={gp.gpId} className={`border-b border-slate-100 ${rowClass}`}>
                    <td className="px-2 py-2 font-medium text-slate-800">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          gp.urgency === "overdue" || gp.urgency === "never" ? "bg-rose-500" :
                            gp.urgency === "due-soon" ? "bg-amber-500" : "bg-emerald-500"
                        }`} />
                        <span className="truncate">{gp.gpName}</span>
                      </div>
                      {gp.suggestedScores && gp.suggestedScores.sampleSize > 0 && (
                        <span className="text-[9px] text-slate-400 ml-3">
                          based on {gp.suggestedScores.sampleSize} prev
                        </span>
                      )}
                    </td>
                    {CRIT.map(c => (
                      <td key={c.key} className="px-1 py-1.5 text-center">
                        <CompactScorePicker
                          value={r[c.key] as number | null}
                          max={c.max}
                          onPick={(v) => setScore(gp.gpId, c.key, v)}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center font-bold tabular-nums">
                      {isIncluded ? total : "—"}
                    </td>
                    <td className="px-1 py-1 text-center">
                      <div className="inline-flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => restoreSuggested(gp.gpId)}
                          title="Restore suggested scores"
                          className="h-5 w-5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => clearRow(gp.gpId)}
                          title="Skip this GP"
                          className="h-5 w-5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                        >
                          <Eraser className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {submitResults && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">{submitResults.ok} submitted</Badge>
              {submitResults.failed > 0 && (
                <Badge className="bg-rose-100 text-rose-800 border-rose-300">{submitResults.failed} failed</Badge>
              )}
            </div>
            {submitResults.errors.length > 0 && (
              <ul className="list-disc list-inside text-rose-700">
                {submitResults.errors.slice(0, 5).map((e, i) => (
                  <li key={i}><strong>{e.gpName}</strong>: {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Close
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || totalEvalsToSubmit === 0}
            className="gap-1.5"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit {totalEvalsToSubmit} evaluation{totalEvalsToSubmit === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompactScorePicker({ value, max, onPick }: { value: number | null; max: number; onPick: (v: number) => void }) {
  // 0..max inclusive — small button strip. Max=3 -> 4 buttons.
  // Max=5 -> 6 buttons. Compressed for table use.
  const buttons = Array.from({ length: max + 1 }, (_, i) => i);
  return (
    <div className="inline-flex gap-0.5 justify-center">
      {buttons.map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          className={`h-6 w-6 text-[10px] font-bold rounded border transition-colors tabular-nums ${
            value === n
              ? "bg-primary text-white border-primary shadow-sm"
              : "bg-white text-slate-500 border-slate-200 hover:border-primary/40 hover:bg-primary/5"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
