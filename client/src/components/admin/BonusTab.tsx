import { useMemo, useState } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Award, Coins, Target, Users, AlertCircle, Trophy, ChevronRight, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MONTH_NAMES } from "@shared/const";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { GPDetailDrawer } from "@/components/GPDetailDrawer";

type BonusReport = inferRouterOutputs<AppRouter>["bonus"]["list"][number];

interface BonusTabProps {
  teams: { id: number; teamName: string; floorManagerName: string }[];
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: (m: number) => void;
  setSelectedYear: (y: number) => void;
  /** Optional: scope to a single team. FM view sets this to their team. */
  fixedTeamId?: number;
}

const FORMATTER_EUR = new Intl.NumberFormat("en-EU", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const FORMATTER_NUM = new Intl.NumberFormat("en-US");

export function BonusTab({
  teams,
  selectedMonth,
  selectedYear,
  setSelectedMonth,
  setSelectedYear,
  fixedTeamId,
}: BonusTabProps) {
  const [filterTeamId, setFilterTeamId] = useTeamFilter(fixedTeamId);

  const teamId = fixedTeamId ?? filterTeamId;
  const [drawerGpId, setDrawerGpId] = useState<number | null>(null);

  const { data: bonuses, isLoading } = trpc.bonus.list.useQuery({
    month: selectedMonth,
    year: selectedYear,
    teamId,
  });

  const totals = useMemo(() => {
    if (!bonuses) return { total: 0, payout: 0, level1: 0, level2: 0, ineligible: 0 };
    return bonuses.reduce(
      (acc, b) => {
        acc.total++;
        acc.payout += b.bonusAmount;
        if (b.bonusLevel === "level2") acc.level2++;
        else if (b.bonusLevel === "level1") acc.level1++;
        else acc.ineligible++;
        return acc;
      },
      { total: 0, payout: 0, level1: 0, level2: 0, ineligible: 0 },
    );
  }, [bonuses]);

  const sorted = useMemo(() => {
    if (!bonuses) return [];
    // Top earners first; within ineligibles, those closest to qualifying first.
    return [...bonuses].sort((a, b) => {
      if (a.bonusAmount !== b.bonusAmount) return b.bonusAmount - a.bonusAmount;
      return b.achievedGGs - a.achievedGGs;
    });
  }, [bonuses]);

  return (
    <>
    <TabsContent value="bonus" className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Month</label>
            <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[120px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Year</label>
            <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!fixedTeamId && (
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Team</label>
              <Select
                value={filterTeamId ? String(filterTeamId) : "all"}
                onValueChange={v => setFilterTeamId(v === "all" ? undefined : Number(v))}
              >
                <SelectTrigger className="h-10"><SelectValue placeholder="All teams" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.teamName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryStat icon={<Coins className="h-4 w-4" />} label="Estimated payout" value={FORMATTER_EUR.format(totals.payout)} accent="emerald" />
        <SummaryStat icon={<Trophy className="h-4 w-4" />} label="Level 2 (€2.50/h)" value={String(totals.level2)} accent="amber" />
        <SummaryStat icon={<Award className="h-4 w-4" />} label="Level 1 (€1.50/h)" value={String(totals.level1)} accent="violet" />
        <SummaryStat icon={<Users className="h-4 w-4" />} label="Not qualifying" value={String(totals.ineligible)} accent="muted" />
      </div>

      {/* Per-GP table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            Bonuses for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            {bonuses && <Badge variant="outline" className="ml-2">{bonuses.length} GPs</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No GPs to evaluate for this period.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(b => <BonusRow key={b.gpId} bonus={b} onOpenProfile={setDrawerGpId} />)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1.5">
          <p className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>How GGs (Good Games) are computed:</strong> totalGames ÷ max(0, errorCount − 1).
              The first mistake of the month is "free". Level 1 needs ≥ 2,500 GGs (€1.50/h),
              Level 2 needs ≥ 5,000 GGs (€2.50/h).
            </span>
          </p>
          <p className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>Hours worked</strong> defaults to 160h/month, adjusted per attendance:
              +8h per extra shift, −8h per missed day, −8h per sick leave.
              Disqualified if 3+ late incidents or 3+ sick leaves in the month.
            </span>
          </p>
        </CardContent>
      </Card>
    </TabsContent>
    <GPDetailDrawer
      gpId={drawerGpId}
      open={drawerGpId !== null}
      onOpenChange={(open) => { if (!open) setDrawerGpId(null); }}
    />
    </>
  );
}

function useTeamFilter(fixedTeamId?: number) {
  // Inline mini-hook so the filter isn't lost on re-render but isn't persisted
  // to the URL (parent's tab=bonus already lives there).
  const [v, setV] = useState<number | undefined>(fixedTeamId);
  return [v, setV] as const;
}

function SummaryStat({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: string; accent: "emerald" | "amber" | "violet" | "muted" }) {
  const accentClasses = {
    emerald: "border-emerald-200 bg-emerald-50/50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50/50 text-amber-700",
    violet: "border-primary/20 bg-primary/5 text-primary",
    muted: "border-border bg-muted/30 text-muted-foreground",
  }[accent];
  return (
    <Card className={`overflow-hidden`}>
      <CardContent className={`p-3 sm:p-4 ${accentClasses} border`}>
        <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs font-medium">{label}</span></div>
        <p className="text-xl sm:text-2xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function BonusRow({ bonus: b, onOpenProfile }: { bonus: BonusReport; onOpenProfile: (gpId: number) => void }) {
  const tone =
    b.bonusLevel === "level2" ? "border-amber-200 bg-amber-50/50" :
    b.bonusLevel === "level1" ? "border-primary/20 bg-primary/5" :
    "border-border bg-muted/20";
  const levelLabel =
    b.bonusLevel === "level2" ? "Level 2" :
    b.bonusLevel === "level1" ? "Level 1" :
    "Not qualifying";
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenProfile(b.gpId)}
              className="font-semibold text-foreground hover:text-primary hover:underline text-left"
            >
              {b.gpName}
            </button>
            <Badge variant="outline" className="text-[10px]">{levelLabel}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1"><Target className="h-3 w-3" />{FORMATTER_NUM.format(b.achievedGGs)} GGs</span>
            <span>{FORMATTER_NUM.format(b.totalGames)} games</span>
            <span>{b.errorCount} errors</span>
            <span>{b.hoursWorked}h</span>
          </div>
        </div>
        <div className="text-right">
          {b.isEligible ? (
            <>
              <p className="text-xl font-bold text-foreground">{FORMATTER_EUR.format(b.bonusAmount)}</p>
              <p className="text-[11px] text-muted-foreground">€{b.bonusRate.toFixed(2)}/h × {b.hoursWorked}h</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-muted-foreground">No bonus</p>
              {b.gapToNextLevel && (
                <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {FORMATTER_NUM.format(b.gapToNextLevel.gapGGs)} GGs to {b.gapToNextLevel.targetLevel === "level2" ? "L2" : "L1"}
                </p>
              )}
            </>
          )}
        </div>
      </div>
      {b.disqualifyingFactors.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 text-xs text-rose-600 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          {b.disqualifyingFactors.join(" · ")}
        </div>
      )}
    </div>
  );
}
