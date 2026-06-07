import { useState, useMemo, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";
import { QueryError } from "@/components/QueryError";
import { toast } from "sonner";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { MONTH_NAMES } from "@shared/const";
import {
  BadgeEuro, Save, Loader2, TrendingUp, AlertTriangle, Info,
  Trophy, Target, Gamepad2, Clock, Ban,
} from "lucide-react";

type BonusRow = {
  gpId: number;
  gpName: string;
  totalGames: number;
  mistakes: number;
  workedHours: number;
  hoursSource: "recorded" | "estimated";
  ggs: number;
  level: "level1" | "level2" | "ineligible";
  rate: number;
  amount: number;
  isEligible: boolean;
  minimumGGsRequired: number;
  disqualifyingFactors: string[];
  gapToNext: { target: "level1" | "level2"; gapGGs: number } | null;
};

const eur = (n: number) => `€${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString();

function LevelBadge({ level }: { level: BonusRow["level"] }) {
  if (level === "level2") return <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1"><Trophy className="h-3 w-3" /> Level 2</Badge>;
  if (level === "level1") return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"><TrendingUp className="h-3 w-3" /> Level 1</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Not eligible</Badge>;
}

export default function BonusPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  // Inline edits keyed by gpId — dirty until saved.
  const [edits, setEdits] = useState<Record<number, { totalGames?: number; workedHours?: number }>>({});

  const utils = trpc.useUtils();
  useLiveEvents();

  // One shared database — the bonus board covers every GP company-wide.
  const { data, isLoading, isError, refetch } = trpc.bonus.list.useQuery({ month, year });
  const rows = (data ?? []) as BonusRow[];

  // Reset pending edits when the filter changes (avoids stale saves).
  useEffect(() => { setEdits({}); }, [month, year]);

  const updateStats = trpc.gamePresenter.updateStats.useMutation();

  const dirtyIds = useMemo(() => Object.keys(edits).map(Number).filter(id => {
    const e = edits[id];
    return e && (e.totalGames !== undefined || e.workedHours !== undefined);
  }), [edits]);

  const onEdit = (gpId: number, field: "totalGames" | "workedHours", value: string) => {
    setEdits(prev => {
      const next = { ...prev, [gpId]: { ...prev[gpId] } };
      if (value === "") { delete next[gpId][field]; }
      else {
        const n = Math.max(0, Math.floor(Number(value)));
        if (Number.isFinite(n)) next[gpId][field] = n;
      }
      return next;
    });
  };

  const [saving, setSaving] = useState(false);
  const onSave = useCallback(async () => {
    if (dirtyIds.length === 0) return;
    setSaving(true);
    let ok = 0, failed = 0;
    for (const gpId of dirtyIds) {
      const e = edits[gpId];
      try {
        await updateStats.mutateAsync({
          gpId, month, year,
          ...(e.totalGames !== undefined ? { totalGames: e.totalGames } : {}),
          ...(e.workedHours !== undefined ? { workedHours: e.workedHours } : {}),
        });
        ok++;
      } catch { failed++; }
    }
    setSaving(false);
    setEdits({});
    await utils.bonus.list.invalidate();
    await refetch();
    if (failed === 0) toast.success(`Saved bonus inputs for ${ok} GP${ok === 1 ? "" : "s"}`);
    else toast.error(`Saved ${ok}, ${failed} failed`);
  }, [dirtyIds, edits, month, year, updateStats, utils, refetch]);

  // Summary
  const summary = useMemo(() => {
    let payout = 0, l1 = 0, l2 = 0, eligible = 0;
    for (const r of rows) {
      payout += r.amount;
      if (r.level === "level1") l1++;
      if (r.level === "level2") l2++;
      if (r.isEligible) eligible++;
    }
    return { payout, l1, l2, eligible, total: rows.length };
  }, [rows]);

  const monthSel = (
    <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
      <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const yearSel = (
    <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
      <SelectTrigger className="h-9 w-[100px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Performance Bonus"
        subtitle="GGs → level → €/hour, computed from games, mistakes and worked hours."
        icon={BadgeEuro}
        actions={
          <>
            {monthSel}
            {yearSel}
            <Button onClick={onSave} disabled={dirtyIds.length === 0 || saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save{dirtyIds.length > 0 ? ` (${dirtyIds.length})` : ""}
            </Button>
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><BadgeEuro className="h-3.5 w-3.5" /> Total payout</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{eur(summary.payout)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Eligible</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{summary.eligible}<span className="text-sm text-muted-foreground"> / {summary.total}</span></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Level 1 (€1.50/h)</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{summary.l1}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" /> Level 2 (€2.50/h)</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{summary.l2}</div>
        </CardContent></Card>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          GGs = games ÷ mistakes (first mistake free). Level 1 ≥ 2,500 GGs · Level 2 ≥ 5,000 GGs.
          Bonus = rate × worked hours. Mistakes come from error-file uploads; games &amp; hours are
          editable below (hours marked <em>est.</em> are derived from attendance until you enter them).
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <QueryError title="Couldn't load bonus data" onRetry={() => refetch()} />
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">No GPs for this scope / month.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Game Presenter</th>
                  <th className="px-3 py-2 font-medium"><span className="inline-flex items-center gap-1"><Gamepad2 className="h-3 w-3" /> Games</span></th>
                  <th className="px-3 py-2 font-medium">Mistakes</th>
                  <th className="px-3 py-2 font-medium"><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Hours</span></th>
                  <th className="px-3 py-2 font-medium">GGs</th>
                  <th className="px-3 py-2 font-medium">Level</th>
                  <th className="px-3 py-2 font-medium text-right">Bonus</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const e = edits[r.gpId] ?? {};
                  const gamesVal = e.totalGames ?? r.totalGames;
                  const hoursVal = e.workedHours ?? r.workedHours;
                  const dirty = e.totalGames !== undefined || e.workedHours !== undefined;
                  return (
                    <tr key={r.gpId} className={`border-b border-slate-100 hover:bg-slate-50/60 ${dirty ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.gpName}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min={0}
                          value={String(gamesVal)}
                          onChange={ev => onEdit(r.gpId, "totalGames", ev.target.value)}
                          className="h-8 w-24 tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-600">{r.mistakes}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" min={0}
                            value={String(hoursVal)}
                            onChange={ev => onEdit(r.gpId, "workedHours", ev.target.value)}
                            className="h-8 w-20 tabular-nums"
                          />
                          {r.hoursSource === "estimated" && e.workedHours === undefined && (
                            <Badge variant="outline" className="text-[9px] text-muted-foreground px-1">est.</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums font-medium">{num(r.ggs)}</td>
                      <td className="px-3 py-2"><LevelBadge level={r.level} /></td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.amount > 0 ? eur(r.amount) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[220px]">
                        {r.disqualifyingFactors.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-rose-600"><Ban className="h-3 w-3" /> {r.disqualifyingFactors.join("; ")}</span>
                        ) : r.gapToNext ? (
                          <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> {num(r.gapToNext.gapGGs)} GGs to {r.gapToNext.target === "level2" ? "L2" : "L1"}</span>
                        ) : r.isEligible && r.amount === 0 ? (
                          <span className="text-amber-600">Add worked hours to pay out</span>
                        ) : (
                          <span className="text-emerald-600">Top level</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
