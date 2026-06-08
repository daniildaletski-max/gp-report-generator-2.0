import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/PageHeader";
import { QueryError } from "@/components/QueryError";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlState, urlNumber } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useMobile";
import { SCORE_CONFIG, MAX_TOTAL_SCORE, MONTH_NAMES, MONTH_NAMES_SHORT } from "@shared/const";
import {
  LineChart as LineChartIcon, Calendar, Users, FileCheck, Star, Target,
  Gamepad2, TrendingUp, TrendingDown, Minus, Layers,
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend,
} from "recharts";

const CHART_TOOLTIP = {
  borderRadius: "12px",
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.08)",
  color: "#1a1a1a",
  boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
  padding: "8px 12px",
  fontSize: "12px",
};

const DISTRIBUTION_COLOR: Record<string, string> = {
  excellent: "#10b981",
  strong: "oklch(0.75 0.12 85)",
  fair: "#f59e0b",
  weak: "#f43f5e",
};

const cfg = (key: string) => SCORE_CONFIG[key as keyof typeof SCORE_CONFIG];

export default function Analytics() {
  const isMobile = useIsMobile();
  const now = new Date();
  const [month, setMonth] = useUrlState<number>(
    "month", now.getMonth() + 1, raw => urlNumber.parse(raw), v => (v === now.getMonth() + 1 ? null : String(v)),
  );
  const [year, setYear] = useUrlState<number>(
    "year", now.getFullYear(), raw => urlNumber.parse(raw), v => (v === now.getFullYear() ? null : String(v)),
  );

  const { data, isLoading, isError, refetch } = trpc.analytics.overview.useQuery({ month, year });

  // Radar: each criterion as a % of its max, current vs previous month.
  const radarData = useMemo(() => {
    if (!data) return [];
    return data.criteria.map(c => {
      const max = cfg(c.key)?.max ?? 1;
      return {
        label: cfg(c.key)?.label ?? c.key,
        current: max ? Math.round((c.avg / max) * 100) : 0,
        previous: c.prevAvg != null && max ? Math.round((c.prevAvg / max) * 100) : null,
      };
    });
  }, [data]);

  const hasPrev = useMemo(() => !!data && data.criteria.some(c => c.prevAvg != null), [data]);

  // Focus area — the lowest-scoring criterion (by % of max) with real data.
  const focus = useMemo(() => {
    if (!data) return null;
    const withData = data.criteria.filter(c => c.sampleSize > 0);
    if (withData.length === 0) return null;
    return [...withData].sort((a, b) => (a.avg / cfg(a.key).max) - (b.avg / cfg(b.key).max))[0];
  }, [data]);

  const distData = useMemo(
    () => (data?.distribution ?? []).map(b => ({ ...b, fill: DISTRIBUTION_COLOR[b.bucket] ?? "#94a3b8" })),
    [data],
  );

  const gameData = useMemo(() => (data?.games ?? []).slice(0, 10), [data]);

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in">
      <PageHeader
        title="Analytics"
        subtitle="Per-criterion, per-game and distribution intelligence"
        icon={LineChartIcon}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-[120px] sm:w-40 bg-card rounded-xl">
                <Calendar className="h-4 w-4 mr-1.5 text-primary/70" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{isMobile ? MONTH_NAMES_SHORT[i] : m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-20 sm:w-24 bg-card rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isError ? (
        <Card><CardContent className="p-0"><QueryError title="Couldn't load analytics" onRetry={() => refetch()} /></CardContent></Card>
      ) : isLoading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        </div>
      ) : !data || data.totalEvaluations === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-2">
            <Layers className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium text-foreground">No evaluations for {MONTH_NAMES[month - 1]} {year}</p>
            <p className="text-sm text-muted-foreground">Pick another month, or add evaluations to populate the analytics.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile icon={FileCheck} label="Evaluations" value={String(data.totalEvaluations)} tone="primary" />
            <KpiTile icon={Users} label="GPs evaluated" value={String(data.uniqueGps)} tone="sky" />
            <KpiTile icon={Star} label="Avg score" value={`${data.avgTotal.toFixed(1)}`} suffix={`/${MAX_TOTAL_SCORE}`} tone="emerald" />
            <KpiTile
              icon={Target}
              label="Focus area"
              value={focus ? (cfg(focus.key)?.label ?? focus.key) : "—"}
              sublabel={focus ? `${focus.avg.toFixed(1)}/${cfg(focus.key).max}` : "no data"}
              tone="rose"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Criteria radar */}
            <Card variant="glass">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                    <Layers className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm sm:text-base">Criteria profile</CardTitle>
                    <CardDescription className="text-xs">% of max per criterion{hasPrev ? " — this vs last month" : ""}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={isMobile ? 260 : 300}>
                  <RadarChart data={radarData} outerRadius={isMobile ? 85 : 110}>
                    <PolarGrid stroke="rgba(0,0,0,0.08)" />
                    <PolarAngleAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 11, fill: "#4b5563" }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9ca3af" }} angle={90} />
                    {hasPrev && (
                      <Radar name="Last month" dataKey="previous" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.12} strokeWidth={1.5} />
                    )}
                    <Radar name="This month" dataKey="current" stroke="oklch(0.65 0.12 85)" fill="oklch(0.75 0.12 85)" fillOpacity={0.35} strokeWidth={2} />
                    <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v: number) => [`${v}%`, ""]} />
                    <Legend wrapperStyle={{ fontSize: isMobile ? "10px" : "11px", paddingTop: 8 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Score distribution */}
            <Card variant="glass">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                    <Star className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm sm:text-base">Score distribution</CardTitle>
                    <CardDescription className="text-xs">Evaluations by total-score band</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
                  <BarChart data={distData} margin={{ top: 10, right: 10, left: isMobile ? -16 : 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 11, fill: "#4b5563" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: isMobile ? 9 : 11, fill: "#4b5563" }} width={isMobile ? 24 : 32} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP}
                      formatter={(v: number) => [`${v} evals`, ""]}
                      labelFormatter={(label, payload) => {
                        const b = payload?.[0]?.payload;
                        return b ? `${label} (${b.min}–${b.max})` : label;
                      }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {distData.map((b, i) => <Cell key={i} fill={b.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Criteria breakdown with MoM deltas */}
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                  <Layers className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base">Criteria breakdown</CardTitle>
                  <CardDescription className="text-xs">Company-wide average per criterion, with change vs last month</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {data.criteria.map(c => {
                  const max = cfg(c.key)?.max ?? 1;
                  const pct = max ? (c.avg / max) * 100 : 0;
                  const isFocus = focus?.key === c.key;
                  return (
                    <div key={c.key} className={`rounded-xl border p-3 ${isFocus ? "border-rose-200 bg-rose-50/40" : "border-border bg-card/50"}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          {cfg(c.key)?.label ?? c.key}
                          {isFocus && <span className="text-[10px] font-semibold text-rose-600 uppercase tracking-wide">focus</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-bold tabular-nums text-foreground">{c.avg.toFixed(1)}<span className="text-xs text-muted-foreground font-normal">/{max}</span></span>
                          <DeltaChip delta={c.delta} />
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-400"}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Per-game performance */}
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-emerald-500/10 border border-primary/20">
                  <Gamepad2 className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base">Performance by game</CardTitle>
                  <CardDescription className="text-xs">Average total score and volume per game</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {gameData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(180, gameData.length * 38)}>
                  <BarChart data={gameData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis type="number" domain={[0, MAX_TOTAL_SCORE]} tick={{ fontSize: 11, fill: "#4b5563" }} />
                    <YAxis type="category" dataKey="name" width={isMobile ? 80 : 120} tick={{ fontSize: isMobile ? 10 : 11, fill: "#4b5563" }} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP}
                      formatter={(v: number, _n, p: any) => [`${v}/${MAX_TOTAL_SCORE} avg · ${p?.payload?.count} evals`, ""]}
                    />
                    <Bar dataKey="avgTotal" radius={[0, 6, 6, 0]}>
                      {gameData.map((g, i) => (
                        <Cell key={i} fill={g.avgTotal >= 20 ? "#10b981" : g.avgTotal >= 16 ? "oklch(0.75 0.12 85)" : "#f43f5e"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">No game data recorded this month.</div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="inline-flex items-center text-[11px] text-muted-foreground"><Minus className="h-3 w-3" /></span>;
  }
  if (delta === 0) {
    return <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><Minus className="h-3 w-3" />0.0</span>;
  }
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{delta.toFixed(1)}
    </span>
  );
}

function KpiTile({
  icon: Icon, label, value, suffix, sublabel, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  suffix?: string;
  sublabel?: string;
  tone: "primary" | "sky" | "emerald" | "rose";
}) {
  const accent =
    tone === "emerald" ? "from-emerald-300 to-emerald-400"
    : tone === "sky" ? "from-sky-300 to-sky-400"
    : tone === "rose" ? "from-rose-300 to-rose-400"
    : "from-primary/40 to-primary/60";
  const iconBg =
    tone === "emerald" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : tone === "sky" ? "bg-sky-100 text-sky-700 border-sky-200"
    : tone === "rose" ? "bg-rose-100 text-rose-700 border-rose-200"
    : "bg-primary/10 text-primary border-primary/20";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-3">
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${accent}`} aria-hidden />
      <div className="flex items-center gap-2.5">
        <span className={`h-9 w-9 shrink-0 rounded-lg border flex items-center justify-center ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{label}</p>
          <p className="text-lg font-bold tabular-nums text-foreground leading-tight truncate">
            {value}{suffix && <span className="text-xs text-muted-foreground font-normal">{suffix}</span>}
          </p>
          {sublabel && <p className="text-[10px] text-muted-foreground truncate">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}
