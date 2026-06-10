import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, FileCheck, TrendingUp, TrendingDown, FileSpreadsheet, AlertTriangle, Award, Target, Calendar, PieChart, ArrowRight, Upload, Sparkles, RefreshCw, Clock, Zap, BarChart3, CheckCircle2, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { GlassCard } from "@/components/ui/glass-card";
import { useLocation } from "wouter";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { GPDetailDrawer } from "@/components/GPDetailDrawer";
import { GoalsCard } from "@/components/GoalsCard";
import { PageHeader } from "@/components/PageHeader";
import { useUrlState, urlNumber } from "@/hooks/useUrlState";
import { useAuth } from "@/_core/hooks/useAuth";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from "recharts";
import { useIsMobile } from "@/hooks/useMobile";
import { useCountUp } from "@/hooks/useCountUp";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

interface GPStat {
  gpId: number;
  gpName: string;
  evalCount: number;
  avgTotal: string;
  avgHair: string;
  avgMakeup: string;
  avgOutfit: string;
  avgPosture: string;
  avgDealing: string;
  avgGamePerf: string;
  avgAppearance: string;
  avgPerformance: string;
}

// Theme-aware chart tooltip style
const CHART_TOOLTIP_STYLE = {
  borderRadius: '12px',
  backdropFilter: 'blur(20px)',
  padding: '10px 14px',
};

const CHART_TOOLTIP_LIGHT = {
  ...CHART_TOOLTIP_STYLE,
  background: 'rgba(255, 255, 255, 0.95)',
  border: '1px solid rgba(0, 0, 0, 0.08)',
  color: '#1a1a1a',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
};

const CHART_TOOLTIP_DARK = {
  ...CHART_TOOLTIP_STYLE,
  background: 'rgba(24, 24, 32, 0.92)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  color: '#f0f0f0',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
};

function useChartTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    tooltipStyle: isDark ? CHART_TOOLTIP_DARK : CHART_TOOLTIP_LIGHT,
    tickFill: isDark ? '#9ca3af' : '#374151',
    gridStroke: isDark ? 'rgba(255,255,255,0.08)' : '#e5e5e3',
    legendColor: isDark ? '#9ca3af' : '#4b5563',
  };
}

// Purple-themed pie chart colors
const PIE_COLORS = ['oklch(0.75 0.12 85)', 'oklch(0.65 0.12 85)', 'oklch(0.70 0.10 85)', '#6b7280'];

