import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  User, Trophy, Coins, Target, AlertTriangle, ThumbsUp, ThumbsDown, FileCheck,
  Calendar, TrendingUp, TrendingDown, Star, Clock, AlertCircle, Award, Minus,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { format } from "date-fns";
import { MAX_TOTAL_SCORE, MAX_APPEARANCE_SCORE, MAX_GAME_PERFORMANCE_SCORE } from "@shared/const";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { ActionItemsPanel } from "./ActionItemsPanel";

type Profile = inferRouterOutputs<AppRouter>["gamePresenter"]["profile"];

const FORMATTER_EUR = new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const FORMATTER_NUM = new Intl.NumberFormat("en-US");

interface GPDetailDrawerProps {
  gpId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Drawer that opens when you click a GP name anywhere in the app and pulls
 * everything in one round-trip (gamePresenter.profile): identity, current
 * month stats, 6-month trend, 6-month bonus history, recent evaluations /
 * errors / attitude entries.
 */
export function GPDetailDrawer({ gpId, open, onOpenChange }: GPDetailDrawerProps) {
  const { data, isLoading } = trpc.gamePresenter.profile.useQuery(
    { gpId: gpId ?? 0, monthsBack: 6 },
    { enabled: open && gpId !== null && gpId > 0 },
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {isLoading || !data ? (
          <ProfileSkeleton />
        ) : (
          <ProfileContent data={data} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProfileSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-32" />
    </div>
  );
}

function ProfileContent({ data }: { data: Profile }) {
  const { gp, currentMonth, trend, bonusHistory, recentEvaluations, recentErrors, recentAttitude } = data;

  const trendChartData = useMemo(() => trend.map(m => ({
    month: m.label,
    Total: Number(m.avgTotal) || 0,
    Appearance: Number(m.avgAppearance) || 0,
    Performance: Number(m.avgPerformance) || 0,
  })), [trend]);

  const totalBonusYTD = bonusHistory.reduce((sum, b) => sum + b.bonusAmount, 0);
  const currentBonus = bonusHistory[bonusHistory.length - 1];
  const lastEval = recentEvaluations[0];

  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-xl">{gp.name}</SheetTitle>
            <SheetDescription className="flex items-center gap-2 flex-wrap mt-0.5">
              {gp.teamName ? (
                <Badge variant="outline" className="text-xs">{gp.teamName}</Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">No team</Badge>
              )}
              {gp.floorManagerName && <span className="text-xs">FM: {gp.floorManagerName}</span>}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <TabsList className="mx-6 mt-4 grid grid-cols-6">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="plan" className="text-xs">Plan</TabsTrigger>
          <TabsTrigger value="evals" className="text-xs">
            Evals {recentEvaluations.length > 0 && <span className="ml-1 text-muted-foreground">({recentEvaluations.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="errors" className="text-xs">
            Errors {recentErrors.length > 0 && <span className="ml-1 text-muted-foreground">({recentErrors.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="attitude" className="text-xs">
            Attitude {recentAttitude.length > 0 && <span className="ml-1 text-muted-foreground">({recentAttitude.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="bonus" className="text-xs">Bonus</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="px-6 py-4 space-y-4 mt-0">
          {/* Headline cards */}
          <div className="grid grid-cols-3 gap-3">
            <HeadlineCard
              icon={<FileCheck className="h-4 w-4" />}
              label="This month evals"
              value={String(currentMonth.evalCount)}
              accent="primary"
            />
            <HeadlineCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Mistakes"
              value={String(currentMonth.mistakes)}
              accent={currentMonth.mistakes > 3 ? "rose" : "muted"}
            />
            <HeadlineCard
              icon={<Coins className="h-4 w-4" />}
              label="This month bonus"
              value={currentBonus && currentBonus.bonusAmount > 0 ? FORMATTER_EUR.format(currentBonus.bonusAmount) : "—"}
              accent={currentBonus?.bonusLevel === "level2" ? "amber" : currentBonus?.bonusLevel === "level1" ? "primary" : "muted"}
            />
          </div>

          {/* 6-month trend chart */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">6-month performance trend</p>
              </div>
              {trendChartData.some(d => d.Total > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <YAxis domain={[0, MAX_TOTAL_SCORE]} tick={{ fontSize: 10, fill: "#6b7280" }} width={28} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Total" stroke="oklch(0.65 0.15 285)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Appearance" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Performance" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">No evaluations in the last 6 months</div>
              )}
            </CardContent>
          </Card>

          {/* Attendance breakdown */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Current month attendance
              </p>
              <AttendanceRow label="Extra shifts" value={currentMonth.attendance.extraShifts} positive />
              <AttendanceRow label="Late to work" value={currentMonth.attendance.lateToWork} />
              <AttendanceRow label="Missed days" value={currentMonth.attendance.missedDays} />
              <AttendanceRow label="Sick leaves" value={currentMonth.attendance.sickLeaves} />
            </CardContent>
          </Card>

          {/* Year-to-date bonus */}
          {totalBonusYTD > 0 && (
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total bonuses (last 6 months)</p>
                  <p className="text-xl font-bold">{FORMATTER_EUR.format(totalBonusYTD)}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {lastEval?.evaluationDate && (
            <p className="text-xs text-muted-foreground text-center">
              Last evaluation: {format(new Date(lastEval.evaluationDate), "PPP")}
            </p>
          )}
        </TabsContent>

        <TabsContent value="plan" className="px-6 py-4 mt-0">
          <ActionItemsPanel gpId={gp.id} gpName={gp.name} />
        </TabsContent>

        <TabsContent value="evals" className="px-6 py-4 mt-0">
          {recentEvaluations.length === 0 ? (
            <EmptyState icon={<FileCheck className="h-8 w-8" />} text="No evaluations yet" />
          ) : (
            <div className="space-y-2">
              {recentEvaluations.map(ev => <EvalRow key={ev.id} ev={ev} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="errors" className="px-6 py-4 mt-0">
          {recentErrors.length === 0 ? (
            <EmptyState icon={<AlertTriangle className="h-8 w-8" />} text="No errors recorded" />
          ) : (
            <div className="space-y-2">
              {recentErrors.map(err => <ErrorRow key={err.id} err={err} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="attitude" className="px-6 py-4 mt-0">
          {recentAttitude.length === 0 ? (
            <EmptyState icon={<ThumbsUp className="h-8 w-8" />} text="No attitude entries" />
          ) : (
            <div className="space-y-2">
              {recentAttitude.map(att => <AttitudeRow key={att.id} att={att} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bonus" className="px-6 py-4 mt-0">
          {bonusHistory.length === 0 ? (
            <EmptyState icon={<Coins className="h-8 w-8" />} text="No bonus history" />
          ) : (
            <div className="space-y-2">
              {[...bonusHistory].reverse().map(b => <BonusHistoryRow key={`${b.year}-${b.month}`} bonus={b} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HeadlineCard({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: string; accent: "primary" | "amber" | "rose" | "muted" }) {
  const tone = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    muted: "border-border bg-muted/30 text-muted-foreground",
  }[accent];
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[10px] font-medium uppercase tracking-wider">{label}</span></div>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function AttendanceRow({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${value === 0 ? "text-muted-foreground" : positive ? "text-emerald-600" : "text-rose-600"}`}>
        {value}
      </span>
    </div>
  );
}

function EvalRow({ ev }: { ev: Profile["recentEvaluations"][number] }) {
  const score = ev.totalScore ?? 0;
  const tone = score >= 20 ? "border-emerald-200 bg-emerald-50/50" : score >= 16 ? "border-primary/20 bg-primary/5" : "border-rose-200 bg-rose-50/50";
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {ev.evaluationDate ? format(new Date(ev.evaluationDate), "MMM d, yyyy") : "—"}
          {ev.game && <Badge variant="outline" className="text-[10px]">{ev.game}</Badge>}
        </div>
        <span className="text-lg font-bold">{score}<span className="text-xs text-muted-foreground">/{MAX_TOTAL_SCORE}</span></span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Appearance</span><span className="font-medium">{ev.appearanceScore ?? 0}/{MAX_APPEARANCE_SCORE}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Performance</span><span className="font-medium">{ev.gamePerformanceTotalScore ?? 0}/{MAX_GAME_PERFORMANCE_SCORE}</span></div>
      </div>
      {ev.evaluatorName && <p className="text-[10px] text-muted-foreground mt-1.5">by {ev.evaluatorName}</p>}
    </div>
  );
}

function ErrorRow({ err }: { err: Profile["recentErrors"][number] }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-rose-700">{err.errorType || "Error"}</p>
        <span className="text-[11px] text-muted-foreground">
          {err.errorDate ? format(new Date(err.errorDate), "MMM d") : format(new Date(err.createdAt), "MMM d")}
        </span>
      </div>
      {err.errorDescription && <p className="text-xs text-muted-foreground line-clamp-2">{err.errorDescription}</p>}
    </div>
  );
}

function AttitudeRow({ att }: { att: Profile["recentAttitude"][number] }) {
  const score = att.attitudeScore ?? 0;
  const isPositive = score > 0;
  const tone = isPositive ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50";
  const Icon = isPositive ? ThumbsUp : ThumbsDown;
  const accentText = isPositive ? "text-emerald-700" : "text-rose-700";
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className={`flex items-center gap-1.5 ${accentText}`}>
          <Icon className="h-3.5 w-3.5" />
          <span className="text-sm font-medium">{score > 0 ? "+" : ""}{score}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {att.evaluationDate ? format(new Date(att.evaluationDate), "MMM d") : format(new Date(att.createdAt), "MMM d")}
        </span>
      </div>
      {att.comment && <p className="text-xs text-muted-foreground">{att.comment}</p>}
    </div>
  );
}

function BonusHistoryRow({ bonus: b }: { bonus: Profile["bonusHistory"][number] }) {
  const tone =
    b.bonusLevel === "level2" ? "border-amber-200 bg-amber-50/50" :
    b.bonusLevel === "level1" ? "border-primary/20 bg-primary/5" :
    "border-border bg-muted/30";
  const levelLabel =
    b.bonusLevel === "level2" ? "Level 2" :
    b.bonusLevel === "level1" ? "Level 1" :
    "Not qualifying";
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold">{b.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {FORMATTER_NUM.format(b.totalGames)} games · {b.errorCount} errors · {b.hoursWorked}h
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold">
            {b.bonusAmount > 0 ? FORMATTER_EUR.format(b.bonusAmount) : "—"}
          </p>
          <Badge variant="outline" className="text-[10px] mt-0.5">{levelLabel}</Badge>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-12 text-center text-muted-foreground">
      <div className="mx-auto mb-2 opacity-30">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}
