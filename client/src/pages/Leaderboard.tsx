import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";
import { QueryError } from "@/components/QueryError";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { MONTH_NAMES, MAX_TOTAL_SCORE } from "@shared/const";
import {
  Trophy, Crown, Medal, TrendingUp, TrendingDown, Minus, BadgeEuro,
  Users, BarChart3, Sparkles, Star, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

const round1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function Delta({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-muted-foreground text-xs">—</span>;
  if (delta > 0) return <span className="inline-flex items-center gap-0.5 text-emerald-600 text-xs font-medium"><ArrowUpRight className="h-3 w-3" />+{round1(delta)}</span>;
  if (delta < 0) return <span className="inline-flex items-center gap-0.5 text-rose-600 text-xs font-medium"><ArrowDownRight className="h-3 w-3" />{round1(delta)}</span>;
  return <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs"><Minus className="h-3 w-3" />0</span>;
}

const PODIUM = [
  { icon: Crown, ring: "ring-amber-300", bg: "from-amber-50 to-yellow-50", chip: "bg-amber-100 text-amber-800 border-amber-300", label: "1st" },
  { icon: Trophy, ring: "ring-slate-300", bg: "from-slate-50 to-slate-100", chip: "bg-slate-100 text-slate-700 border-slate-300", label: "2nd" },
  { icon: Medal, ring: "ring-orange-300", bg: "from-orange-50 to-amber-50", chip: "bg-orange-100 text-orange-800 border-orange-300", label: "3rd" },
];

export default function LeaderboardPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  useLiveEvents();

  const { data, isLoading, isError, refetch } = trpc.leaderboard.get.useQuery({ month, year });
  const rows = data?.rows ?? [];
  const a = data?.analytics;
  const podium = useMemo(() => rows.slice(0, 3), [rows]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leaderboard"
        subtitle="Every game presenter, ranked company-wide."
        icon={Trophy}
        actions={
          <>
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </>
        }
      />

      {isError ? (
        <Card><CardContent className="p-0"><QueryError title="Couldn't load the leaderboard" onRetry={() => refetch()} /></CardContent></Card>
      ) : (
        <>
      {/* Analytics strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 stagger-children">
        <Card className="metric-hover"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Ranked GPs</div>
          <div className="text-2xl font-semibold mt-1.5 tabular-nums number-tick">{a?.rankedGPs ?? 0}<span className="text-sm text-muted-foreground"> / {a?.totalGPs ?? 0}</span></div>
        </CardContent></Card>
        <Card className="metric-hover"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> Company avg</div>
          <div className="text-2xl font-semibold mt-1.5 tabular-nums number-tick">{a ? round1(a.avgTotal) : "0.0"}<span className="text-sm text-muted-foreground"> /{MAX_TOTAL_SCORE}</span></div>
        </CardContent></Card>
        <Card className="metric-hover"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Median</div>
          <div className="text-2xl font-semibold mt-1.5 tabular-nums number-tick">{a ? round1(a.medianTotal) : "0.0"}</div>
        </CardContent></Card>
        <Card className="metric-hover"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><BadgeEuro className="h-3.5 w-3.5" /> Bonus payout</div>
          <div className="text-2xl font-semibold mt-1.5 tabular-nums number-tick">€{(a?.totalBonusPayout ?? 0).toLocaleString()}</div>
        </CardContent></Card>
        <Card className="metric-hover"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Total evals</div>
          <div className="text-2xl font-semibold mt-1.5 tabular-nums number-tick">{a?.totalEvaluations ?? 0}</div>
        </CardContent></Card>
      </div>

      {/* Podium */}
      {!isLoading && podium.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {podium.map((r, i) => {
            const P = PODIUM[i];
            const Icon = P.icon;
            return (
              <Card key={r.gpId} className={`bg-gradient-to-br ${P.bg} ring-1 ${P.ring} podium-entrance hover:shadow-lg transition-shadow duration-300`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${P.chip} border transition-transform duration-300 hover:scale-110`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge className={`${P.chip} text-[10px]`}>{P.label}</Badge>
                      <Delta delta={r.delta} />
                    </div>
                    <div className="font-semibold text-slate-900 truncate mt-0.5">{r.gpName}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{round1(r.avgTotal)}/{MAX_TOTAL_SCORE} · {r.evalCount} eval{r.evalCount === 1 ? "" : "s"}{r.bonusAmount > 0 ? ` · €${r.bonusAmount}` : ""}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Movers + distribution */}
      {a && (a.topImprovers.length > 0 || a.topDecliners.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card className="score-glow"><CardContent className="p-4">
            <div className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-emerald-700"><TrendingUp className="h-4 w-4" /> Top improvers</div>
            <div className="space-y-1.5">
              {a.topImprovers.length === 0 ? <p className="text-xs text-muted-foreground">No month-over-month gainers.</p> :
                a.topImprovers.map(m => (
                  <div key={m.gpId} className="flex items-center justify-between text-sm">
                    <span className="truncate">{m.gpName}</span>
                    <span className="text-emerald-600 font-medium tabular-nums">+{round1(m.delta)}</span>
                  </div>
                ))}
            </div>
          </CardContent></Card>
          <Card className="score-glow"><CardContent className="p-4">
            <div className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-rose-700"><TrendingDown className="h-4 w-4" /> Needs attention</div>
            <div className="space-y-1.5">
              {a.topDecliners.length === 0 ? <p className="text-xs text-muted-foreground">No month-over-month decliners.</p> :
                a.topDecliners.map(m => (
                  <div key={m.gpId} className="flex items-center justify-between text-sm">
                    <span className="truncate">{m.gpName}</span>
                    <span className="text-rose-600 font-medium tabular-nums">{round1(m.delta)}</span>
                  </div>
                ))}
            </div>
          </CardContent></Card>
          <Card className="score-glow"><CardContent className="p-4">
            <div className="text-sm font-semibold flex items-center gap-1.5 mb-2"><BarChart3 className="h-4 w-4 text-primary" /> Distribution</div>
            <div className="space-y-1.5">
              {a.distribution.map(d => {
                const pct = a.rankedGPs > 0 ? Math.round((d.count / a.rankedGPs) * 100) : 0;
                return (
                  <div key={d.band} className="text-xs">
                    <div className="flex justify-between mb-0.5"><span>{d.band}</span><span className="text-muted-foreground tabular-nums">{d.count}</span></div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </CardContent></Card>
        </div>
      )}

      {/* Full ranking */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">No evaluations for {MONTH_NAMES[month - 1]} {year}.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium w-12">#</th>
                  <th className="px-3 py-2 font-medium">Game Presenter</th>
                  <th className="px-3 py-2 font-medium text-right">Avg</th>
                  <th className="px-3 py-2 font-medium text-right">Δ MoM</th>
                  <th className="px-3 py-2 font-medium text-right">Appear.</th>
                  <th className="px-3 py-2 font-medium text-right">Perf.</th>
                  <th className="px-3 py-2 font-medium text-right">Attitude</th>
                  <th className="px-3 py-2 font-medium text-right">Mistakes</th>
                  <th className="px-3 py-2 font-medium text-right">Evals</th>
                  <th className="px-3 py-2 font-medium text-right">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.gpId} className={`border-b border-slate-100 table-row-premium ${r.rank <= 3 ? "bg-amber-50/30" : ""}`}>
                    <td className="px-3 py-2 font-semibold tabular-nums">{r.rank}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{r.gpName}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{round1(r.avgTotal)}</td>
                    <td className="px-3 py-2 text-right"><Delta delta={r.delta} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{round1(r.avgAppearance)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{round1(r.avgPerformance)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.attitude == null ? "—" : <span className={r.attitude > 0 ? "text-emerald-600" : r.attitude < 0 ? "text-rose-600" : ""}>{r.attitude > 0 ? `+${r.attitude}` : r.attitude}</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.mistakes > 0 ? <span className="text-rose-600">{r.mistakes}</span> : <span className="text-muted-foreground">0</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.evalCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{r.bonusAmount > 0 ? `€${r.bonusAmount}` : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