export default function Dashboard() {
  const { user } = useAuth();
  const [currentDate] = useState(() => new Date());
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  // Persist month/year/team in the URL so refresh keeps the view, and a
  // copy-pasted link opens directly on the same period/team.
  const [selectedMonth, setSelectedMonth] = useUrlState<number>(
    "month",
    currentMonth,
    raw => urlNumber.parse(raw),
    v => (v === currentMonth ? null : String(v)),
  );
  const [selectedYear, setSelectedYear] = useUrlState<number>(
    "year",
    currentYear,
    raw => urlNumber.parse(raw),
    v => (v === currentYear ? null : String(v)),
  );
  const [selectedTeamId, setSelectedTeamId] = useUrlState<number | undefined>(
    "team",
    undefined,
    raw => urlNumber.parse(raw),
    v => (v == null ? null : String(v)),
  );
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  // Persist the open GP-detail drawer in the URL (?gp=ID). Lets deep
  // links / insight CTAs open a specific GP straight from a navigation
  // event instead of needing extra programmatic state.
  const [drawerGpId, setDrawerGpId] = useUrlState<number | null>(
    "gp",
    null,
    raw => urlNumber.parse(raw),
    v => (v == null ? null : String(v)),
  );

  // Aggregate action-item counts so the dashboard surfaces "X open, Y overdue".
  const { data: actionItemStats } = trpc.actionItems.stats.useQuery({
    teamId: selectedTeamId,
  });

  const { data: stats, isLoading, isError: isStatsError, refetch: refetchStats } = trpc.dashboard.stats.useQuery({
    month: selectedMonth,
    year: selectedYear,
    teamId: selectedTeamId,
  });

  // Single lightweight existence-only query for the onboarding
  // checklist. Replaces the previous trio of (a) a second
  // dashboard.stats call (b) a full gamePresenter.list scan and
  // (c) the integrationStatus query that loaded every evaluation
  // row. All seven flags now come from server-side LIMIT 1 reads.
  const { data: onboardingStatus } = trpc.dashboard.onboardingStatus.useQuery();

  // 6-month rolling trend — used for the hero tile sparklines + period
  // deltas. Same query that TrendSection lower on the page uses, so
  // tRPC's cache collapses it into one network request.
  const { data: heroTrend } = trpc.dashboard.monthlyTrend.useQuery({
    teamId: selectedTeamId,
    months: 6,
  });

  const totalGPs = stats?.totalGPs || 0;
  const evaluatedGPs = (stats as { thisMonthGPs?: number })?.thisMonthGPs || 0;
  const evaluationProgress = totalGPs > 0 ? Math.round((evaluatedGPs / totalGPs) * 100) : 0;
  const pendingGPs = totalGPs - evaluatedGPs;

  const gpStats = (stats as { gpStats?: GPStat[] })?.gpStats || [];
  const chartData = useMemo(() => gpStats.map((gp: GPStat) => ({
    gpId: gp.gpId,
    name: gp.gpName ? (gp.gpName.split(' ').length > 1 ? `${gp.gpName.split(' ')[0]} ${gp.gpName.split(' ').slice(-1)[0][0]}.` : gp.gpName) : "Unknown",
    fullName: gp.gpName,
    totalScore: Number(gp.avgTotal),
    appearance: Number(gp.avgAppearance),
    performance: Number(gp.avgPerformance),
    evalCount: gp.evalCount,
  })), [gpStats]);

  const performanceDistribution = useMemo(() => {
    if (!chartData.length) return [];
    const excellent = chartData.filter(gp => gp.totalScore >= 20).length;
    const good = chartData.filter(gp => gp.totalScore >= 16 && gp.totalScore < 20).length;
    const needsWork = chartData.filter(gp => gp.totalScore > 0 && gp.totalScore < 16).length;
    const notEvaluated = chartData.filter(gp => gp.totalScore === 0).length;
    return [
      { name: 'Excellent (20+)', value: excellent, color: PIE_COLORS[0] },
      { name: 'Good (16-19)', value: good, color: PIE_COLORS[1] },
      { name: 'Needs Work (<16)', value: needsWork, color: PIE_COLORS[2] },
      { name: 'Not Evaluated', value: notEvaluated, color: PIE_COLORS[3] },
    ].filter(d => d.value > 0);
  }, [chartData]);

  const topPerformers = useMemo(() => 
    [...chartData].filter(gp => gp.totalScore > 0).sort((a, b) => b.totalScore - a.totalScore).slice(0, 5),
    [chartData]
  );

  const lowPerformers = useMemo(() => 
    chartData.filter(gp => gp.totalScore > 0 && gp.totalScore < 16),
    [chartData]
  );

  const avgTeamScore = useMemo(() => {
    const validScores = chartData.filter(gp => gp.totalScore > 0);
    if (!validScores.length) return 0;
    return validScores.reduce((sum, gp) => sum + gp.totalScore, 0) / validScores.length;
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-5 animate-in fade-in duration-300">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 rounded-lg skeleton-shimmer" />
            <div className="h-4 w-56 rounded-lg skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-32 rounded-xl skeleton-shimmer" style={{ animationDelay: '0.2s' }} />
            <div className="h-10 w-20 rounded-xl skeleton-shimmer" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 sm:h-32 rounded-2xl skeleton-shimmer border border-border/50" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-2xl skeleton-shimmer border border-border/50" style={{ animationDelay: '0.5s' }} />
          <div className="h-64 rounded-2xl skeleton-shimmer border border-border/50" style={{ animationDelay: '0.6s' }} />
        </div>
      </div>
    );
  }

  if (isStatsError) {
    return (
      <div className="p-4 sm:p-6">
        <Card className="border border-rose-200 bg-rose-50">
          <CardContent className="py-12 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center">
              <AlertTriangle className="h-7 w-7 text-rose-600" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-rose-900">Couldn't load dashboard data</h3>
              <p className="text-sm text-rose-700 max-w-md">
                The server didn't return stats for this period. This usually clears on a retry —
                if it keeps failing, check the network or open the admin panel.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetchStats()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/admin")}>
                Open admin
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle="Performance overview"
        icon={BarChart3}
        actions={
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[120px] sm:w-40 bg-card border-border hover:border-primary/30 rounded-xl">
              <Calendar className="h-4 w-4 mr-1.5 sm:mr-2 text-primary/70" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, idx) => (
                <SelectItem key={idx} value={(idx + 1).toString()}>
                  {isMobile ? MONTHS_SHORT[idx] : month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-20 sm:w-24 bg-card border-border hover:border-primary/30 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        }
      />

      {/* Quick Actions Hero — primary FM workflows surfaced front-and-center
          so the most common operations (upload screenshots, generate the
          monthly report, sync Persona, work the action plan) are one tap
          away from the dashboard. Includes a personalised greeting and the
          live evaluation-progress bar so the FM lands here and immediately
          knows what's pending. */}
      <section className="relative overflow-hidden rounded-2xl border border-primary/15 shadow-md">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-amber-50" aria-hidden />
        <div className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-gradient-to-br from-primary/20 to-amber-300/20 blur-3xl pointer-events-none" aria-hidden />
        <div className="relative p-5 sm:p-6 space-y-4">
          {/* Greeting + progress strip */}
          <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-primary/80">
                {(() => {
                  const h = new Date().getHours();
                  return h < 6 ? "Hello" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
                })()}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
              </p>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground leading-tight tracking-tight">
                {`${MONTHS[selectedMonth - 1]} ${selectedYear} overview`}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {evaluationProgress}% of GPs evaluated this month — {evaluatedGPs}/{totalGPs} done{pendingGPs > 0 ? `, ${pendingGPs} pending` : ""}.
              </p>
            </div>
            <div className="w-full sm:w-64 shrink-0">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                <span className="font-semibold">Evaluation progress</span>
                <span className="font-bold text-primary">{evaluationProgress}%</span>
              </div>
              <Progress value={evaluationProgress} className="h-2 bg-muted" />
            </div>
          </div>

          {/* Action grid — 2x2 on mobile, 1x4 on tablet+ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 stagger-children">
            <button
              onClick={() => setLocation('/upload')}
              className="group flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-card border border-border hover:border-primary/40 hover:shadow-md transition-all text-left card-interactive"
            >
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm shrink-0">
                <Upload className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">Upload screenshots</p>
                <p className="text-xs text-muted-foreground truncate">AI auto-detects type</p>
              </div>
            </button>
            <button
              onClick={() => setLocation('/reports')}
              className="group flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-card border border-border hover:border-emerald-300 hover:shadow-md transition-all text-left card-interactive"
            >
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">Generate report</p>
                <p className="text-xs text-muted-foreground truncate">Monthly team overview</p>
              </div>
            </button>
            <button
              onClick={() => setLocation('/admin?tab=persona')}
              className="group flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-card border border-border hover:border-blue-300 hover:shadow-md transition-all text-left card-interactive"
            >
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
                <RefreshCw className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">Sync Persona</p>
                <p className="text-xs text-muted-foreground truncate">Pull HR attendance</p>
              </div>
            </button>
            <button
              onClick={() => setLocation('/admin?tab=action-items')}
              className="group flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-card border border-border hover:border-violet-300 hover:shadow-md transition-all text-left card-interactive"
            >
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-sm shrink-0">
                <Target className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">Action plan</p>
                <p className="text-xs text-muted-foreground truncate">
                  {actionItemStats && (actionItemStats.open + actionItemStats.inProgress) > 0
                    ? `${actionItemStats.open + actionItemStats.inProgress} open`
                    : "All caught up"}
                </p>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Action items widget — shows what's actually on the FM's plate */}
      {actionItemStats && (actionItemStats.open > 0 || actionItemStats.inProgress > 0) && (
        <GlassCard size="default">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 border border-violet-500/20 flex items-center justify-center">
                <Target className="h-4.5 w-4.5 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Coaching plan</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{actionItemStats.open}</span> open,
                  <span className="font-semibold text-foreground"> {actionItemStats.inProgress}</span> in progress
                  {actionItemStats.overdue > 0 && (
                    <span className="text-rose-600 font-semibold"> · {actionItemStats.overdue} overdue</span>
                  )}
                  {actionItemStats.dueThisWeek > 0 && (
                    <span className="text-amber-600 font-semibold"> · {actionItemStats.dueThisWeek} due this week</span>
                  )}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setLocation("/admin?tab=action-items")} className="rounded-xl">
              Open board
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </GlassCard>
      )}

      {/* Hero board — replaces the old 4-StatCard row with a primary
          KPI tile (avg team score, big number + sparkline + period
          delta) and 3 mini metric tiles. Gives the FM an immediate
          read on team trajectory at the top of the page. */}
      <DashboardHero
        avgTeamScore={avgTeamScore}
        totalGPs={stats?.totalGPs || 0}
        evaluatedGPs={evaluatedGPs}
        totalEvaluations={stats?.totalEvaluations || 0}
        totalReports={stats?.totalReports || 0}
        trend={heroTrend ?? []}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
      />

      {/* Monthly goals — management targets with live progress + status
          chips. Follows the page's month/year selection; admins set the
          targets inline. */}
      <GoalsCard month={selectedMonth} year={selectedYear} />

      {/* Onboarding checklist — surfaces five setup milestones for
          new FMs (created team, added GPs, first eval recorded,
          first report generated, Studioworks/Persona connected).
          Auto-hides when all five are complete and stays dismissed
          via localStorage if the FM closes it manually.
          NB: completion flags are read from `tenantStats` (the
          unfiltered query), NOT the team-scoped `stats`, so the
          checklist doesn't re-appear when an FM picks a fresh team. */}
      <OnboardingChecklist
        userId={user?.id ?? null}
        userRole={user?.role ?? "fm"}
        hasTeam={onboardingStatus?.hasTeam ?? false}
        hasGps={onboardingStatus?.hasAssignedGp ?? false}
        hasEvaluations={onboardingStatus?.hasEvaluation ?? false}
        hasReports={onboardingStatus?.hasReport ?? false}
        hasIntegration={onboardingStatus?.hasIntegration ?? false}
        onNavigate={setLocation}
      />

      {/* Quick actions — five most-used operations promoted from
          buried admin tabs / submenus to one-click cards. Saves the
          FM a navigation hop for the operations they actually do
          every week (Sync Persona / Generate report / Upload). */}
      <DashboardQuickActions onNavigate={setLocation} />

      {/* Operations Brain — auto-generated insights + activity feed.
          Replaces the FM having to bounce through 5 admin tabs to see
          what's gone stale, what's regressed, and what's recent. The
          system actively pulls these together and tells the FM what
          to do next instead of waiting to be asked. */}
      <OperationsBrain teamId={selectedTeamId} onNavigate={setLocation} />

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* GP Score Distribution */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <BarChart3 className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">GP Scores</CardTitle>
                <CardDescription className="text-xs">Average total scores per GP</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 && chartData.some(gp => gp.totalScore > 0) ? (
              <ResponsiveContainer width="100%" height={isMobile ? 260 : 300}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: isMobile ? -10 : 0, bottom: isMobile ? 60 : 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={isMobile ? 80 : 60}
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                  />
                  <YAxis 
                    domain={[0, 22]} 
                    ticks={[0, 5, 10, 15, 22]}
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    width={isMobile ? 28 : 35}
                  />
                  <Tooltip 
                    contentStyle={CHART_TOOLTIP_LIGHT}
                    formatter={(value: number, name: string) => [value.toFixed(1), name]}
                    labelFormatter={(label) => {
                      const gp = chartData.find(g => g.name === label);
                      return gp?.fullName || label;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '11px', paddingTop: 8 }} />
                  <Bar dataKey="totalScore" name="Total" fill="oklch(0.75 0.12 85)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="appearance" name="Appearance" fill="oklch(0.65 0.12 85)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="performance" name="Performance" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No evaluation data for this period</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Distribution Pie */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <PieChart className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Performance Distribution</CardTitle>
                <CardDescription className="text-xs">GPs by score range</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {performanceDistribution.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <ResponsiveContainer width="100%" height={isMobile ? 200 : 220}>
                  <RechartsPieChart>
                    <Pie
                      data={performanceDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={isMobile ? 50 : 60}
                      outerRadius={isMobile ? 75 : 90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {performanceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={CHART_TOOLTIP_LIGHT}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="flex flex-row sm:flex-col gap-2 sm:gap-3 flex-wrap justify-center">
                  {performanceDistribution.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-xs text-muted-foreground">{entry.name}: <span className="font-semibold text-foreground">{entry.value}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <PieChart className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top & Low Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Performers */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20">
                <Award className="h-4.5 w-4.5 text-emerald-500" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Top Performers</CardTitle>
                <CardDescription className="text-xs">Highest scoring GPs this month</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {topPerformers.length > 0 ? (
              <div className="space-y-2">
                {topPerformers.map((gp, idx) => (
                  <button
                    key={gp.name}
                    type="button"
                    onClick={() => setDrawerGpId(gp.gpId)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                  >
                    <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold ${
                      idx === 0 ? 'bg-primary/15 text-primary border border-primary/30' :
                      idx === 1 ? 'bg-primary/10 text-primary/80 border border-primary/20' :
                      'bg-muted text-muted-foreground border border-border'
                    }`}>
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{gp.fullName}</p>
                      <p className="text-[10px] text-muted-foreground">{gp.evalCount} evaluations</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${gp.totalScore >= 20 ? 'text-emerald-500' : 'text-primary'}`}>
                        {gp.totalScore.toFixed(1)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">/22</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32">
                <Award className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">No evaluations yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Performers / Alerts */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500/20 to-rose-500/5 border border-rose-500/20">
                <AlertTriangle className="h-4.5 w-4.5 text-rose-500" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Attention Needed</CardTitle>
                <CardDescription className="text-xs">GPs scoring below 16/22</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {lowPerformers.length > 0 ? (
              <div className="space-y-2">
                {lowPerformers.map((gp) => (
                  <button
                    key={gp.name}
                    type="button"
                    onClick={() => setDrawerGpId(gp.gpId)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all text-left"
                  >
                    <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/20">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{gp.fullName}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>App: {gp.appearance.toFixed(1)}</span>
                        <span>Perf: {gp.performance.toFixed(1)}</span>
                      </div>
                    </div>
                    <p className="text-lg font-bold text-rose-500">{gp.totalScore.toFixed(1)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                  <Award className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-emerald-600 text-sm font-medium">All GPs performing well!</p>
                <p className="text-muted-foreground text-xs mt-0.5">No scores below 16</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* GP Monthly Comparison */}
      <GPMonthlyComparisonSection isMobile={isMobile} />

      {/* Trend Section */}
      <TrendSection isMobile={isMobile} selectedTeamId={selectedTeamId} />

      <GPDetailDrawer
        gpId={drawerGpId}
        open={drawerGpId !== null}
        onOpenChange={(open) => { if (!open) setDrawerGpId(null); }}
      />
    </div>
  );
}


// ======================================
// Trend Section (Score Trends, Volume, Summary)
// ======================================
function TrendSection({ isMobile, selectedTeamId }: { isMobile: boolean; selectedTeamId?: number }) {
  const { data: trendData, isLoading: isLoadingTrend, isError: isTrendError, refetch: refetchTrend } = trpc.dashboard.monthlyTrend.useQuery({
    teamId: selectedTeamId,
    months: 6,
  });

  const hasData = trendData && trendData.length > 0;

  if (isLoadingTrend) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-80 rounded-2xl bg-muted/50 border border-border animate-pulse" />
          <div className="h-80 rounded-2xl bg-muted/50 border border-border animate-pulse" />
        </div>
      </div>
    );
  }

  if (isTrendError) {
    return (
      <Card className="border border-rose-200 bg-rose-50">
        <CardContent className="py-8 flex flex-col items-center text-center gap-3">
          <AlertTriangle className="h-8 w-8 text-rose-600" />
          <div>
            <p className="text-sm font-medium text-rose-800">Couldn't load trend data</p>
            <p className="text-xs text-rose-700 mt-1">The chart will reload when the network recovers.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchTrend()} className="mt-1">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Performance Trends
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">6-month overview of team metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score Trend Line Chart */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <TrendingUp className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Score Trends</CardTitle>
                <CardDescription className="text-xs">Average scores over 6 months</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: isMobile ? -10 : 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.75 0.12 85)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.75 0.12 85)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradAppearance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.65 0.12 85)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="oklch(0.65 0.12 85)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradPerformance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis 
                    dataKey="label" 
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    tickFormatter={(v) => v.split(' ')[0]}
                  />
                  <YAxis 
                    domain={[0, 22]} 
                    ticks={[0, 5, 10, 15, 22]}
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    width={isMobile ? 28 : 35}
                  />
                  <Tooltip 
                    contentStyle={CHART_TOOLTIP_LIGHT}
                    formatter={(value: number, name: string) => [value.toFixed(1), name]}
                  />
                  <Area type="monotone" dataKey="avgTotalScore" name="Total" stroke="oklch(0.75 0.12 85)" fill="url(#gradTotal)" strokeWidth={2.5} dot={{ r: 4, fill: 'oklch(0.75 0.12 85)', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="avgAppearanceScore" name="Appearance" stroke="oklch(0.65 0.12 85)" fill="url(#gradAppearance)" strokeWidth={1.5} dot={{ r: 3, fill: 'oklch(0.65 0.12 85)', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="avgPerformanceScore" name="Performance" stroke="#6366f1" fill="url(#gradPerformance)" strokeWidth={1.5} dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} />
                  <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '11px', paddingTop: 8 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No trend data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evaluation Volume Bar Chart */}
        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-emerald-500/10 border border-primary/20">
                <BarChart3 className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Evaluation Volume</CardTitle>
                <CardDescription className="text-xs">Evaluations and GPs per month</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: isMobile ? -10 : 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis 
                    dataKey="label" 
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    tickFormatter={(v) => v.split(' ')[0]}
                  />
                  <YAxis 
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    width={isMobile ? 28 : 35}
                  />
                  <Tooltip 
                    contentStyle={CHART_TOOLTIP_LIGHT}
                  />
                  <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '11px', paddingTop: 8 }} />
                  <Bar dataKey="totalEvaluations" name="Evaluations" fill="oklch(0.75 0.12 85)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="uniqueGPs" name="GPs Evaluated" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No volume data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Summary */}
        <Card variant="glass" className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <Target className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base">Monthly Summary</CardTitle>
                <CardDescription className="text-xs">Key metrics across the last 6 months</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {trendData.map((m, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card/50 p-3 text-center space-y-2 transition-all hover:border-primary/20 hover:bg-card">
                    <p className="text-xs text-muted-foreground font-medium">{m.label}</p>
                    <p className="text-lg font-bold text-foreground">{m.avgTotalScore > 0 ? m.avgTotalScore.toFixed(1) : '—'}</p>
                    <p className="text-[10px] text-muted-foreground">avg score</p>
                    <div className="flex items-center justify-center gap-2 text-[10px]">
                      <span className="text-emerald-600">{m.totalEvaluations} evals</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-primary">{m.uniqueGPs} GPs</span>
                    </div>
                    {m.topScore > 0 && (
                      <div className="flex items-center justify-center gap-1.5 text-[10px]">
                        <span className="text-emerald-600">↑{m.topScore}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-rose-500">↓{m.lowScore}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32">
                <Target className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">No summary data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


// ======================================
// GP Month-over-Month Comparison Component
// ======================================
function GPMonthlyComparisonSection({ isMobile }: { isMobile: boolean }) {
  const [selectedGpId, setSelectedGpId] = useState<number | undefined>(undefined);
  const { data: gpList } = trpc.gamePresenter.list.useQuery();
  const { data: gpHistory, isLoading: isLoadingHistory } = trpc.gamePresenter.monthlyHistory.useQuery(
    { gpId: selectedGpId!, monthsBack: 6 },
    { enabled: !!selectedGpId }
  );

  // One shared database — every GP is selectable, no team filter.
  const filteredGPs = useMemo(() => gpList ?? [], [gpList]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            GP Monthly Comparison
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">Track individual GP performance across months</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={selectedGpId?.toString() || "none"}
            onValueChange={(val) => setSelectedGpId(val === "none" ? undefined : Number(val))}
          >
            <SelectTrigger className="w-[200px] h-9 text-sm bg-card border-border rounded-xl">
              <SelectValue placeholder="Select GP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select a GP...</SelectItem>
              {filteredGPs.map(gp => (
                <SelectItem key={gp.id} value={gp.id.toString()}>{gp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedGpId ? (
        <Card variant="glass">
          <CardContent className="flex flex-col items-center justify-center h-48 py-8">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">Select a Game Presenter to view their monthly comparison</p>
            <p className="text-muted-foreground text-xs mt-1">Choose a team and GP from the dropdowns above</p>
          </CardContent>
        </Card>
      ) : isLoadingHistory ? (
        <Card variant="glass">
          <CardContent className="flex items-center justify-center h-48 py-8">
            <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </CardContent>
        </Card>
      ) : gpHistory && gpHistory.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Score Trend Line Chart */}
          <Card variant="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {filteredGPs.find(g => g.id === selectedGpId)?.name} — Score Trend
              </CardTitle>
              <CardDescription className="text-xs">Average scores over 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
                <LineChart data={gpHistory} margin={{ top: 10, right: 10, left: isMobile ? -10 : 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis 
                    dataKey="label" 
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    tickFormatter={(v) => v.split(' ')[0]}
                  />
                  <YAxis 
                    domain={[0, 22]} 
                    ticks={[0, 5, 10, 15, 22]}
                    className="chart-tick"
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                    width={isMobile ? 28 : 35}
                  />
                  <Tooltip 
                    contentStyle={CHART_TOOLTIP_LIGHT}
                    formatter={(value: number, name: string) => [typeof value === 'number' ? value.toFixed(1) : value, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '11px', paddingTop: 8 }} />
                  <Line type="monotone" dataKey="avgTotal" name="Total" stroke="oklch(0.75 0.12 85)" strokeWidth={2.5} dot={{ r: 4, fill: 'oklch(0.75 0.12 85)', strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="avgAppearance" name="Appearance" stroke="oklch(0.65 0.12 85)" strokeWidth={1.5} dot={{ r: 3, fill: 'oklch(0.65 0.12 85)', strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="avgPerformance" name="Performance" stroke="#6366f1" strokeWidth={1.5} dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Monthly Detail Cards */}
          <Card variant="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Breakdown</CardTitle>
              <CardDescription className="text-xs">Detailed stats per month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {gpHistory.map((m, i) => {
                  const prevMonth = i > 0 ? gpHistory[i - 1] : null;
                  const scoreDiff = prevMonth && prevMonth.avgTotal > 0 && m.avgTotal > 0 
                    ? m.avgTotal - prevMonth.avgTotal 
                    : null;
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border hover:border-primary/20 transition-all">
                      <div className="text-center min-w-[50px]">
                        <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                        <p className="text-[10px] text-muted-foreground">{m.evalCount} evals</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-lg font-bold ${
                            m.avgTotal >= 20 ? 'text-emerald-500' :
                            m.avgTotal >= 16 ? 'text-primary' :
                            m.avgTotal > 0 ? 'text-rose-500' : 'text-muted-foreground'
                          }`}>
                            {m.avgTotal > 0 ? m.avgTotal.toFixed(1) : '—'}
                          </span>
                          {scoreDiff !== null && (
                            <span className={`text-xs font-medium ${
                              scoreDiff > 0 ? 'text-emerald-500' : scoreDiff < 0 ? 'text-rose-500' : 'text-muted-foreground'
                            }`}>
                              {scoreDiff > 0 ? '+' : ''}{scoreDiff.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>App: {m.avgAppearance > 0 ? m.avgAppearance.toFixed(1) : '—'}</span>
                          <span>Perf: {m.avgPerformance > 0 ? m.avgPerformance.toFixed(1) : '—'}</span>
                          {m.mistakes > 0 && <span className="text-rose-500">{m.mistakes} mistakes</span>}
                          {m.attitude !== null && m.attitude !== 0 && (
                            <span className={m.attitude > 0 ? 'text-emerald-500' : 'text-rose-500'}>
                              Att: {m.attitude > 0 ? '+' : ''}{m.attitude}
                            </span>
                          )}
                        </div>
                      </div>
                      {m.highScore > 0 && (
                        <div className="text-right text-[10px]">
                          <span className="text-emerald-500">↑{m.highScore.toFixed(1)}</span>
                          <span className="text-muted-foreground mx-0.5">/</span>
                          <span className="text-rose-500">↓{m.lowScore.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card variant="glass">
          <CardContent className="flex flex-col items-center justify-center h-48 py-8">
            <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No history data available for this GP</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ======================================
// Cross-Team GP Comparison Component
// ======================================
// ============================================
// Dashboard Hero — primary KPI tile (avg team score) + 3 mini metric
// tiles, each with a sparkline and a "vs previous month" delta. Replaces
// the old 4-StatCard row, which was just colored boxes with numbers and
// no sense of trajectory. Hero shows whether the team is climbing or
// sliding at a glance — the most important question on the page.
// ============================================

type HeroTrendItem = {
  month: number;
  year: number;
  label: string;
  totalEvaluations: number;
  uniqueGPs: number;
  avgTotalScore: number;
};

function DashboardHero({
  avgTeamScore,
  totalGPs,
  evaluatedGPs,
  totalEvaluations,
  totalReports,
  trend,
  selectedMonth,
  selectedYear,
}: {
  avgTeamScore: number;
  totalGPs: number;
  evaluatedGPs: number;
  totalEvaluations: number;
  totalReports: number;
  trend: HeroTrendItem[];
  selectedMonth: number;
  selectedYear: number;
}) {
  // Anchor the deltas to the SELECTED month/year, not the last item in
  // trend. The previous version used `trend.slice(-2)` which assumed the
  // last item was always "current" — but when the FM views April from
  // May (current calendar month) the last item is May with 0
  // evaluations, producing fake −100% regression pills next to the
  // April number. Now we look up the selected month in the trend array
  // and use the slot before it as "previous"; if either is missing we
  // hide the delta entirely instead of fabricating a value.
  const selectedIdx = trend.findIndex(t => t.month === selectedMonth && t.year === selectedYear);
  const currentTrend = selectedIdx >= 0 ? trend[selectedIdx] : null;
  const prevTrend = selectedIdx > 0 ? trend[selectedIdx - 1] : null;

  // Headline + range + High/Low/Avg ALL must come from the same source
  // — otherwise we get the bug the user reported: headline 19.5
  // (computed from gpStats as avg-of-GP-averages) appearing under
  // a range "19.7-20.4" (computed from trend as avg-of-evaluations).
  // Two different statistics, both correct in isolation, but visually
  // they say "the headline is below the range minimum" which reads as
  // a bug.
  //
  // Fix: prefer trend.avgTotalScore for the headline (same series the
  // chart is drawn from). Fall back to avgTeamScore (gpStats source)
  // only when trend has no data for the selected month — giving the
  // user some number is better than a "—" empty state when stats
  // does have data.
  const trendCurrentValue = currentTrend ? Number(currentTrend.avgTotalScore) || 0 : 0;
  const headlineScore =
    trendCurrentValue > 0 ? trendCurrentValue
    : avgTeamScore > 0 ? avgTeamScore
    : 0;

  const previousScore = prevTrend ? (Number(prevTrend.avgTotalScore) || 0) : 0;
  const hasComparablePrev = !!prevTrend && previousScore > 0 && headlineScore > 0;

  const scoreDelta = hasComparablePrev ? headlineScore - previousScore : undefined;
  const scoreDeltaPct = hasComparablePrev ? ((headlineScore - previousScore) / previousScore) * 100 : undefined;

  // Spark series cover the full 6-month window so the line shows
  // trajectory regardless of which slot the user selected.
  const scoreSeries = trend.map((m, i) => ({ x: i, y: Number(m.avgTotalScore) || 0 }));
  const evalSeries = trend.map((m, i) => ({ x: i, y: m.totalEvaluations }));
  const gpSeries = trend.map((m, i) => ({ x: i, y: m.uniqueGPs }));

  // Mini-tile deltas use the same selectedIdx anchor so all three
  // pills move together: they all describe "current selected month vs
  // the month before it", or all three are hidden.
  const evalDelta = currentTrend && prevTrend
    ? currentTrend.totalEvaluations - prevTrend.totalEvaluations
    : undefined;
  const gpDelta = currentTrend && prevTrend
    ? currentTrend.uniqueGPs - prevTrend.uniqueGPs
    : undefined;

  const evaluatedPct = totalGPs > 0 ? Math.round((evaluatedGPs / totalGPs) * 100) : 0;

  // Range / stats include the headline value when it's from the gpStats
  // fallback path (i.e. trend had no value for selected but stats did),
  // so the "Ranged X-Y" caption never contradicts the headline.
  const scoreYs = scoreSeries.map(p => p.y).filter(y => y > 0);
  // Only merge headlineScore into the stat series when the selected
  // month is INSIDE the plotted trend window (selectedIdx >= 0). Out
  // of window, the headline came from gpStats for an unrelated period
  // — appending it here would produce labels like "Avg 7mo" and a
  // "last 6 months" range that included a value not on the chart.
  const statSeries = trendCurrentValue > 0
    ? scoreYs
    : (selectedIdx >= 0 && headlineScore > 0 ? [...scoreYs, headlineScore] : scoreYs);
  const scoreMin = statSeries.length > 0 ? Math.min(...statSeries) : 0;
  const scoreMax = statSeries.length > 0 ? Math.max(...statSeries) : 0;
  const firstLabel = trend[0]?.label;
  const lastLabel = trend[trend.length - 1]?.label;

  // Headline value: when the SELECTED period has no evaluations, fall
  // back to the most recent month with data — but ONLY months at or
  // BEFORE the selected one. Searching the whole rolling 6-month
  // window (current calendar - 5 to current) would show a FUTURE
  // value when the user selects an older period, which is factually
  // wrong as a "current" KPI.
  //
  // selectedIdx < 0 means the selected month isn't in the rolling
  // window at all (e.g. Feb 2024 selected, trend covers Dec 2025+) —
  // no fallback is meaningful in that case, render the "No data yet"
  // empty state instead of an unrelated number.
  let fallbackPoint: { idx: number; y: number } | null = null;
  if (headlineScore <= 0 && selectedIdx >= 0) {
    // Walk backwards from selectedIdx (or selectedIdx-1 if the
    // selected month itself is the empty one) to find the most recent
    // prior month with non-zero score.
    for (let i = selectedIdx; i >= 0; i--) {
      const y = scoreSeries[i]?.y ?? 0;
      if (y > 0) { fallbackPoint = { idx: i, y }; break; }
    }
  }
  const fallbackLabel = fallbackPoint ? trend[fallbackPoint.idx]?.label : null;
  const displayValue =
    headlineScore > 0 ? headlineScore.toFixed(1)
    : fallbackPoint ? fallbackPoint.y.toFixed(1)
    : null;
  const isFallback = headlineScore <= 0 && !!fallbackPoint;

  return (
    // items-start so the primary tile doesn't stretch to match the
    // 3-tile right column — was leaving ~80-120px of dead space below
    // the sparkline.
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3 sm:gap-4 items-start">
      <SparkGradients />
      {/* Primary tile — Avg Team Score */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-5 sm:p-6 shadow-sm hover:shadow-lg hover:shadow-primary/5 hover:border-primary/25 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Avg Team Score</p>
              <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
                {displayValue ? (
                  <AnimatedHeroValue value={displayValue!} />
                ) : (
                  // No data anywhere — render a calmer "no data yet" line
                  // instead of the em-dash that visually clipped to a bar.
                  <span className="text-2xl sm:text-3xl font-semibold text-muted-foreground/70 leading-none">No data yet</span>
                )}
                {hasComparablePrev && scoreDelta !== undefined && (
                  <DeltaPill delta={scoreDelta} pct={scoreDeltaPct} suffix="vs last month" />
                )}
              </div>
              {isFallback && fallbackLabel && (
                <p className="text-[11px] text-amber-700 mt-1.5">
                  Showing {fallbackLabel} — selected period has no evaluations yet
                </p>
              )}
              {!isFallback && statSeries.length >= 2 && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Ranged {scoreMin.toFixed(1)}–{scoreMax.toFixed(1)} over the last 6 months
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-primary/10 border border-primary/20 p-2.5 shrink-0">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div>
            <HeroChart
              points={trend.map((t, i) => ({
                x: i,
                y: Number(t.avgTotalScore) || 0,
                label: t.label,
                evals: t.totalEvaluations,
                gps: t.uniqueGPs,
              }))}
              height={180}
              selectedIdx={selectedIdx}
            />
            {/* Inline mini-stats below the chart fill the remaining
                vertical space with useful context — high / low / monthly
                avg of the score series — instead of leaving a blank gap. */}
            {statSeries.length >= 2 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                <SparkStat label="High" value={scoreMax.toFixed(1)} tone="emerald" />
                <SparkStat label="Low" value={scoreMin.toFixed(1)} tone="rose" />
                {/* Label is dynamic so it stays honest: when sparse
                    months exist, "Avg 4mo" is true; "6mo avg" was a
                    misleading label because we filter scoreYs to y>0
                    (averaging in zeros from empty months would drag
                    the typical-score signal toward zero, which is
                    NOT what we want — but the label needs to match). */}
                <SparkStat
                  label={statSeries.length === trend.length ? "6mo avg" : `Avg ${statSeries.length}mo`}
                  value={(statSeries.reduce((a, b) => a + b, 0) / statSeries.length).toFixed(1)}
                  tone="muted"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mini tiles — vertical stack on desktop, horizontal scroll on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3 stagger-children">
        <MiniMetric
          label="GPs evaluated"
          primary={`${evaluatedGPs}`}
          secondary={`of ${totalGPs} · ${evaluatedPct}%`}
          delta={gpDelta}
          spark={gpSeries}
          sparkLabels={trend.map(t => t.label)}
          icon={Users}
        />
        <MiniMetric
          label="Evaluations"
          primary={`${totalEvaluations}`}
          delta={evalDelta}
          spark={evalSeries}
          sparkLabels={trend.map(t => t.label)}
          icon={FileCheck}
        />
        <MiniMetric
          label="Reports"
          primary={`${totalReports}`}
          icon={FileSpreadsheet}
        />
      </div>
    </div>
  );
}

/** Animated hero value — counts up from 0 to the displayed score */
function AnimatedHeroValue({ value }: { value: string }) {
  const numVal = parseFloat(value);
  const { value: animated, ref } = useCountUp({ end: numVal, duration: 900, decimals: 1 });
  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} className="text-4xl sm:text-5xl font-bold tabular-nums text-foreground leading-none">
      {animated.toFixed(1)}
    </span>
  );
}

function DeltaPill({ delta, pct, suffix }: { delta: number; pct?: number; suffix?: string }) {
  if (delta === 0) {
    return <span className="text-xs text-muted-foreground">no change{suffix && ` · ${suffix}`}</span>;
  }
  const positive = delta > 0;
  const cls = positive
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : "bg-rose-100 text-rose-700 border-rose-200";
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>
      <Icon className="h-3 w-3" />
      {positive ? "+" : ""}{Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)}
      {pct !== undefined && Math.abs(pct) >= 0.5 && (
        <span className="opacity-75">({positive ? "+" : "−"}{Math.abs(pct).toFixed(0)}%)</span>
      )}
      {suffix && <span className="opacity-60 hidden sm:inline ml-0.5">{suffix}</span>}
    </span>
  );
}

function MiniMetric({
  label,
  primary,
  secondary,
  delta,
  spark,
  sparkLabels,
  sparkValueFormatter,
  icon: Icon,
}: {
  label: string;
  primary: string;
  secondary?: string;
  delta?: number;
  spark?: { x: number; y: number }[];
  sparkLabels?: string[];
  sparkValueFormatter?: (v: number) => string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 metric-hover">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-foreground mt-1 number-tick">{primary}</p>
          {secondary && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{secondary}</p>
          )}
        </div>
        <div className="rounded-xl bg-primary/8 border border-primary/15 p-2 shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/12">
          <Icon className="h-3.5 w-3.5 text-primary/70" />
        </div>
      </div>
      <div className="flex items-end justify-between gap-2 mt-2 min-h-[28px]">
        {delta !== undefined && delta !== 0 && (
          <DeltaPill delta={delta} />
        )}
        {spark && spark.length >= 2 && (
          <div className="flex-1 max-w-[120px] ml-auto">
            <Sparkline
              points={spark}
              color="oklch(0.65 0.13 75)"
              fillId="spark-mini-grad"
              height={24}
              strokeWidth={1.1}
              labels={sparkLabels}
              valueFormatter={sparkValueFormatter}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Tiny stand-alone sparkline. Built on raw SVG (no recharts) so it
 * stays cheap to render — the dashboard renders six of these in the
 * hero alone.
 */
/**
 * Catmull-Rom → cubic Bézier smoothing. Without this the line just
 * connects the data points with straight segments; on a 6-month series
 * with small variance that comes out as ugly jagged angles instead of
 * an "organic" trend curve.
 */
function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  const out: string[] = [`M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`];
  const tension = 0.2; // 0 = straight, ~0.5 = wavy. 0.2 is gentle.
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    out.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
  }
  return out.join(" ");
}

function Sparkline({
  points,
  color,
  fillId,
  height = 28,
  strokeWidth = 1.25,
  labels,
  valueFormatter,
}: {
  points: { x: number; y: number }[];
  color: string;
  /** Optional id for an SVG <linearGradient> defined outside; we reference
   *  via fill="url(#id)". Lets the parent pick a tasteful gradient (faded
   *  at the bottom) instead of a solid color blob. */
  fillId?: string;
  height?: number;
  strokeWidth?: number;
  labels?: string[];
  valueFormatter?: (v: number) => string;
}) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  if (points.length < 2) {
    return <div className="text-[10px] text-muted-foreground/60 italic">need 2+ months for trend</div>;
  }
  // Use a wider viewBox so smoothing has resolution to work with
  const w = 200;
  const h = height;
  const ys = points.map(p => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  // Tight vertical padding — the line can almost touch top/bottom.
  // Bigger padding leaves dead band that looks like wasted space.
  const pad = 2;
  const usableH = h - pad * 2;
  const xStep = w / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: i * xStep,
    y: pad + usableH - ((p.y - minY) / range) * usableH,
  }));

  const linePath = smoothPath(coords);
  // Area = line + drop straight to baseline + close. Use baseline
  // slightly below the sparkline so the gradient has somewhere to fade.
  const areaPath = `${linePath} L ${w.toFixed(2)} ${h} L 0 ${h} Z`;
  const lastPoint = coords[coords.length - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!labels || labels.length === 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(relX * (points.length - 1));
    const clamped = Math.max(0, Math.min(points.length - 1, idx));
    setHoveredIdx(clamped);
  };

  const handleMouseLeave = () => setHoveredIdx(null);

  const fmt = valueFormatter ?? ((v: number) => v.toString());

  return (
    <div className="relative" ref={containerRef}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full block cursor-crosshair"
        style={{ height }}
        role="img"
        aria-label={labels ? `Trend: ${labels.map((l, i) => `${l}: ${fmt(points[i].y)}`).join(", ")}` : "Trend sparkline"}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {fillId && <path d={areaPath} fill={`url(#${fillId})`} />}
        <path d={linePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={lastPoint.x} cy={lastPoint.y} r="2.5" fill={color} stroke="white" strokeWidth="1" />
        {/* Hover indicator dot */}
        {hoveredIdx !== null && labels && (
          <circle
            cx={coords[hoveredIdx].x}
            cy={coords[hoveredIdx].y}
            r="3.5"
            fill="white"
            stroke={color}
            strokeWidth="2"
            className="transition-all duration-100"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
          />
        )}
        {/* Invisible hit areas for each data point */}
        {labels && coords.map((c, i) => (
          <rect
            key={i}
            x={c.x - xStep / 2}
            y={0}
            width={xStep}
            height={h}
            fill="transparent"
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}
      </svg>
      {/* Tooltip */}
      {hoveredIdx !== null && labels && labels[hoveredIdx] && (
        <div
          className="absolute z-50 pointer-events-none px-2 py-1 rounded-lg bg-popover text-popover-foreground border border-border shadow-lg text-[11px] font-medium whitespace-nowrap transition-all duration-150"
          style={{
            left: `${(coords[hoveredIdx].x / w) * 100}%`,
            top: "-8px",
            transform: "translate(-50%, -100%)",
          }}
        >
          <span className="text-muted-foreground">{labels[hoveredIdx]}:</span>{" "}
          <span className="font-bold tabular-nums">{fmt(points[hoveredIdx].y)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Shared SVG <defs> mounted once at the top of the dashboard so all
 * sparklines below can reference the same gradient ids.
 */
function SparkGradients() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        {/* Hero spark gradient — bumped from 0.35 to 0.55 so the area
            actually reads as a filled shape on screens, not a barely-
            visible tint. Mid-stop at 50% gives the gradient a softer,
            more shaped look than a linear fade-to-transparent. */}
        <linearGradient id="spark-primary-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.62 0.16 75)" stopOpacity="0.55" />
          <stop offset="55%" stopColor="oklch(0.62 0.16 75)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="oklch(0.62 0.16 75)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="spark-mini-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.62 0.16 75)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="oklch(0.62 0.16 75)" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Small stat tile rendered below the hero sparkline: High/Low/6mo avg. */
function SparkStat({ label, value, tone }: { label: string; value: string; tone: "emerald" | "rose" | "muted" }) {
  const cls =
    tone === "emerald" ? "border-emerald-200 bg-emerald-50/60 text-emerald-700" :
    tone === "rose" ? "border-rose-200 bg-rose-50/60 text-rose-700" :
    "border-border bg-muted/30 text-foreground";
  return (
    <div className={`rounded-xl border p-2.5 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className="text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Quick Actions strip — the 4 ops the FM does most often, promoted
 * from buried admin tabs / sub-pages to one-click cards on the
 * dashboard. Was previously a multi-step navigation each time.
 */
function DashboardQuickActions({ onNavigate }: { onNavigate: (path: string) => void }) {
  const actions: { label: string; description: string; icon: React.ComponentType<{ className?: string }>; path: string; tone: "amber" | "violet" | "blue" | "emerald" }[] = [
    { label: "Sync Persona", description: "Pull attendance now", icon: RefreshCw, path: "/admin?tab=persona", tone: "amber" },
    { label: "Generate report", description: "Monthly Excel + email", icon: FileSpreadsheet, path: "/reports", tone: "violet" },
    { label: "Upload screenshots", description: "Evaluations + attitude", icon: Upload, path: "/upload", tone: "blue" },
    { label: "Review attendance", description: "Sick / late / extra", icon: Calendar, path: "/attendance", tone: "emerald" },
  ];
  const toneClasses: Record<string, string> = {
    amber: "from-amber-50 to-orange-50 border-amber-200 hover:border-amber-300 text-amber-700",
    violet: "from-violet-50 to-purple-50 border-violet-200 hover:border-violet-300 text-violet-700",
    blue: "from-sky-50 to-blue-50 border-sky-200 hover:border-sky-300 text-sky-700",
    emerald: "from-emerald-50 to-teal-50 border-emerald-200 hover:border-emerald-300 text-emerald-700",
  };
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
      {actions.map(a => (
        <button
          key={a.path}
          type="button"
          onClick={() => onNavigate(a.path)}
          className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3 sm:p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${toneClasses[a.tone]}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="rounded-xl bg-white/70 backdrop-blur-sm border border-white p-2">
              <a.icon className="h-4 w-4" />
            </div>
            <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </div>
          <p className="text-sm font-semibold text-foreground leading-tight">{a.label}</p>
          <p className="text-[11px] text-foreground/60 mt-0.5">{a.description}</p>
        </button>
      ))}
    </div>
  );
}

// ============================================
// Operations Brain — auto-generated insights + recent activity feed.
// Tells the FM what needs attention and shows recent system activity in
// one consolidated panel, replacing 5 separate admin sub-tab visits.
// ============================================

type Insight = {
  id: string;
  kind: "missing_report" | "score_regression" | "score_improvement" | "coverage_gap" | "evaluation_stale" | "attendance_risk" | "error_spike" | "top_performer" | "sustained_decline";
  severity: "alert" | "warning" | "recommendation" | "celebration" | "info";
  title: string;
  description: string;
  action?: { label: string; href: string };
  timestamp: string | Date;
  metadata?: { gpId?: number; gpName?: string; teamId?: number; teamName?: string };
};

type ActivityItem = {
  id: string;
  kind: "sync" | "report" | "evaluation" | "error_file";
  timestamp: string | Date;
  title: string;
  detail?: string;
  href?: string;
  status?: "success" | "partial" | "failed";
};

function OperationsBrain({ teamId, onNavigate }: { teamId?: number; onNavigate: (path: string) => void }) {
  const { data: insights, isLoading: insightsLoading, isError: insightsError, refetch: refetchInsights } = trpc.dashboard.insights.useQuery({ teamId });
  const { data: activity, isLoading: activityLoading, isError: activityError, refetch: refetchActivity } = trpc.dashboard.activityFeed.useQuery({ limit: 12, teamId });

  const list = (insights ?? []) as Insight[];
  const feed = (activity ?? []) as ActivityItem[];

  const counts = useMemo(() => {
    const c = { alert: 0, warning: 0, recommendation: 0, celebration: 0 };
    for (const i of list) {
      if (i.severity in c) (c as any)[i.severity]++;
    }
    return c;
  }, [list]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-3 sm:gap-4">
      {/* Insights panel */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-gradient-to-r from-card via-card to-primary/5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-2">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">What needs your attention</h3>
              <p className="text-[11px] text-muted-foreground">
                {insightsLoading
                  ? "Scanning…"
                  : insightsError
                    ? "Couldn't load — see below"
                    : list.length === 0
                      ? "Everything's quiet — no issues detected"
                      : `${counts.alert + counts.warning} need action · ${counts.recommendation} suggested · ${counts.celebration} wins`}
              </p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-border">
          {insightsLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : insightsError ? (
            // Error path is distinct from "all caught up" — without this
            // a transient server failure would render the friendly green
            // "no issues detected" empty state, hiding real alerts from
            // the FM during outages.
            <div className="p-8 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 mb-3">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
              <p className="text-sm font-medium text-foreground">Couldn't load insights</p>
              <p className="text-xs text-muted-foreground mt-0.5">Real alerts may be hidden — try again.</p>
              <button
                type="button"
                onClick={() => refetchInsights()}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 mb-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-foreground">All caught up</p>
              <p className="text-xs text-muted-foreground mt-0.5">No stale syncs, missing reports, or score regressions detected for your teams.</p>
            </div>
          ) : (
            list.map(i => <InsightCard key={i.id} insight={i} onNavigate={onNavigate} />)
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-muted/50 p-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
              <p className="text-[11px] text-muted-foreground">Last {feed.length} events</p>
            </div>
          </div>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {activityLoading ? (
            <div className="p-5 space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : activityError ? (
            // Same rationale as the insights error branch — distinguish
            // load failure from "genuinely no recent activity" so the FM
            // knows the feed isn't authoritative right now.
            <div className="p-8 text-center">
              <AlertTriangle className="h-6 w-6 text-rose-600 mx-auto mb-2" />
              <p className="text-sm text-foreground">Couldn't load activity</p>
              <button
                type="button"
                onClick={() => refetchActivity()}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          ) : feed.length === 0 ? (
            <div className="p-8 text-center">
              <Clock className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No recent activity</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {feed.map(item => (
                <ActivityRow key={item.id} item={item} onNavigate={onNavigate} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightCard({ insight, onNavigate }: { insight: Insight; onNavigate: (path: string) => void }) {
  const sev = severityStyle(insight.severity);
  const Icon = severityIcon(insight.severity);
  return (
    <div className="px-5 py-3 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`shrink-0 rounded-lg p-1.5 ${sev.iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${sev.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">{insight.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
          {insight.action && (
            <button
              type="button"
              onClick={() => onNavigate(insight.action!.href)}
              className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${sev.actionColor} hover:underline`}
            >
              {insight.action.label}
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ item, onNavigate }: { item: ActivityItem; onNavigate: (path: string) => void }) {
  const Icon = activityIcon(item.kind);
  const ts = new Date(item.timestamp);
  return (
    <li>
      <button
        type="button"
        disabled={!item.href}
        onClick={() => item.href && onNavigate(item.href)}
        className="w-full text-left px-5 py-2.5 hover:bg-muted/20 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-muted/50 p-1.5 mt-0.5">
            <Icon className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground leading-tight truncate">{item.title}</p>
            {item.detail && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.detail}</p>
            )}
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground/80 mt-1 tabular-nums">
            {formatRelativeTime(ts)}
          </span>
        </div>
      </button>
    </li>
  );
}

function severityStyle(severity: Insight["severity"]) {
  switch (severity) {
    case "alert":
      return { iconBg: "bg-rose-100", iconColor: "text-rose-600", actionColor: "text-rose-700" };
    case "warning":
      return { iconBg: "bg-amber-100", iconColor: "text-amber-600", actionColor: "text-amber-700" };
    case "recommendation":
      return { iconBg: "bg-blue-100", iconColor: "text-blue-600", actionColor: "text-blue-700" };
    case "celebration":
      return { iconBg: "bg-emerald-100", iconColor: "text-emerald-600", actionColor: "text-emerald-700" };
    default:
      return { iconBg: "bg-muted", iconColor: "text-muted-foreground", actionColor: "text-foreground" };
  }
}

function severityIcon(severity: Insight["severity"]) {
  switch (severity) {
    case "alert": return AlertTriangle;
    case "warning": return Zap;
    case "recommendation": return Target;
    case "celebration": return Award;
    default: return Sparkles;
  }
}

function activityIcon(kind: ActivityItem["kind"]) {
  switch (kind) {
    case "sync": return RefreshCw;
    case "report": return FileSpreadsheet;
    case "evaluation": return FileCheck;
    case "error_file": return AlertTriangle;
    default: return Clock;
  }
}

/**
 * Format a date as a friendly relative time ("3m ago", "2h ago", "Apr 12").
 * Returns absolute date when older than ~7 days, since "23 days ago" is
 * less useful than the actual date.
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ============================================
// HeroChart — rich avg-score chart for the dashboard hero
//
// Replaces the plain Sparkline used previously. Adds:
//   - Y-axis: 4 horizontal grid lines with min/max/quartile labels
//   - X-axis: month label under EVERY data point (not just first/last)
//   - Visible dot markers on every month (filled gold)
//   - Pulse animation on the selected month (or last with data)
//   - Hover tooltip per dot showing month + avg + evals + unique GPs
//   - Smooth Bézier curve + multi-stop area gradient (deeper at peak)
//   - Empty months (y=0) rendered as semi-transparent dots; line breaks
//     the area shape so it doesn't drag down to zero
// ============================================

type HeroChartPoint = {
  x: number;
  y: number;
  label: string;
  evals: number;
  gps: number;
};

function HeroChart({
  points,
  height = 180,
  selectedIdx,
}: {
  points: HeroChartPoint[];
  height?: number;
  selectedIdx: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div
        className="rounded-xl border border-dashed border-border bg-muted/20 flex items-center justify-center text-xs text-muted-foreground/70 italic"
        style={{ height }}
      >
        Need at least 2 months of data to draw the trend
      </div>
    );
  }

  // Layout
  const W = 600;
  const H = height;
  const padTop = 22;       // headroom for value bubbles on hover
  const padBottom = 28;    // x-axis labels
  const padLeft = 32;      // y-axis labels
  const padRight = 8;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  // Y-axis range — pad min/max so the line doesn't stick to edges
  const ys = points.map(p => p.y).filter(y => y > 0);
  const dataMin = ys.length > 0 ? Math.min(...ys) : 0;
  const dataMax = ys.length > 0 ? Math.max(...ys) : 25;
  const range = Math.max(dataMax - dataMin, 1);
  const yPad = range * 0.25;
  const yMin = Math.max(0, dataMin - yPad);
  const yMax = dataMax + yPad;
  const yScale = (v: number) => padTop + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const xStep = innerW / (points.length - 1);
  const xScale = (i: number) => padLeft + i * xStep;

  // Horizontal grid lines — 4 ticks (top / 2 inner / bottom)
  const gridTicks = [yMax, (yMax * 2 + yMin) / 3, (yMax + yMin * 2) / 3, yMin];

  // Line / area path (Bézier smoothing on non-zero points only;
  // anchor zero points to the local trend so the line doesn't dive)
  const smoothPath = (coords: { x: number; y: number }[]): string => {
    if (coords.length === 0) return "";
    if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
    const out: string[] = [`M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`];
    const tension = 0.2;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i - 1] ?? coords[i];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      out.push(
        `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
      );
    }
    return out.join(" ");
  };

  const coords = points.map((p, i) => ({
    x: xScale(i),
    y: p.y > 0 ? yScale(p.y) : padTop + innerH * 0.6, // soft anchor for zero
    raw: p,
    isZero: p.y <= 0,
  }));
  const linePath = smoothPath(coords);
  const areaPath = `${linePath} L ${xScale(points.length - 1).toFixed(2)} ${(padTop + innerH).toFixed(2)} L ${padLeft.toFixed(2)} ${(padTop + innerH).toFixed(2)} Z`;

  // Highlight: prefer hovered dot, else selectedIdx (clamp to series),
  // else last non-zero point.
  const highlightIdx = (() => {
    if (hoverIdx != null) return hoverIdx;
    if (selectedIdx >= 0 && selectedIdx < points.length) return selectedIdx;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].y > 0) return i;
    }
    return points.length - 1;
  })();
  const highlight = coords[highlightIdx];
  const highlightPoint = points[highlightIdx];

  return (
    <div className="relative w-full" style={{ height: H }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-full block overflow-visible"
        role="img"
        aria-label={`Trend across ${points.map(p => `${p.label}: ${p.y.toFixed(1)}`).join(", ")}`}
      >
        <defs>
          <linearGradient id="hero-area-rich" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.65 0.18 75)" stopOpacity="0.55" />
            <stop offset="40%" stopColor="oklch(0.62 0.16 75)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="oklch(0.62 0.16 75)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hero-line-rich" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.62 0.16 75)" />
            <stop offset="50%" stopColor="oklch(0.68 0.18 75)" />
            <stop offset="100%" stopColor="oklch(0.62 0.16 75)" />
          </linearGradient>
          {/* Soft pulse around the highlighted dot */}
          <radialGradient id="hero-pulse">
            <stop offset="0%" stopColor="oklch(0.68 0.18 75)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="oklch(0.68 0.18 75)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Y-axis grid + labels */}
        {gridTicks.map((tickValue, i) => {
          const y = yScale(tickValue);
          return (
            <g key={`grid-${i}`}>
              <line
                x1={padLeft}
                x2={W - padRight}
                y1={y}
                y2={y}
                stroke="oklch(0.92 0.005 260)"
                strokeWidth="1"
                strokeDasharray={i === 0 || i === gridTicks.length - 1 ? undefined : "3 3"}
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                fontSize="9"
                fontWeight="500"
                textAnchor="end"
                fill="oklch(0.55 0.01 260)"
                className="tabular-nums select-none"
              >
                {tickValue.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Area + line */}
        <path d={areaPath} fill="url(#hero-area-rich)" />
        <path
          d={linePath}
          fill="none"
          stroke="url(#hero-line-rich)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Pulse halo behind the highlight */}
        {highlightPoint.y > 0 && (
          <circle
            cx={highlight.x}
            cy={highlight.y}
            r="14"
            fill="url(#hero-pulse)"
            className="origin-center"
            style={{ animation: "hero-chart-pulse 2.4s ease-in-out infinite" }}
          />
        )}

        {/* X-axis tick line */}
        <line
          x1={padLeft}
          x2={W - padRight}
          y1={padTop + innerH}
          y2={padTop + innerH}
          stroke="oklch(0.85 0.005 260)"
          strokeWidth="1"
        />

        {/* Dots + hover targets */}
        {coords.map((c, i) => {
          const isHl = i === highlightIdx;
          const isHover = hoverIdx === i;
          return (
            <g key={`dot-${i}`}>
              {/* Invisible wide hit area for easier hovering */}
              <rect
                x={c.x - xStep / 2}
                y={padTop}
                width={xStep}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ cursor: c.raw.y > 0 ? "pointer" : "default" }}
              />
              {/* Vertical hover guide */}
              {isHover && c.raw.y > 0 && (
                <line
                  x1={c.x}
                  x2={c.x}
                  y1={padTop}
                  y2={padTop + innerH}
                  stroke="oklch(0.75 0.05 75)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
              )}
              {/* Dot */}
              {c.raw.y > 0 ? (
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isHl ? 5 : isHover ? 4.5 : 3}
                  fill="oklch(0.66 0.18 75)"
                  stroke="white"
                  strokeWidth={isHl ? 2.5 : 2}
                  className="transition-all"
                />
              ) : (
                <circle
                  cx={c.x}
                  cy={c.y}
                  r="2.5"
                  fill="oklch(0.85 0.005 260)"
                  stroke="white"
                  strokeWidth="1.5"
                />
              )}
              {/* X-axis month label */}
              <text
                x={c.x}
                y={padTop + innerH + 16}
                fontSize="9"
                fontWeight={isHl ? "600" : "500"}
                textAnchor="middle"
                fill={isHl ? "oklch(0.30 0.02 260)" : "oklch(0.55 0.01 260)"}
                className="uppercase tracking-wider select-none"
              >
                {c.raw.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip — absolute-positioned div for crisper text rendering
          than SVG <text>, plus drop-shadow */}
      {hoverIdx != null && coords[hoverIdx].raw.y > 0 && (
        <ChartTooltip
          coord={coords[hoverIdx]}
          point={points[hoverIdx]}
          containerW={W}
          containerH={H}
          padLeft={padLeft}
          padRight={padRight}
          padTop={padTop}
        />
      )}

      {/* Pulse keyframes (only need to be defined once globally; safe
          to inline since the @keyframes name is namespaced) */}
      <style>{`
        @keyframes hero-chart-pulse {
          0%, 100% { transform: scale(0.85); opacity: 0.55; transform-origin: center; transform-box: fill-box; }
          50% { transform: scale(1.25); opacity: 0.15; transform-origin: center; transform-box: fill-box; }
        }
      `}</style>
    </div>
  );
}

function ChartTooltip({
  coord,
  point,
  containerW,
  padLeft,
  padRight,
}: {
  coord: { x: number; y: number };
  point: HeroChartPoint;
  containerW: number;
  containerH: number;
  padLeft: number;
  padRight: number;
  padTop: number;
}) {
  // Position via percentage so it tracks the SVG's responsive scaling.
  // Flip horizontal anchor when near the right edge to avoid clipping.
  const xPct = (coord.x / containerW) * 100;
  const flipRight = coord.x > containerW - padRight - 100;
  return (
    <div
      className="pointer-events-none absolute -translate-y-full mb-2 px-2.5 py-1.5 rounded-lg bg-foreground text-background shadow-lg text-[11px] tabular-nums whitespace-nowrap"
      style={{
        left: `${xPct}%`,
        top: 0,
        transform: flipRight
          ? `translate(calc(-100% - 4px), -8px)`
          : `translate(calc(-50% + ${padLeft / containerW * 100 / 2}px), -8px)`,
      }}
    >
      <p className="font-semibold uppercase tracking-wider text-[9px] opacity-70">{point.label}</p>
      <p className="font-bold text-sm leading-tight mt-0.5">{point.y.toFixed(1)}</p>
      <p className="text-[10px] opacity-80 mt-0.5">{point.evals} eval{point.evals === 1 ? "" : "s"} · {point.gps} GP{point.gps === 1 ? "" : "s"}</p>
    </div>
  );
}

// ============================================
// OnboardingChecklist — five-step setup banner shown above the Quick
// Actions card on the dashboard. Each row reflects whether the FM has
// completed that milestone (created team, assigned GPs, recorded an
// evaluation, generated a report, connected an integration).
//
// Behaviour:
//   - Hides itself entirely once all 5 are done (no nag on stable accounts).
//   - Stays dismissed via localStorage if the FM clicks the × close
//     button — they shouldn't have to see it forever.
//   - Each incomplete row has a primary CTA that deep-links to the
//     right page so the FM never wonders "where do I do that?".
// ============================================
function OnboardingChecklist({
  userId,
  userRole,
  hasTeam,
  hasGps,
  hasEvaluations,
  hasReports,
  hasIntegration,
  onNavigate,
}: {
  userId: number | null;
  /** "admin" can hit team/sync admin tabs; FMs can't (FMRestrictedView
   *  only allows stats/action-items/access). Used to route CTAs to
   *  destinations the current user can actually open instead of
   *  bouncing them to a dead-end stats page. */
  userRole: string;
  hasTeam: boolean;
  hasGps: boolean;
  hasEvaluations: boolean;
  hasReports: boolean;
  /** Backend-derived: any persona sync log OR any studioworks-source
   *  evaluation exists. Replaces the earlier localStorage hack that
   *  flipped to "done" on click rather than on actual successful sync. */
  hasIntegration: boolean;
  onNavigate: (path: string) => void;
}) {
  // The dismissal flag is the only piece of state still kept in
  // localStorage — it's a pure UI preference (FM doesn't want to see
  // the banner) so persisting it client-side is fine. Scoped per
  // user id so a different account on the same browser starts fresh.
  const dismissKey = userId != null ? `dashboard.onboarding.dismissed.u${userId}` : null;

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined" || !dismissKey) return false;
    return window.localStorage.getItem(dismissKey) === "1";
  });

  // Re-read dismiss flag if the user identity changes — for example,
  // after sign-in or account switch within the same tab.
  useEffect(() => {
    if (typeof window === "undefined" || !dismissKey) {
      setDismissed(false);
      return;
    }
    setDismissed(window.localStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  // CTA routing depends on role. FMs see FMRestrictedView at
  // /admin which only accepts the `stats / action-items / access`
  // tabs — sending them to `/admin?tab=teams` or `?tab=studioworks`
  // would silently land on `stats` and become a dead end. For FMs
  // we either swap the destination (setup steps that aren't
  // actionable for them get info-only treatment with no CTA) or
  // route to a tab they can actually open.
  const isAdmin = userRole === "admin";
  type Step = {
    id: string; label: string; done: boolean; optional: boolean;
    cta?: string; target?: string;
  };
  const steps: Step[] = [
    {
      id: "team",
      label: isAdmin ? "Create your first team" : "Get assigned to a team",
      done: hasTeam,
      optional: false,
      cta: isAdmin ? "Create team" : undefined,
      target: isAdmin ? "/admin?tab=teams" : undefined,
    },
    {
      id: "gps",
      label: isAdmin ? "Assign Game Presenters to a team" : "Get Game Presenters assigned to your team",
      done: hasGps,
      optional: false,
      cta: isAdmin ? "Assign GPs" : undefined,
      target: isAdmin ? "/admin?tab=teams" : undefined,
    },
    { id: "eval",   label: "Record your first evaluation", done: hasEvaluations, cta: "Open Workspace",  target: "/workspace", optional: false },
    { id: "report", label: "Generate a monthly report",     done: hasReports,     cta: "Generate report", target: "/reports",   optional: false },
    {
      id: "sync",
      label: "Connect Persona or Studioworks (optional)",
      done: hasIntegration,
      optional: true,
      // Only admins see the CTA — FMs can't open the studioworks
      // admin tab. Step still renders so the admin team can see at
      // a glance whether sync is configured.
      cta: isAdmin ? "Set up sync" : undefined,
      target: isAdmin ? "/admin?tab=studioworks" : undefined,
    },
  ];
  // Progress + auto-hide are driven by the REQUIRED steps only.
  // The sync step is labelled "(optional)" — gating allDone on it
  // would keep the banner up forever for FMs who finish their core
  // setup but never wire Persona / Studioworks (a valid choice).
  const required = steps.filter(s => !s.optional);
  const requiredDone = required.filter(s => s.done).length;
  const allDone = requiredDone === required.length;
  // Display counters use the full step list so the FM can still see
  // their bonus progress on the optional integration step.
  const doneCount = steps.filter(s => s.done).length;
  const total = steps.length;

  if (allDone || dismissed) return null;

  const handleAction = (target: string) => {
    // No more pre-marking on click — the integration milestone is now
    // driven by the backend `dashboard.integrationStatus` query.
    onNavigate(target);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-yellow-50/60 to-white shadow-sm">
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" aria-hidden />
      <div className="px-5 py-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-amber-100 to-yellow-100 border border-amber-200 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-amber-700" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Get your floor running</h3>
              <p className="text-[11px] text-slate-600">
                {requiredDone}/{required.length} required steps · {total - required.length > 0 ? `${doneCount - requiredDone}/${total - required.length} optional · ` : ""}finish setup so the system can do its job
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Inline progress ring */}
            <div className="relative h-9 w-9">
              <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#fcd34d33" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="14" fill="none" stroke="#f59e0b" strokeWidth="3"
                  strokeDasharray={`${(requiredDone / required.length) * 88} 88`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-amber-700 tabular-nums">
                {Math.round((requiredDone / required.length) * 100)}%
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                if (typeof window !== "undefined" && dismissKey) {
                  window.localStorage.setItem(dismissKey, "1");
                }
              }}
              className="h-7 w-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600"
              aria-label="Dismiss onboarding checklist"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {steps.map(step => (
            <li
              key={step.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                step.done
                  ? "bg-emerald-50/60 border-emerald-200/60"
                  : "bg-white border-slate-200 hover:border-amber-300 transition-colors"
              }`}
            >
              <span className={`h-5 w-5 shrink-0 rounded-full border flex items-center justify-center ${
                step.done
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : "bg-white border-slate-300 text-transparent"
              }`}>
                <CheckCircle2 className="h-3 w-3" />
              </span>
              <span className={`text-xs flex-1 min-w-0 truncate ${
                step.done ? "text-slate-500 line-through" : "text-slate-800 font-medium"
              }`}>
                {step.label}
              </span>
              {!step.done && step.cta && step.target && (
                <button
                  type="button"
                  onClick={() => handleAction(step.target!)}
                  className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 hover:text-amber-900 inline-flex items-center gap-0.5 shrink-0"
                >
                  {step.cta} <ChevronRight className="h-3 w-3" />
                </button>
              )}
              {!step.done && !step.cta && (
                <span className="text-[10px] uppercase tracking-wider text-slate-400 italic shrink-0">
                  waiting on admin
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
