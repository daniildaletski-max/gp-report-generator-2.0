import React, { useState, useCallback, useEffect, useMemo, useDeferredValue, memo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useUrlState, urlString } from "@/hooks/useUrlState";
import { ActionItemsBoardTab } from "@/components/admin/ActionItemsBoardTab";
import { StudioworksImportButton } from "@/components/StudioworksImporter";
const ADMIN_TABS = ["overview", "invitations", "users", "stats", "action-items", "access", "errors", "studioworks"] as const;
type AdminTab = (typeof ADMIN_TABS)[number];

const FM_TABS = ["stats", "action-items", "access"] as const;
type FmTab = (typeof FM_TABS)[number];
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  FileSpreadsheet, FileCheck, Loader2, Users, AlertTriangle, Trash2, Link, Copy, Check,
  RefreshCw, ExternalLink, Star, AlertCircle, UserCog, Download, Shield,
  Building2, Plus, Edit, BarChart3, Activity, CheckSquare, Square, RotateCcw,
  TrendingUp, TrendingDown, Search, Filter, X, Eye, EyeOff, Calendar,
  Award, Target, Zap, Clock, ChevronUp, ChevronDown, ChevronRight, Mail, Send, UserPlus,
  MailCheck, MailX, MailQuestion, Sparkles, Timer, Trophy, ThumbsUp, ThumbsDown,
  MoreVertical, Gamepad2
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function AdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // If not admin, show restricted view
  if (!isAdmin) {
    return <FMRestrictedView />;
  }

  return <FullAdminPanel />;
}

// Restricted view for Floor Managers
function FMRestrictedView() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useUrlState<FmTab>(
    "tab",
    "stats",
    raw => (FM_TABS.includes(raw as FmTab) ? (raw as FmTab) : "stats"),
    v => (v === "stats" ? null : v),
  );

  const { data: gamePresenters, isLoading: gpsLoading, refetch: refetchGPs } = trpc.gamePresenter.list.useQuery();
  const { data: accessTokens, isLoading: tokensLoading, refetch: refetchTokens } = trpc.gpAccess.list.useQuery();

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-100 to-yellow-100 border border-amber-200 shadow-sm">
            <Users className="h-6 w-6 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Management</h1>
            <p className="text-sm text-slate-500">Company-wide stats, plans and access links</p>
          </div>
        </div>
        <Badge className="bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border border-amber-300 rounded-xl px-4 py-2 font-semibold shadow-sm">
          <Users className="h-3 w-3 mr-1" />
          Floor Manager
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as FmTab)} className="space-y-5">
        <TabsList className="bg-white border border-amber-200/60 rounded-xl p-1 grid w-full grid-cols-3 h-auto gap-0.5 shadow-sm">
          <TabsTrigger value="stats" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <Star className="h-4 w-4 shrink-0" />
            <span className="text-xs font-medium">GP Stats</span>
          </TabsTrigger>
          <TabsTrigger value="action-items" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <Target className="h-4 w-4 shrink-0" />
            <span className="text-xs font-medium">Plans</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <Link className="h-4 w-4 shrink-0" />
            <span className="text-xs font-medium">GP Access Links</span>
          </TabsTrigger>
        </TabsList>

        {/* GP Stats Tab */}
        <GPStatsTab
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          setSelectedMonth={setSelectedMonth}
          setSelectedYear={setSelectedYear}
          isFMView={true}
        />

        {/* Action Items board — company-wide */}
        <ActionItemsBoardTab />

        {/* GP Access Links Tab */}
        <GPAccessLinksTab 
          gamePresenters={gamePresenters || []}
          accessTokens={accessTokens || []}
          refetchTokens={refetchTokens}
          refetchGPs={refetchGPs}
          isLoading={gpsLoading || tokensLoading}
        />
      </Tabs>
    </div>
  );
}

// Full Admin Panel
function FullAdminPanel() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useUrlState<AdminTab>(
    "tab",
    "overview",
    raw => (ADMIN_TABS.includes(raw as AdminTab) ? (raw as AdminTab) : "overview"),
    v => (v === "overview" ? null : v),
  );

  const { data: errorFiles, isLoading: filesLoading, refetch: refetchFiles } = trpc.errorFile.list.useQuery();
  const { data: gamePresenters, isLoading: gpsLoading, refetch: refetchGPs } = trpc.gamePresenter.list.useQuery();
  const { data: accessTokens, isLoading: tokensLoading, refetch: refetchTokens } = trpc.gpAccess.list.useQuery();

  if (filesLoading || gpsLoading || tokensLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6 min-h-screen animate-fade-in">
        <div className="page-header">
          <div className="skeleton-enhanced h-8 w-48 rounded-lg" />
          <div className="skeleton-enhanced h-4 w-64 rounded mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="stat-card-enhanced stat-card-gold p-5">
              <div className="flex items-center gap-3">
                <div className="skeleton-enhanced h-10 w-10 rounded-xl" />
                <div className="flex-1">
                  <div className="skeleton-enhanced h-3 w-20 rounded mb-2" />
                  <div className="skeleton-enhanced h-6 w-16 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-100 to-yellow-100 border border-amber-200 shadow-sm">
            <Shield className="h-6 w-6 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
            <p className="text-sm text-slate-500">System administration and management</p>
          </div>
        </div>
        <Badge className="bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border border-amber-300 rounded-xl px-4 py-2 font-semibold shadow-sm">
          Administrator
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as AdminTab)} className="space-y-5">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <TabsList className="bg-white border border-amber-200/60 rounded-xl p-1 inline-flex w-auto min-w-full h-auto gap-0.5 shadow-sm">
          <TabsTrigger value="overview" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline text-xs font-medium">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="invitations" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <UserPlus className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline text-xs font-medium">Invites</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <UserCog className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline text-xs font-medium">Users</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <Star className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline text-xs font-medium">GP Stats</span>
          </TabsTrigger>
          <TabsTrigger value="action-items" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <Target className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline text-xs font-medium">Plans</span>
          </TabsTrigger>
          <TabsTrigger value="access" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <Link className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline text-xs font-medium">GP Access</span>
          </TabsTrigger>
          <TabsTrigger value="errors" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline text-xs font-medium">Errors</span>
          </TabsTrigger>
          <TabsTrigger value="studioworks" className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-slate-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200/60 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
            <FileCheck className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline text-xs font-medium">Studioworks</span>
          </TabsTrigger>
        </TabsList>
        </div>

        {/* Overview Tab */}
        <AdminOverviewTab onTabChange={setActiveTab} />

        {/* Invitations Tab */}
        <InvitationsTab />

        {/* User Management Tab */}
        <UserManagementTab />

        {/* GP Stats Tab */}
        <GPStatsTab
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          setSelectedMonth={setSelectedMonth}
          setSelectedYear={setSelectedYear}
          isFMView={false}
        />

        {/* Action Items board */}
        <ActionItemsBoardTab />

        {/* GP Access Links Tab */}
        <GPAccessLinksTab 
          gamePresenters={gamePresenters || []}
          accessTokens={accessTokens || []}
          refetchTokens={refetchTokens}
          refetchGPs={refetchGPs}
          isLoading={false}
        />

        {/* Error Files Tab */}
        <ErrorFilesTab 
          errorFiles={errorFiles || []}
          refetchFiles={refetchFiles}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          setSelectedMonth={setSelectedMonth}
          setSelectedYear={setSelectedYear}
        />


        {/* Studioworks Sync Tab */}
        <StudioworksSyncTab />
      </Tabs>
    </div>
  );
}

// Admin Overview Tab with system stats
function AdminOverviewTab({ onTabChange }: { onTabChange: (tab: AdminTab) => void }) {
  const { data: adminStats, isLoading } = trpc.dashboard.adminStats.useQuery();
  const [, navigate] = useLocation();
  // Quick Actions: switch sub-tab via the parent's setActiveTab. Using
  // wouter `navigate('/admin?tab=...')` doesn't work here because the
  // pathname is unchanged ('/admin') — wouter treats it as a no-op
  // and the URL-derived tab state never updates. Calling the parent
  // setter directly is reliable and keeps URL state in sync via the
  // useUrlState hook in AdminPanel.
  const goTab = useCallback((t: string) => onTabChange(t as AdminTab), [onTabChange]);

  if (isLoading) {
    return (
      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </TabsContent>
    );
  }

  // Each stat card opens a destination. Sub-admin tabs use the parent
  // setter (kind: "tab"); cross-page targets use wouter navigate (kind: "url").
  const statCards: Array<{
    title: string; value: number; icon: React.ComponentType<{ className?: string }>;
    tone: "amber" | "indigo" | "emerald" | "sky" | "violet";
    target: { kind: "tab"; tab: AdminTab } | { kind: "url"; url: string };
  }> = [
    { title: "Total Users", value: adminStats?.totalUsers || 0, icon: Users, tone: "amber", target: { kind: "tab", tab: "users" } },
    { title: "Game Presenters", value: adminStats?.totalGPs || 0, icon: Star, tone: "emerald", target: { kind: "tab", tab: "stats" } },
    { title: "Evaluations", value: adminStats?.totalEvaluations || 0, icon: Target, tone: "sky", target: { kind: "url", url: "/evaluations" } },
    { title: "Reports", value: adminStats?.totalReports || 0, icon: FileSpreadsheet, tone: "violet", target: { kind: "url", url: "/reports" } },
  ];
  const openStat = (target: typeof statCards[number]["target"]) => {
    if (target.kind === "tab") onTabChange(target.tab);
    else navigate(target.url);
  };
  const toneClasses: Record<string, { bg: string; iconBg: string; iconText: string; ring: string; accent: string }> = {
    amber: { bg: "bg-gradient-to-br from-amber-50 to-amber-50/40 border-amber-200/70", iconBg: "bg-amber-100 border-amber-200", iconText: "text-amber-700", ring: "hover:ring-amber-300/60", accent: "from-amber-400" },
    indigo: { bg: "bg-gradient-to-br from-indigo-50 to-indigo-50/40 border-indigo-200/70", iconBg: "bg-indigo-100 border-indigo-200", iconText: "text-indigo-700", ring: "hover:ring-indigo-300/60", accent: "from-indigo-400" },
    emerald: { bg: "bg-gradient-to-br from-emerald-50 to-emerald-50/40 border-emerald-200/70", iconBg: "bg-emerald-100 border-emerald-200", iconText: "text-emerald-700", ring: "hover:ring-emerald-300/60", accent: "from-emerald-400" },
    sky: { bg: "bg-gradient-to-br from-sky-50 to-sky-50/40 border-sky-200/70", iconBg: "bg-sky-100 border-sky-200", iconText: "text-sky-700", ring: "hover:ring-sky-300/60", accent: "from-sky-400" },
    violet: { bg: "bg-gradient-to-br from-violet-50 to-violet-50/40 border-violet-200/70", iconBg: "bg-violet-100 border-violet-200", iconText: "text-violet-700", ring: "hover:ring-violet-300/60", accent: "from-violet-400" },
  };

  const quickActions = [
    { label: "Manage Users", icon: UserCog, tone: "amber" as const, count: adminStats?.totalUsers, target: "users" },
    { label: "View GP Stats", icon: Star, tone: "emerald" as const, count: adminStats?.totalGPs, target: "stats" },
    { label: "Check Errors", icon: AlertTriangle, tone: "rose" as const, count: undefined, target: "errors" },
  ];
  const actionToneClasses: Record<string, { border: string; iconBg: string }> = {
    amber: {
      border: "border-amber-200/60 hover:border-amber-300 hover:bg-amber-50 text-slate-700 hover:text-amber-800",
      iconBg: "bg-amber-100 text-amber-700 border border-amber-200",
    },
    indigo: {
      border: "border-indigo-200/60 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700 hover:text-indigo-800",
      iconBg: "bg-indigo-100 text-indigo-700 border border-indigo-200",
    },
    emerald: {
      border: "border-emerald-200/60 hover:border-emerald-300 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800",
      iconBg: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    },
    rose: {
      border: "border-rose-200/60 hover:border-rose-300 hover:bg-rose-50 text-slate-700 hover:text-rose-800",
      iconBg: "bg-rose-100 text-rose-700 border border-rose-200",
    },
  };

  return (
    <TabsContent value="overview" className="space-y-6">
      {/* Main Stats — color-coded, clickable, gradient backgrounds */}
      <div className="grid gap-4 md:grid-cols-5">
        {statCards.map((stat, idx) => {
          const c = toneClasses[stat.tone];
          return (
            <button
              key={idx}
              type="button"
              onClick={() => openStat(stat.target)}
              className={`relative overflow-hidden rounded-2xl border p-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md group ${c.bg} ${c.ring} hover:ring-2`}
            >
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.accent} via-current/40 to-transparent opacity-50 group-hover:opacity-100 transition-opacity`} aria-hidden />
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${c.iconBg} group-hover:scale-110 transition-transform duration-300`}>
                  <stat.icon className={`h-5 w-5 ${c.iconText}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{stat.title}</p>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums leading-tight">{stat.value.toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400 group-hover:text-slate-600 transition-colors">
                Open <ChevronRight className="h-3 w-3" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Quick Actions — live counts + tone-coded hover */}
      <Card className="border border-amber-200/50 shadow-sm">
        <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-100 border border-amber-200">
              <Zap className="h-3.5 w-3.5 text-amber-700" />
            </div>
            Quick Actions
          </CardTitle>
          <CardDescription>Jump straight into the most-used admin pages.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickActions.map((qa) => {
              const tc = actionToneClasses[qa.tone];
              return (
                <button
                  key={qa.target}
                  type="button"
                  onClick={() => goTab(qa.target)}
                  className={`group relative rounded-xl border bg-white py-3 px-3 flex items-center gap-3 transition-all duration-200 hover:shadow-sm ${tc.border}`}
                >
                  <span className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-105 ${tc.iconBg}`}>
                    <qa.icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block text-sm font-semibold leading-tight truncate">{qa.label}</span>
                    {qa.count != null && (
                      <span className="block text-[10px] uppercase tracking-wider opacity-60 tabular-nums mt-0.5">
                        {qa.count.toLocaleString()} {qa.count === 1 ? "item" : "items"}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-30 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Live System Health Monitor */}
      <SystemHealthMonitor />
    </TabsContent>
  );
}

// User Management Tab Component
function UserManagementTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  
  const { data: users, isLoading, refetch } = trpc.user.list.useQuery();
  const updateRole = trpc.user.updateRole.useMutation({
    onSuccess: () => {
      toast.success("User role updated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update role");
    },
  });

  const deleteUser = trpc.user.delete.useMutation({
    onSuccess: () => {
      toast.success("User deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete user");
    },
  });

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(u => {
      const user = u.user;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = user.name?.toLowerCase() || "";
        const email = user.email?.toLowerCase() || "";
        if (!name.includes(query) && !email.includes(query)) return false;
      }
      if (filterRole && filterRole !== "all" && user.role !== filterRole) return false;
      return true;
    });
  }, [users, searchQuery, filterRole]);

  const hasActiveFilters = searchQuery || (filterRole && filterRole !== "all");

  return (
    <TabsContent value="users" className="space-y-4">
      <div className="unified-card">
        <div className="unified-card-header">
          <div className="flex items-center justify-between">
            <div className="section-header" style={{ paddingLeft: 0 }}>
              <h3 className="section-title flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                User Management
              </h3>
              <p className="section-subtitle">
                {filteredUsers.length} of {users?.length || 0} users
                {hasActiveFilters && " (filtered)"}
              </p>
            </div>
          </div>
        </div>
        <div className="unified-card-body space-y-4">
          {/* Filters */}
          <div className="filter-bar">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
            
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setFilterRole("all"); }}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-enhanced h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredUsers.length > 0 ? (
            <div className="table-enhanced">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const user = u.user;
                    return (
                    <TableRow key={user.id} className="table-row-enhanced">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {(user.name || user.email || "?")[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium">{user.name || "No name"}</div>
                            <div className="text-sm text-muted-foreground">{user.email || "No email"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(role) => updateRole.mutate({ userId: user.id, role: role as "admin" | "user" })}
                        >
                          <SelectTrigger className="w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3" />
                                Admin
                              </div>
                            </SelectItem>
                            <SelectItem value="user">
                              <div className="flex items-center gap-2">
                                <Users className="h-3 w-3" />
                                User
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(user.createdAt), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{user.name || user.email}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUser.mutate({ userId: user.id })}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );})}                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <UserCog className="h-8 w-8" />
              </div>
              <h3 className="empty-state-title">
                {hasActiveFilters ? "No users match your filters" : "No users found"}
              </h3>
              <p className="empty-state-description">
                {hasActiveFilters ? "Try adjusting your filters" : "Users will appear here once registered"}
              </p>
            </div>
          )}
        </div>
      </div>
    </TabsContent>
  );
}

// GP Access Links Tab Component
/**
 * Inline editor for a GP's real (legal) name — used by the Persona
 * matcher. Saves on blur or Enter; null/empty clears the column.
 */
function RealNameInput({ gpId, initialValue }: { gpId: number; initialValue: string }) {
  const [value, setValue] = useState(initialValue ?? "");
  const setRealName = trpc.gamePresenter.setRealName.useMutation({
    onSuccess: () => toast.success("Real name saved"),
    onError: (e) => toast.error(e.message || "Failed to save"),
  });
  useEffect(() => { setValue(initialValue ?? ""); }, [initialValue]);
  const dirty = (value || "") !== (initialValue || "");
  const commit = () => {
    if (!dirty || setRealName.isPending) return;
    setRealName.mutate({ id: gpId, realName: value.trim() === "" ? null : value });
  };
  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      placeholder="e.g. Aleksandra Borovkova"
      className="h-8 text-sm"
      disabled={setRealName.isPending}
    />
  );
}

function GPAccessLinksTab({
  gamePresenters,
  accessTokens,
  refetchTokens,
  refetchGPs,
  isLoading
}: {
  gamePresenters: any[];
  accessTokens: any[];
  refetchTokens: () => void;
  refetchGPs: () => void;
  isLoading: boolean;
}) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [generatingForGp, setGeneratingForGp] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  // Export to CSV function
  const exportToCSV = () => {
    setIsExportingCSV(true);
    try {
      // Prepare CSV data
      const csvRows: string[] = [];
      csvRows.push('GP Name,Access Link,Status,Last Accessed');

      gamePresenters.forEach(gp => {
        const tokenData = accessTokens.find(t => t.token?.gamePresenterId === gp.id && t.token?.isActive === 1);
        const token = tokenData?.token;

        const gpName = gp.name.replace(/,/g, ' ');
        const accessLink = token ? `${window.location.origin}/gp-portal/${token.token}` : '';
        const status = token ? 'Active' : 'No Link';
        const lastAccessed = token?.lastAccessedAt ? new Date(token.lastAccessedAt).toLocaleDateString() : '-';

        csvRows.push(`${gpName},${accessLink},${status},${lastAccessed}`);
      });
      
      // Create and download CSV file
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gp-access-links-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`Exported ${gamePresenters.length} GP access links to CSV`);
    } catch (error) {
      toast.error('Failed to export CSV');
    } finally {
      setIsExportingCSV(false);
    }
  };

  const generateToken = trpc.gpAccess.generateToken.useMutation({
    onSuccess: () => {
      toast.success("Access link generated");
      refetchTokens();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate link");
    },
  });

  const generateAllTokens = trpc.gpAccess.generateAllTokens.useMutation({
    onSuccess: (result) => {
      toast.success(`Generated ${result.totalGenerated} access links (${result.totalSkipped} already had links)`);
      refetchTokens();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate links");
    },
  });

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    try {
      await generateAllTokens.mutateAsync({});
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const deactivateToken = trpc.gpAccess.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Access link deactivated");
      refetchTokens();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to deactivate link");
    },
  });

  const handleGenerateToken = async (gpId: number) => {
    setGeneratingForGp(gpId);
    try {
      await generateToken.mutateAsync({ gpId });
    } finally {
      setGeneratingForGp(null);
    }
  };

  const copyToClipboard = (token: string) => {
    const url = `${window.location.origin}/gp-portal/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const filteredGPs = useMemo(() => {
    if (!searchQuery) return gamePresenters;
    const query = searchQuery.toLowerCase();
    return gamePresenters.filter(gp => gp.name.toLowerCase().includes(query));
  }, [gamePresenters, searchQuery]);

  return (
    <TabsContent value="access" className="space-y-4">
      <div className="unified-card">
        <div className="unified-card-header">
          <div className="section-header" style={{ paddingLeft: 0 }}>
            <h3 className="section-title flex items-center gap-2">
              <Link className="h-5 w-5" />
              GP Access Links
            </h3>
            <p className="section-subtitle">
              Generate unique access links for Game Presenters to view their evaluations.
            </p>
          </div>
          <div className="pt-2 flex gap-2">
            <Button 
              onClick={handleGenerateAll}
              disabled={isGeneratingAll}
              className="gap-2"
            >
              {isGeneratingAll ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
              ) : (
                <><Zap className="h-4 w-4" /> Generate All Links</>
              )}
            </Button>
            <Button 
              variant="outline"
              onClick={exportToCSV}
              disabled={isExportingCSV || gamePresenters.length === 0}
              className="gap-2"
            >
              {isExportingCSV ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Exporting...</>
              ) : (
                <><Download className="h-4 w-4" /> Export to CSV</>
              )}
            </Button>
          </div>
        </div>
        <div className="unified-card-body space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search Game Presenters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-enhanced h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredGPs.length > 0 ? (
            <div className="table-enhanced">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Real name <span className="text-[10px] font-normal text-muted-foreground">(for Persona)</span></TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Access Link</TableHead>
                    <TableHead className="w-[150px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                          {filteredGPs.map((gp) => {
                            // accessTokens returns {token: {...}, gp: {...}} structure
                            const tokenData = accessTokens.find(t => t.token?.gamePresenterId === gp.id && t.token?.isActive === 1);
                            const token = tokenData ? { ...tokenData.token, gpId: tokenData.token?.gamePresenterId } : null;
                            return (
                              <TableRow key={gp.id} className="table-row-enhanced">
                                <TableCell className="font-medium">{gp.name}</TableCell>
                                <TableCell>
                                  <RealNameInput gpId={gp.id} initialValue={(gp as any).realName ?? ""} />
                                </TableCell>
                                <TableCell>
                                  {token ? (
                                    <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
                                      <Check className="h-3 w-3 mr-1" />
                                      Active
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">No Link</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {token ? (
                                    <code className="text-xs bg-muted px-2 py-1 rounded">
                                      /gp-portal/{token.token.slice(0, 8)}...
                                    </code>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    {token ? (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => copyToClipboard(token.token)}
                                        >
                                          {copiedToken === token.token ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                          ) : (
                                            <Copy className="h-4 w-4" />
                                          )}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => window.open(`/gp-portal/${token.token}`, "_blank")}
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-destructive hover:text-destructive"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Deactivate Link</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                This will revoke access for {gp.name}. They will no longer be able to view their evaluations.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() => deactivateToken.mutate({ id: token.id })}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                              >
                                                Deactivate
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => handleGenerateToken(gp.id)}
                                        disabled={generatingForGp === gp.id}
                                      >
                                        {generatingForGp === gp.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : (
                                          <Plus className="h-4 w-4 mr-2" />
                                        )}
                                        Generate
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Link className="h-8 w-8" />
              </div>
              <h3 className="empty-state-title">
                {searchQuery ? "No Game Presenters match your search" : "No Game Presenters found"}
              </h3>
              <p className="empty-state-description">
                {searchQuery ? "Try adjusting your search" : "GPs will appear here once added"}
              </p>
            </div>
          )}
        </div>
      </div>
    </TabsContent>
  );
}

// Error Files Tab Component
function ErrorFilesTab({ 
  errorFiles, 
  refetchFiles,
  selectedMonth,
  selectedYear,
  setSelectedMonth,
  setSelectedYear
}: { 
  errorFiles: any[];
  refetchFiles: () => void;
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: (m: number) => void;
  setSelectedYear: (y: number) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [errorType, setErrorType] = useState<"playgon" | "mg">("playgon");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const recalculateMutation = trpc.errorFile.recalculate.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success(`Recalculated: ${data.recalculated} GPs updated from ${data.filesProcessed} files`);
        if (data.notFoundGPs?.length > 0) {
          toast.warning(`GPs not found: ${data.notFoundGPs.join(', ')}`);
        }
      } else {
        toast.warning(data.message || 'No files to recalculate');
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to recalculate');
    },
  });

  // Check if a file already exists for the selected month/year/type
  const existingFile = errorFiles.find(
    (f: any) => f.month === selectedMonth && f.year === selectedYear && f.fileType === errorType
  );

  const uploadMutation = trpc.errorFile.upload.useMutation({
    onSuccess: (data: any) => {
      // Surface a detailed parsing breakdown so the FM knows exactly
      // what landed in the system vs what got dropped — previously just
      // a generic "uploaded" toast, which made it hard to tell when
      // names didn't match across the file and the GP roster.
      const parsedCount = data.parsedErrors ?? 0;
      const updatedCount = (data.updatedGPs?.length) ?? 0;
      const notFoundCount = (data.notFoundGPs?.length) ?? 0;
      const recordsCreated = data.createdErrorRecords ?? 0;

      const parts: string[] = [];
      parts.push(`${parsedCount} error${parsedCount === 1 ? '' : 's'} parsed from file`);
      if (recordsCreated) parts.push(`${recordsCreated} record${recordsCreated === 1 ? '' : 's'} created`);
      if (updatedCount) parts.push(`${updatedCount} GP${updatedCount === 1 ? '' : 's'} matched`);
      const headline = data.replacedFileId
        ? `Replaced previous file — ${parts.join(' · ')}`
        : `Upload complete — ${parts.join(' · ')}`;

      if (notFoundCount > 0) {
        toast.warning(headline, {
          description: `Unmatched names (${notFoundCount}): ${data.notFoundGPs.slice(0, 6).join(', ')}${data.notFoundGPs.length > 6 ? `, +${data.notFoundGPs.length - 6} more` : ''}. Add them in Game Presenters or fix the spelling, then click "Recalculate".`,
          duration: 12000,
        });
      } else {
        toast.success(headline);
      }
      refetchFiles();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to upload file");
    },
  });

  const deleteMutation = trpc.errorFile.delete.useMutation({
    onSuccess: () => {
      toast.success("File deleted");
      refetchFiles();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete file");
    },
  });

  // Re-process: re-imports gpErrors from the stored .xlsx without
  // requiring the FM to re-upload. Used when DB rows drift (e.g. an
  // earlier deploy bug deleted them) but the file is still in S3.
  const reprocessMutation = trpc.errorFile.reprocess.useMutation();
  const [reprocessingId, setReprocessingId] = useState<number | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const inputEl = e.target;
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      await uploadMutation.mutateAsync({
        filename: file.name,
        errorType: errorType,
        month: selectedMonth,
        year: selectedYear,
        fileBase64: base64,
      });
    } catch (error: any) {
      if (!error?.data?.code) toast.error("Failed to read file");
    } finally {
      setIsUploading(false);
      inputEl.value = "";
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    setDeletingId(fileId);
    try {
      await deleteMutation.mutateAsync({ id: fileId });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <TabsContent value="errors" className="space-y-4">
      <div className="unified-card">
        <div className="unified-card-header">
          <div className="section-header" style={{ paddingLeft: 0 }}>
            <h3 className="section-title flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Upload Error Files
            </h3>
            <p className="section-subtitle">
              Upload Playgon or MG error files for tracking GP mistakes.
            </p>
          </div>
        </div>
        <div className="unified-card-body space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              disabled={isRecalculating}
              onClick={async () => {
                setIsRecalculating(true);
                try {
                  await recalculateMutation.mutateAsync({ month: selectedMonth, year: selectedYear });
                } finally {
                  setIsRecalculating(false);
                }
              }}
            >
              {isRecalculating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Recalculate Error Counts
            </Button>
            <span className="text-xs text-muted-foreground">
              Re-reads "Error Count Analysis" col E from stored files for {MONTHS[selectedMonth - 1]} {selectedYear}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Error Type</Label>
              <Select value={errorType} onValueChange={(v: "playgon" | "mg") => setErrorType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="playgon">Playgon</SelectItem>
                  <SelectItem value="mg">MG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={idx} value={String(idx + 1)}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: new Date().getFullYear() - 2023 }, (_, i) => 2024 + i).concat([new Date().getFullYear() + 1]).filter((v, i, a) => a.indexOf(v) === i).map((year) => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>File</Label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              {existingFile && (
                <p className="text-xs text-yellow-500/80 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Existing {errorType.toUpperCase()} file for {MONTHS[selectedMonth - 1]} {selectedYear} will be replaced
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="unified-card">
        <div className="unified-card-header">
          <div className="section-header" style={{ paddingLeft: 0 }}>
            <h3 className="section-title">Uploaded Error Files</h3>
            <p className="section-subtitle">{errorFiles.length} files uploaded</p>
          </div>
        </div>
        <div className="unified-card-body">
          {errorFiles && errorFiles.length > 0 ? (
            <div className="table-enhanced">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errorFiles.map((file) => (
                    <TableRow key={file.id} className="table-row-enhanced">
                      <TableCell className="font-medium">{file.fileName}</TableCell>
                      <TableCell>
                        <Badge variant={file.fileType === 'playgon' ? 'default' : 'secondary'}>
                          {file.fileType === 'playgon' ? 'Playgon' : 'MG'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {MONTHS[file.month - 1]} {file.year}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(file.createdAt), "dd MMM yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Re-process file (re-imports errors from the stored .xlsx without re-uploading)"
                            disabled={reprocessingId === file.id}
                            onClick={async () => {
                              setReprocessingId(file.id);
                              try {
                                const res = await reprocessMutation.mutateAsync({ errorFileId: file.id });
                                toast.success(`Re-processed: ${res.recordsCreated} error records · ${res.updatedGPs.length} GPs matched${res.notFoundGPs.length ? ` · ${res.notFoundGPs.length} unmatched` : ''}`);
                                refetchFiles();
                              } catch (e: any) {
                                toast.error(e.message || "Re-process failed");
                              } finally {
                                setReprocessingId(null);
                              }
                            }}
                          >
                            {reprocessingId === file.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={deletingId === file.id}
                            >
                              {deletingId === file.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Error File</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{file.fileName}"?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteFile(file.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h3 className="empty-state-title">No error files uploaded</h3>
              <p className="empty-state-description">Upload your first error file to track GP mistakes</p>
            </div>
          )}
        </div>
      </div>
    </TabsContent>
  );
}

// Invitations Tab Component - Modern UI for invite-only registration
function InvitationsTab() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [selectedRole, setSelectedRole] = useState<"user" | "admin">("user");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: invitations, isLoading, refetch } = trpc.invitation.list.useQuery();
  const { data: stats } = trpc.invitation.stats.useQuery();

  const createMutation = trpc.invitation.create.useMutation({
    onSuccess: (data) => {
      toast.success("Invitation created successfully");
      setIsCreateOpen(false);
      setEmail("");
      setSelectedRole("user");
      refetch();
      // Auto-copy link
      const url = `${window.location.origin}/invite/${data.token}`;
      navigator.clipboard.writeText(url);
      toast.info("Invite link copied to clipboard!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create invitation");
    },
  });

  const bulkCreateMutation = trpc.invitation.bulkCreate.useMutation({
    onSuccess: (result) => {
      toast.success(`Created ${result.successful} invitations (${result.failed} failed)`);
      setIsBulkOpen(false);
      setBulkEmails("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create invitations");
    },
  });

  const revokeMutation = trpc.invitation.revoke.useMutation({
    onSuccess: () => {
      toast.success("Invitation revoked");
      refetch();
    },
  });

  const deleteMutation = trpc.invitation.delete.useMutation({
    onSuccess: () => {
      toast.success("Invitation deleted");
      refetch();
    },
  });

  const resendMutation = trpc.invitation.resend.useMutation({
    onSuccess: (data) => {
      toast.success("New invitation link generated");
      refetch();
      const url = `${window.location.origin}/invite/${data.token}`;
      navigator.clipboard.writeText(url);
      toast.info("New link copied to clipboard!");
    },
  });

  const handleCreate = () => {
    if (!email) {
      toast.error("Please enter an email address");
      return;
    }
    createMutation.mutate({
      email,
      role: selectedRole,
      expiresInDays,
    });
  };

  const handleBulkCreate = () => {
    const emails = bulkEmails
      .split(/[\n,;]/)
      .map(e => e.trim())
      .filter(e => e && e.includes("@"));
    
    if (emails.length === 0) {
      toast.error("Please enter at least one valid email address");
      return;
    }

    bulkCreateMutation.mutate({
      emails,
      role: selectedRole,
      expiresInDays,
    });
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Link copied!");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getStatusBadge = (invitation: any) => {
    const now = new Date();
    if (invitation.status === "accepted") {
      return <Badge className="bg-green-500/20 text-green-400 border border-green-500/30"><MailCheck className="h-3 w-3 mr-1" />Accepted</Badge>;
    }
    if (invitation.status === "revoked") {
      return <Badge variant="destructive"><MailX className="h-3 w-3 mr-1" />Revoked</Badge>;
    }
    if (invitation.status === "expired" || new Date(invitation.expiresAt) < now) {
      return <Badge variant="secondary"><Timer className="h-3 w-3 mr-1" />Expired</Badge>;
    }
    return <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30"><MailQuestion className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  const filteredInvitations = useMemo(() => {
    if (!invitations) return [];
    let filtered = invitations;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(inv =>
        inv.email.toLowerCase().includes(query)
      );
    }
    
    if (statusFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter(inv => {
        if (statusFilter === "pending") {
          return inv.status === "pending" && new Date(inv.expiresAt) >= now;
        }
        if (statusFilter === "expired") {
          return inv.status === "expired" || (inv.status === "pending" && new Date(inv.expiresAt) < now);
        }
        return inv.status === statusFilter;
      });
    }
    
    return filtered;
  }, [invitations, searchQuery, statusFilter]);

  return (
    <TabsContent value="invitations" className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 animate-stagger">
        <div className="stat-card-enhanced stat-card-gold">
          <div className="icon-box">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Invitations</p>
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
          </div>
        </div>
        <div className="stat-card-enhanced stat-card-gold">
          <div className="icon-box">
            <MailQuestion className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold">{stats?.pending || 0}</p>
          </div>
        </div>
        <div className="stat-card-enhanced stat-card-green">
          <div className="icon-box">
            <MailCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Accepted</p>
            <p className="text-2xl font-bold text-green-400">{stats?.accepted || 0}</p>
          </div>
        </div>
        <div className="stat-card-enhanced stat-card-red">
          <div className="icon-box">
            <MailX className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Expired/Revoked</p>
            <p className="text-2xl font-bold">{(stats?.expired || 0) + (stats?.revoked || 0)}</p>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="unified-card">
        <div className="unified-card-header">
          <div className="flex items-center justify-between">
            <div className="section-header" style={{ paddingLeft: 0 }}>
              <h3 className="section-title flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                FM Invitations
              </h3>
              <p className="section-subtitle">
                Invite Floor Managers to join the system. They can only register with a valid invitation link.
              </p>
            </div>
            <div className="flex gap-2">
              <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Users className="h-4 w-4" />
                    Bulk Invite
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Bulk Invite Floor Managers
                    </DialogTitle>
                    <DialogDescription>
                      Enter multiple email addresses to send invitations at once.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Email Addresses</Label>
                      <Textarea
                        placeholder="Enter emails separated by commas, semicolons, or new lines...\nexample1@email.com\nexample2@email.com"
                        value={bulkEmails}
                        onChange={(e) => setBulkEmails(e.target.value)}
                        rows={5}
                      />
                      <p className="text-xs text-muted-foreground">
                        {bulkEmails.split(/[\n,;]/).filter(e => e.trim() && e.includes("@")).length} valid emails detected
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={selectedRole} onValueChange={(v: "user" | "admin") => setSelectedRole(v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Floor Manager</SelectItem>
                            <SelectItem value="admin">Administrator</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Expires In</Label>
                      <Select value={String(expiresInDays)} onValueChange={(v) => setExpiresInDays(Number(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 day</SelectItem>
                          <SelectItem value="3">3 days</SelectItem>
                          <SelectItem value="7">7 days</SelectItem>
                          <SelectItem value="14">14 days</SelectItem>
                          <SelectItem value="30">30 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsBulkOpen(false)}>Cancel</Button>
                    <Button onClick={handleBulkCreate} disabled={bulkCreateMutation.isPending}>
                      {bulkCreateMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
                      ) : (
                        <><Send className="h-4 w-4 mr-2" />Send Invitations</>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    New Invitation
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <UserPlus className="h-5 w-5" />
                      Invite Floor Manager
                    </DialogTitle>
                    <DialogDescription>
                      Create an invitation link for a new Floor Manager to join.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input
                        type="email"
                        placeholder="fm@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={selectedRole} onValueChange={(v: "user" | "admin") => setSelectedRole(v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Floor Manager</SelectItem>
                            <SelectItem value="admin">Administrator</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Expires In</Label>
                      <Select value={String(expiresInDays)} onValueChange={(v) => setExpiresInDays(Number(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 day</SelectItem>
                          <SelectItem value="3">3 days</SelectItem>
                          <SelectItem value="7">7 days</SelectItem>
                          <SelectItem value="14">14 days</SelectItem>
                          <SelectItem value="30">30 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={createMutation.isPending}>
                      {createMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</>
                      ) : (
                        <><Send className="h-4 w-4 mr-2" />Create & Copy Link</>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
        <div className="unified-card-body space-y-4">
          {/* Search and Filter */}
          <div className="filter-bar">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or team..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Invitations Table */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-enhanced h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredInvitations.length > 0 ? (
            <div className="table-enhanced">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[180px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvitations.map((inv) => {
                    const isExpired = inv.status === "expired" || (inv.status === "pending" && new Date(inv.expiresAt) < new Date());
                    const isPending = inv.status === "pending" && !isExpired;
                    
                    return (
                      <TableRow key={inv.id} className="table-row-enhanced">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            {inv.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={inv.role === "admin" ? "default" : "secondary"}>
                            {inv.role === "admin" ? (
                              <><Shield className="h-3 w-3 mr-1" />Admin</>
                            ) : (
                              <>FM</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(inv)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(inv.expiresAt), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isPending && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => copyInviteLink(inv.token)}
                                  title="Copy invite link"
                                >
                                  {copiedToken === inv.token ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => window.open(`/invite/${inv.token}`, "_blank")}
                                  title="Preview invite page"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      title="Revoke invitation"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will invalidate the invitation link for {inv.email}. They won't be able to register.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => revokeMutation.mutate({ id: inv.id })}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Revoke
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                            {(isExpired || inv.status === "revoked") && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1"
                                  onClick={() => resendMutation.mutate({ id: inv.id })}
                                  disabled={resendMutation.isPending}
                                  title="Resend with new link"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Resend
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      title="Delete invitation"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Invitation</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete the invitation record for {inv.email}.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteMutation.mutate({ id: inv.id })}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                            {inv.status === "accepted" && (
                              <span className="text-sm text-muted-foreground px-2">Completed</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <UserPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">
                {searchQuery || statusFilter !== "all" ? "No invitations match your filters" : "No invitations yet"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== "all" 
                  ? "Try adjusting your search or filter criteria"
                  : "Create your first invitation to onboard Floor Managers"
                }
              </p>
              {!searchQuery && statusFilter === "all" && (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Invitation
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </TabsContent>
  );
}

// GP Stats Tab Component
function GPStatsTab({
  selectedMonth,
  selectedYear,
  setSelectedMonth,
  setSelectedYear,
  isFMView = false
}: {
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: (m: number) => void;
  setSelectedYear: (y: number) => void;
  isFMView?: boolean;
}) {
  // One shared database — stats always cover every GP.
  const [selectedTeamId] = useState<number | null>(null);
  const [editingGpId, setEditingGpId] = useState<number | null>(null);
  const [editAttitude, setEditAttitude] = useState<number | null>(null);
  const [editMistakes, setEditMistakes] = useState<number>(0);
  const [editTotalGames, setEditTotalGames] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  // useDeferredValue lets the input stay snappy even with 60+ GPs:
  // typing updates `searchQuery` immediately for the input, but the
  // expensive filter + render on `filteredGPs` happens against the
  // deferred value so React can skip intermediate frames.
  const deferredSearch = useDeferredValue(searchQuery);

  // GP Detail Modal state
  const [detailGpId, setDetailGpId] = useState<number | null>(null);
  
  // Bulk selection state
  const [selectedGpIds, setSelectedGpIds] = useState<number[]>([]);
  const [bulkAttitude, setBulkAttitude] = useState<number>(0);

  const { data: gpsWithStats, isLoading, refetch } = trpc.gamePresenter.listWithStats.useQuery({
    teamId: selectedTeamId || undefined,
    month: selectedMonth,
    year: selectedYear,
  });

  const updateStatsMutation = trpc.gamePresenter.updateStats.useMutation({
    onSuccess: () => {
      toast.success("Stats updated");
      refetch();
      setEditingGpId(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update stats");
    },
  });

  // Bulk mutations
  const bulkSetAttitudeMutation = trpc.gamePresenter.bulkSetAttitude.useMutation({
    onSuccess: (result) => {
      toast.success(`Updated attitude for ${result.success} GPs`);
      setSelectedGpIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to bulk update attitude");
    },
  });

  const bulkResetMistakesMutation = trpc.gamePresenter.bulkResetMistakes.useMutation({
    onSuccess: (result) => {
      toast.success(`Reset mistakes for ${result.success} GPs`);
      setSelectedGpIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reset mistakes");
    },
  });

  const filteredGPs = useMemo(() => {
    if (!gpsWithStats) return [];
    if (!deferredSearch) return gpsWithStats;
    const query = deferredSearch.toLowerCase();
    return gpsWithStats.filter((gp: any) => gp.name.toLowerCase().includes(query));
  }, [gpsWithStats, deferredSearch]);

  const handleSaveStats = (gpId: number) => {
    updateStatsMutation.mutate({
      gpId,
      month: selectedMonth,
      year: selectedYear,
      attitude: editAttitude,
      mistakes: editMistakes,
      totalGames: editTotalGames,
    });
  };

  const startEditing = (gp: any) => {
    setEditingGpId(gp.id);
    setEditAttitude(gp.stats?.attitude || null);
    setEditMistakes(gp.stats?.mistakes || 0);
    setEditTotalGames(gp.stats?.totalGames || 0);
  };

  // Bulk selection handlers
  const toggleGpSelection = (gpId: number) => {
    setSelectedGpIds(prev => 
      prev.includes(gpId) ? prev.filter(id => id !== gpId) : [...prev, gpId]
    );
  };

  const toggleSelectAll = () => {
    if (!filteredGPs) return;
    if (selectedGpIds.length === filteredGPs.length) {
      setSelectedGpIds([]);
    } else {
      setSelectedGpIds(filteredGPs.map((gp: any) => gp.id));
    }
  };

  const handleBulkSetAttitude = () => {
    if (selectedGpIds.length === 0) {
      toast.error("Please select at least one GP");
      return;
    }
    bulkSetAttitudeMutation.mutate({
      gpIds: selectedGpIds,
      attitude: bulkAttitude,
      month: selectedMonth,
      year: selectedYear,
    });
  };

  const handleBulkResetMistakes = () => {
    if (selectedGpIds.length === 0) {
      toast.error("Please select at least one GP");
      return;
    }
    bulkResetMistakesMutation.mutate({
      gpIds: selectedGpIds,
      month: selectedMonth,
      year: selectedYear,
    });
  };

  // Stats summary with extended analytics
  const statsSummary = useMemo(() => {
    if (!filteredGPs || filteredGPs.length === 0) return null;
    const withAttitude = filteredGPs.filter((gp: any) => gp.stats?.attitude != null && gp.stats?.attitude !== 0);
    const totalAttitudeSum = filteredGPs.reduce((sum: number, gp: any) => sum + (gp.stats?.attitude || 0), 0);
    const totalMistakes = filteredGPs.reduce((sum: number, gp: any) => sum + (gp.stats?.mistakes || 0), 0);
    // For cumulative system: count GPs with positive/negative totals
    const positiveAttitude = filteredGPs.filter((gp: any) => (gp.stats?.attitude ?? 0) > 0).length;
    const negativeAttitude = filteredGPs.filter((gp: any) => (gp.stats?.attitude ?? 0) < 0).length;
    const neutralAttitude = filteredGPs.filter((gp: any) => (gp.stats?.attitude ?? 0) === 0).length;
    const totalGames = filteredGPs.reduce((sum: number, gp: any) => sum + (gp.stats?.totalGames || 0), 0);
    
    // Sum of all positive and negative attitude points
    const totalPositivePoints = filteredGPs.reduce((sum: number, gp: any) => {
      const att = gp.stats?.attitude ?? 0;
      return sum + (att > 0 ? att : 0);
    }, 0);
    const totalNegativePoints = filteredGPs.reduce((sum: number, gp: any) => {
      const att = gp.stats?.attitude ?? 0;
      return sum + (att < 0 ? Math.abs(att) : 0);
    }, 0);
    
    // Attitude distribution for cumulative system
    const attitudeDistribution = {
      negative: negativeAttitude,
      neutral: neutralAttitude,
      positive: positiveAttitude,
      totalPositivePoints,
      totalNegativePoints
    };
    
    // Top performers by attitude (highest positive totals)
    const topByAttitude = [...filteredGPs]
      .filter((gp: any) => (gp.stats?.attitude ?? 0) > 0)
      .sort((a: any, b: any) => (b.stats?.attitude ?? 0) - (a.stats?.attitude ?? 0))
      .slice(0, 5);
    
    // Negative attitude (needs attention - lowest totals)
    const needsAttention = [...filteredGPs]
      .filter((gp: any) => (gp.stats?.attitude ?? 0) < 0)
      .sort((a: any, b: any) => (a.stats?.attitude ?? 0) - (b.stats?.attitude ?? 0));
    
    // Most mistakes
    const topByMistakes = [...filteredGPs]
      .filter((gp: any) => (gp.stats?.mistakes || 0) > 0)
      .sort((a: any, b: any) => (b.stats?.mistakes || 0) - (a.stats?.mistakes || 0))
      .slice(0, 5);
    
    // Team breakdown
    const teamStats: Record<string, { count: number; positiveCount: number; negativeCount: number; totalMistakes: number }> = {};
    filteredGPs.forEach((gp: any) => {
      const teamName = gp.teamName || 'Unassigned';
      if (!teamStats[teamName]) {
        teamStats[teamName] = { count: 0, positiveCount: 0, negativeCount: 0, totalMistakes: 0 };
      }
      teamStats[teamName].count++;
      teamStats[teamName].totalMistakes += gp.stats?.mistakes || 0;
      // Sum up cumulative attitude values
      const attitudeValue = gp.stats?.attitude ?? 0;
      if (attitudeValue > 0) {
        teamStats[teamName].positiveCount += attitudeValue;
      } else if (attitudeValue < 0) {
        teamStats[teamName].negativeCount += Math.abs(attitudeValue);
      }
    });
    
    return { 
      totalAttitudeSum, 
      totalMistakes, 
      positiveAttitude, 
      negativeAttitude,
      neutralAttitude,
      total: filteredGPs.length,
      totalGames,
      attitudeDistribution,
      topByAttitude,
      needsAttention,
      topByMistakes,
      teamStats,
      withAttitudeCount: withAttitude.length
    };
  }, [filteredGPs]);

  return (
    <TabsContent value="stats" className="space-y-8">
      {/* Premium Header with Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="dashboard-header">
          <h2 className="dashboard-title">
            <div className="stat-icon-container" style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.4) 0%, rgba(184, 134, 11, 0.25) 100%)', borderColor: 'rgba(212, 175, 55, 0.5)', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25), 0 0 12px rgba(212, 175, 55, 0.15)' }}>
              <BarChart3 className="h-6 w-6 text-[#f0d060]" />
            </div>
            GP Performance Dashboard
          </h2>
          <p className="dashboard-subtitle">
            {MONTHS[selectedMonth - 1]} {selectedYear} • Visual analytics for Game Presenters
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[140px] filter-select">
              <Calendar className="h-4 w-4 mr-2 text-primary" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, idx) => (
                <SelectItem key={idx} value={String(idx + 1)}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[100px] filter-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: new Date().getFullYear() - 2023 }, (_, i) => 2024 + i).concat([new Date().getFullYear() + 1]).filter((v, i, a) => a.indexOf(v) === i).map((year) => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton-stat-card" />
          ))}
        </div>
      ) : statsSummary && (
        <>
          {/* KPI strip — calmer: smaller icons, single accent dot, no
              gradient overload, consistent spacing. Pulls all numbers
              into a single visual rhythm. */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <KpiTile label="Total GPs" value={statsSummary.total} sub={`${statsSummary.withAttitudeCount} with ratings`} tone="sky" />
            <KpiTile label="Positive" value={statsSummary.positiveAttitude} sub="positive attitude" tone="emerald" />
            <KpiTile label="Neutral" value={statsSummary.neutralAttitude} sub="no rating yet" tone="slate" />
            <KpiTile label="Negative" value={statsSummary.negativeAttitude} sub={`${statsSummary.totalMistakes} mistakes`} tone="rose" />
            <KpiTile label="Total Games" value={statsSummary.totalGames} sub="this month" tone="amber" />
          </div>

          {/* Combined Attitude block — single stacked-bar visual + side-by-side
              leaderboards in one calm card. Removes redundant icons /
              gradient overload of the previous "premium chart-card" pair. */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center">
                <Target className="h-3.5 w-3.5 text-amber-700" />
              </span>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-800">Attitude pulse</h3>
                <p className="text-[11px] text-slate-500">{MONTHS[selectedMonth - 1]} {selectedYear}</p>
              </div>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {statsSummary.withAttitudeCount}/{statsSummary.total} rated
              </span>
            </div>
            <div className="p-5 space-y-5">
              {/* Single stacked horizontal bar replacing 3 separate progress
                  rows. Width segments are proportional; 2px gap keeps them
                  visually distinct. Numbers underneath. */}
              <div>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 gap-[2px]">
                  {statsSummary.total > 0 ? (
                    <>
                      <div className="bg-emerald-400" style={{ width: `${(statsSummary.positiveAttitude / statsSummary.total) * 100}%` }} />
                      <div className="bg-slate-300" style={{ width: `${(statsSummary.neutralAttitude / statsSummary.total) * 100}%` }} />
                      <div className="bg-rose-400" style={{ width: `${(statsSummary.negativeAttitude / statsSummary.total) * 100}%` }} />
                    </>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <DistroLegend dotCls="bg-emerald-400" label="Positive" value={statsSummary.positiveAttitude} total={statsSummary.total} />
                  <DistroLegend dotCls="bg-slate-300" label="Neutral" value={statsSummary.neutralAttitude} total={statsSummary.total} />
                  <DistroLegend dotCls="bg-rose-400" label="Negative" value={statsSummary.negativeAttitude} total={statsSummary.total} />
                </div>
              </div>

              {/* Leaderboards — clean two columns, no nested chart-card noise */}
              <div className="grid gap-5 sm:grid-cols-2 pt-2 border-t border-slate-100">
                <LeaderColumn
                  tone="positive"
                  title="Top performers"
                  items={statsSummary.topByAttitude}
                />
                <LeaderColumn
                  tone="negative"
                  title="Needs attention"
                  items={statsSummary.needsAttention ?? []}
                />
              </div>
            </div>
          </div>

          {/* Team Comparison Section */}
          {Object.keys(statsSummary.teamStats).length > 1 && (
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="stat-icon-container" style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.4) 0%, rgba(184, 134, 11, 0.25) 100%)', borderColor: 'rgba(212, 175, 55, 0.5)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2), 0 0 10px rgba(212, 175, 55, 0.12)' }}>
                  <Building2 className="h-5 w-5 text-[#f0d060]" />
                </div>
                <div>
                  <h3 className="chart-title">Team Comparison</h3>
                  <p className="chart-subtitle">Performance breakdown across all teams</p>
                </div>
              </div>
              <div className="chart-card-body">
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(statsSummary.teamStats).map(([teamName, stats]: [string, any]) => (
                    <div key={teamName} className="team-comparison-card">
                      <h4 className="team-comparison-header">{teamName}</h4>
                      <div className="team-stats-grid">
                        <div className="team-stat">
                          <p className="team-stat-value blue">{stats.count}</p>
                          <p className="team-stat-label">GPs</p>
                        </div>
                        <div className="team-stat">
                          <p className="team-stat-value green">{stats.positiveCount}</p>
                          <p className="team-stat-label">+1</p>
                        </div>
                        <div className="team-stat">
                          <p className="team-stat-value red">{stats.negativeCount}</p>
                          <p className="team-stat-label">-1</p>
                        </div>
                        <div className="team-stat">
                          <p className="team-stat-value indigo">{stats.totalMistakes}</p>
                          <p className="team-stat-label">Errors</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* GP Cards Grid - Premium Design */}
      <div className="gp-grid-card">
        <div className="gp-grid-header">
          <div className="gp-grid-title">
            <div className="stat-icon-container" style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.4) 0%, rgba(59, 130, 246, 0.25) 100%)', borderColor: 'rgba(96, 165, 250, 0.5)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2), 0 0 10px rgba(96, 165, 250, 0.12)' }}>
              <Users className="h-6 w-6 text-[#93bbfd]" />
            </div>
            <div>
              <h3>All Game Presenters</h3>
              <p>Click on attitude buttons to update ratings</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="gp-search-input"
            />
          </div>
        </div>
        <div className="gp-grid-body">
          {/* Bulk Actions Bar */}
          {selectedGpIds.length > 0 && (
            <div className="bulk-actions-bar">
              <span className="bulk-actions-badge">
                {selectedGpIds.length} selected
              </span>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Set Attitude:</Label>
                <Select value={String(bulkAttitude)} onValueChange={(v) => setBulkAttitude(Number(v))}>
                  <SelectTrigger className="w-[130px] filter-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">-1 (Negative)</SelectItem>
                    <SelectItem value="0">0 (Neutral)</SelectItem>
                    <SelectItem value="1">+1 (Positive)</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  size="sm" 
                  className="btn-primary"
                  onClick={handleBulkSetAttitude}
                  disabled={bulkSetAttitudeMutation.isPending}
                >
                  {bulkSetAttitudeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Apply
                </Button>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                className="btn-secondary"
                onClick={handleBulkResetMistakes}
                disabled={bulkResetMistakesMutation.isPending}
              >
                {bulkResetMistakesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Reset Mistakes
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                className="btn-ghost"
                onClick={() => setSelectedGpIds([])}
              >
                Clear Selection
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredGPs && filteredGPs.length > 0 ? (
            <>
              {/* Bulk-select helper hint — visible only when nothing
                  selected, so the FM knows the cards' top-right
                  checkboxes mean "pick for bulk action". */}
              {selectedGpIds.length === 0 && (
                <div className="mb-3 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
                  <CheckSquare className="h-3 w-3" />
                  Tip: tick the checkboxes on multiple cards to bulk-set attitude or reset mistakes.
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredGPs.map((gp: any) => (
                  <GPStatsCard
                    key={gp.id}
                    gp={gp}
                    teamName={(gp as { teamName?: string }).teamName || 'Unassigned'}
                    isSelected={selectedGpIds.includes(gp.id)}
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    onOpenDetail={setDetailGpId}
                    onToggleSelect={toggleGpSelection}
                    onStartEdit={startEditing}
                    onUpdate={refetch}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="gp-empty-state">
              <div className="gp-empty-icon">
                <Star className="h-10 w-10" />
              </div>
              <h3 className="gp-empty-title">No Game Presenters found</h3>
              <p className="gp-empty-description">
                {searchQuery ? "Try adjusting your search" : "Select a team or add Game Presenters"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* GP Detail Modal */}
      <GPDetailModal
        gpId={detailGpId}
        month={selectedMonth}
        year={selectedYear}
        onClose={() => setDetailGpId(null)}
      />
    </TabsContent>
  );
}

// GP Detail Modal Component
function GPDetailModal({
  gpId,
  month,
  year,
  onClose,
}: {
  gpId: number | null;
  month: number;
  year: number;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.gamePresenter.getDetails.useQuery(
    { gpId: gpId!, month, year },
    { enabled: !!gpId }
  );

  const [activeTab, setActiveTab] = useState<'evaluations' | 'errors' | 'attitude'>('evaluations');

  if (!gpId) return null;

  return (
    <Dialog open={!!gpId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {isLoading ? (
          <>
            <DialogHeader>
              <DialogTitle>Loading GP Details...</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </>
        ) : data ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <span className="text-xl">{data.gp.name}</span>
                  <p className="text-sm font-normal text-muted-foreground">{data.gp.teamName}</p>
                </div>
              </DialogTitle>
            </DialogHeader>

            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-4 py-4">
              <div className="text-center p-4 rounded-lg stat-card-blue">
                <p className="text-2xl font-bold text-blue-400">{data.evaluations.length}</p>
                <p className="text-sm text-muted-foreground">Evaluations</p>
              </div>
              <div className={`text-center p-4 rounded-lg ${(data.stats.attitude ?? 0) > 0 ? 'stat-card-green' : (data.stats.attitude ?? 0) < 0 ? 'stat-card-red' : 'stat-card'}`}>
                <p className={`text-2xl font-bold ${(data.stats.attitude ?? 0) > 0 ? 'text-green-400' : (data.stats.attitude ?? 0) < 0 ? 'text-red-400' : 'text-foreground'}`}>
                  {(data.stats.attitude ?? 0) > 0 ? '+' : ''}{data.stats.attitude ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Attitude</p>
              </div>
              <div className={`text-center p-4 rounded-lg ${(data.stats.mistakes ?? 0) > 0 ? 'stat-card-red' : 'stat-card'}`}>
                <p className={`text-2xl font-bold ${(data.stats.mistakes ?? 0) > 0 ? 'text-red-400' : 'text-foreground'}`}>{data.stats.mistakes ?? 0}</p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b pb-2">
              <Button
                variant={activeTab === 'evaluations' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('evaluations')}
              >
                <Star className="h-4 w-4 mr-2" />
                Evaluations ({data.evaluations.length})
              </Button>
              <Button
                variant={activeTab === 'errors' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('errors')}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Errors ({data.errors.length})
              </Button>
              <Button
                variant={activeTab === 'attitude' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('attitude')}
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Attitude ({data.attitudeScreenshots.length})
              </Button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {activeTab === 'evaluations' && (
                <div className="space-y-3 py-4">
                  {data.evaluations.length > 0 ? (
                    data.evaluations.map((evaluation) => (
                      <div key={evaluation.id} className="p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">
                            {evaluation.date ? format(new Date(evaluation.date), 'MMM dd, yyyy') : 'N/A'}
                          </span>
                          <Badge variant="secondary">
                            Total: {evaluation.totalScore}/22
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Appearance:</span>
                            <span className="ml-2 font-medium">{evaluation.appearanceScore}/12</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Game Performance:</span>
                            <span className="ml-2 font-medium">{evaluation.gamePerformanceScore}/10</span>
                          </div>
                        </div>
                        {evaluation.comments && (
                          <p className="mt-2 text-sm text-muted-foreground italic">"{evaluation.comments}"</p>
                        )}
                        {evaluation.evaluatedBy && (
                          <p className="mt-1 text-xs text-muted-foreground">Evaluated by: {evaluation.evaluatedBy}</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No evaluations for this month</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'errors' && (
                <div className="space-y-3 py-4">
                  {data.errors.length > 0 ? (
                    data.errors.map((error) => (
                      <div key={error.id} className="p-4 rounded-lg border border-red-500/20 bg-red-500/10">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="badge-warning">
                              Excel
                            </Badge>
                            {error.errorCode && (
                              <Badge variant="secondary">{error.errorCode}</Badge>
                            )}
                          </div>
                          {error.date && (
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(error.date), 'MMM dd, yyyy')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium">{error.description || 'No description'}</p>
                        {(error.gameType || error.tableId) && (
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            {error.gameType && <span>Game: {error.gameType}</span>}
                            {error.tableId && <span>Table: {error.tableId}</span>}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No errors recorded for this month</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'attitude' && (
                <div className="space-y-3 py-4">
                  {data.attitudeScreenshots.length > 0 ? (
                    data.attitudeScreenshots.map((screenshot) => (
                      <div 
                        key={screenshot.id} 
                        className={`p-4 rounded-lg border-l-4 bg-card ${
                          screenshot.attitudeType === 'positive' 
                            ? 'border-l-green-500 bg-green-500/10' 
                            : screenshot.attitudeType === 'negative'
                            ? 'border-l-red-500 bg-red-500/10'
                            : 'border-l-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {screenshot.attitudeType === 'positive' ? (
                              <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
                                <ThumbsUp className="h-3 w-3 mr-1" />
                                POSITIVE
                              </Badge>
                            ) : screenshot.attitudeType === 'negative' ? (
                              <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">
                                <ThumbsDown className="h-3 w-3 mr-1" />
                                NEGATIVE
                              </Badge>
                            ) : (
                              <Badge variant="outline">Unknown</Badge>
                            )}
                            <span className={`font-bold text-lg ${
                              (screenshot.attitudeScore ?? 0) > 0 ? 'text-green-400' : 
                              (screenshot.attitudeScore ?? 0) < 0 ? 'text-red-400' : 'text-foreground'
                            }`}>
                              {(screenshot.attitudeScore ?? 0) > 0 ? '+' : ''}{screenshot.attitudeScore ?? 0}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {screenshot.evaluationDate 
                              ? format(new Date(screenshot.evaluationDate), 'MMM dd, yyyy HH:mm')
                              : format(new Date(screenshot.createdAt), 'MMM dd, yyyy HH:mm')}
                          </span>
                        </div>
                        {screenshot.comment && (
                          <div className="mt-2 p-3 rounded bg-muted/50">
                            <p className="text-sm">{screenshot.comment}</p>
                          </div>
                        )}
                        {screenshot.url && (
                          <a
                            href={screenshot.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Screenshot
                          </a>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <ThumbsUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No attitude entries for this month</p>
                      <p className="text-xs text-muted-foreground mt-1">Upload attitude screenshots to see entries here</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Error</DialogTitle>
            </DialogHeader>
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Failed to load GP details</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Calm KPI tile used in the GP Stats top strip. Replaces the older
// `premium-stat-card` CSS-class blocks which were too heavy on
// gradients, big icons, and redundant decoration. One label, one big
// number, one optional sub-line. Tone is set by a single 1px accent
// stripe at the top + a tiny coloured dot next to the label.
// ============================================
function KpiTile({
  label, value, sub, tone,
}: { label: string; value: number; sub: string; tone: "sky" | "emerald" | "slate" | "rose" | "amber" }) {
  const dot = tone === "sky" ? "bg-sky-400"
    : tone === "emerald" ? "bg-emerald-400"
      : tone === "rose" ? "bg-rose-400"
        : tone === "amber" ? "bg-amber-400"
          : "bg-slate-300";
  const accent = tone === "sky" ? "from-sky-300 to-sky-400"
    : tone === "emerald" ? "from-emerald-300 to-emerald-400"
      : tone === "rose" ? "from-rose-300 to-rose-400"
        : tone === "amber" ? "from-amber-300 to-amber-400"
          : "from-slate-200 to-slate-300";
  return (
    <div className="relative rounded-xl border border-slate-200 bg-white px-4 py-3 overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${accent}`} aria-hidden />
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums text-slate-900 mt-0.5 leading-tight">
        {value.toLocaleString()}
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</div>
    </div>
  );
}

// Tiny dot+label chip used in section headers for at-a-glance counts.
function SummaryChip({ dotCls, label }: { dotCls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-[11px] text-slate-700 font-medium">
      <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} aria-hidden />
      {label}
    </span>
  );
}

// One legend row for the stacked-bar Attitude pulse — coloured dot,
// label, value, and a calculated percentage in tabular-nums.
function DistroLegend({ dotCls, label, value, total }: { dotCls: string; label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`h-2 w-2 rounded-full ${dotCls} shrink-0`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-slate-600 font-medium truncate">{label}</div>
        <div className="text-xs font-semibold tabular-nums text-slate-800">{value} <span className="text-slate-400 font-normal">· {pct}%</span></div>
      </div>
    </div>
  );
}

// One column of the side-by-side leaderboard. Shows up to 5 GPs with
// rank initials, name, and a small tone-coded badge. Empty state is
// short and friendly — no large icons or block paragraphs.
function LeaderColumn({
  tone, title, items,
}: { tone: "positive" | "negative"; title: string; items: Array<{ id: number; name: string; stats?: any }> }) {
  const accent = tone === "positive"
    ? { dot: "bg-emerald-400", titleCls: "text-emerald-700", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : { dot: "bg-rose-400", titleCls: "text-rose-700", badge: "bg-rose-50 text-rose-700 border-rose-200" };
  const top = items.slice(0, 5);
  const initialsOf = (n: string) => String(n || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
  return (
    <div>
      <div className={`flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold ${accent.titleCls} mb-2`}>
        <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden />
        {title}
      </div>
      {top.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic">— nothing here yet</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((gp, idx) => (
            <li key={gp.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-slate-100 hover:border-slate-200 transition-colors">
              <span className="text-[10px] font-bold tabular-nums text-slate-400 w-4">#{idx + 1}</span>
              <span className="h-6 w-6 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 flex items-center justify-center shrink-0">
                {initialsOf(gp.name)}
              </span>
              <span className="text-xs text-slate-700 flex-1 truncate">{gp.name}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${accent.badge}`}>
                {tone === "positive" ? `+${Math.abs((gp.stats?.attitude ?? 1))}` : (gp.stats?.attitude ?? -1)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================
// GPStatsCard — memoized card for the All Game Presenters grid.
// Heavy rewrite to eliminate the duplicate-ATTITUDE display, surface
// the bulk-select checkbox properly, expose the previously-hidden Edit
// action, and add an "Open in Workspace" shortcut. Wrapped in
// React.memo with a custom equality so typing in the search box
// doesn't cascade re-renders into 60+ cards.
// ============================================
const GPStatsCard = memo(function GPStatsCard({
  gp,
  teamName,
  isSelected,
  selectedMonth,
  selectedYear,
  onOpenDetail,
  onToggleSelect,
  onStartEdit,
  onUpdate,
}: {
  gp: any;
  teamName: string;
  isSelected: boolean;
  selectedMonth: number;
  selectedYear: number;
  onOpenDetail: (gpId: number) => void;
  onToggleSelect: (gpId: number) => void;
  onStartEdit: (gp: any) => void;
  onUpdate: () => void;
}) {
  const [, navigate] = useLocation();
  const attitude = gp.stats?.attitude;
  const mistakes = gp.stats?.mistakes || 0;
  const totalGames = gp.stats?.totalGames || 0;
  const attitudeValue = attitude ?? 0;
  const tone = attitudeValue > 0 ? "positive" : attitudeValue < 0 ? "negative" : "neutral";

  const initials = useMemo(() => {
    const parts = String(gp.name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [gp.name]);

  return (
    <div
      className={`group gp-card ${tone === "positive" ? "gp-card-positive" : tone === "negative" ? "gp-card-negative" : ""} cursor-pointer ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
      onClick={() => onOpenDetail(gp.id)}
    >
      {/* Header — avatar + name/team, bulk-select checkbox top-right */}
      <div className="gp-card-header flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className={`h-9 w-9 shrink-0 rounded-xl border flex items-center justify-center text-xs font-bold tabular-nums ${
            tone === "positive" ? "bg-emerald-500/15 text-emerald-700 border-emerald-300/60"
            : tone === "negative" ? "bg-rose-500/15 text-rose-700 border-rose-300/60"
            : "bg-slate-200/60 text-slate-700 border-slate-300/60"
          }`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="gp-card-name truncate">{gp.name}</h4>
            <p className="gp-card-team truncate">{teamName}</p>
          </div>
        </div>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(gp.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${gp.name} for bulk actions`}
          className="mt-0.5 shrink-0"
        />
      </div>

      {/* Body — single-row attitude controls. Removed the duplicate
          ATTITUDE label + standalone badge — the value lives only in
          the central button between -/+. */}
      <div className="gp-card-body" onClick={(e) => e.stopPropagation()}>
        <QuickAttitudeButtons
          gpId={gp.id}
          currentAttitude={attitude ?? null}
          currentMistakes={mistakes}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onUpdate={onUpdate}
        />
      </div>

      {/* Footer — mistakes + games as left-anchored stats; right-side
          action cluster (Open in Workspace, Edit) is always visible
          (the previous opacity-0 group-hover trick was broken because
          the parent didn't have `group`). */}
      <div className="gp-card-footer flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5"
            title={mistakes === 0 ? "No mistakes this month" : `${mistakes} mistake${mistakes === 1 ? "" : "s"} this month`}
          >
            <AlertTriangle className={`h-3.5 w-3.5 ${mistakes > 0 ? "text-rose-500" : "text-slate-400"}`} />
            <span className={`text-xs font-semibold tabular-nums ${mistakes > 0 ? "text-rose-600" : "text-slate-500"}`}>
              {mistakes}
            </span>
          </div>
          <div className="flex items-center gap-1.5" title={`${totalGames} games this month`}>
            <Gamepad2 className="h-3.5 w-3.5 text-sky-500" />
            <span className="text-xs font-semibold tabular-nums text-slate-700">
              {totalGames.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-500 hover:text-primary"
            title="Open in Workspace"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/workspace?gp=${gp.id}`);
            }}
          >
            <Zap className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-500 hover:text-primary"
            title="Edit numbers manually"
            onClick={(e) => { e.stopPropagation(); onStartEdit(gp); }}
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  // Only re-render this card when its own data, selection state, or
  // the active month/year changes. Without this, every keystroke in
  // the search box re-rendered all 60 cards because the parent
  // re-creates `filteredGPs` array reference.
  return (
    prev.gp.id === next.gp.id &&
    prev.gp.name === next.gp.name &&
    prev.gp.stats?.attitude === next.gp.stats?.attitude &&
    prev.gp.stats?.mistakes === next.gp.stats?.mistakes &&
    prev.gp.stats?.totalGames === next.gp.stats?.totalGames &&
    prev.teamName === next.teamName &&
    prev.isSelected === next.isSelected &&
    prev.selectedMonth === next.selectedMonth &&
    prev.selectedYear === next.selectedYear
  );
});

// Quick Attitude Buttons Component - Cumulative system: each click adds/subtracts from total
function QuickAttitudeButtons({
  gpId, 
  currentAttitude, 
  currentMistakes,
  selectedMonth, 
  selectedYear, 
  onUpdate 
}: { 
  gpId: number;
  currentAttitude: number | null;
  currentMistakes: number;
  selectedMonth: number;
  selectedYear: number;
  onUpdate: () => void;
}) {
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const updateStatsMutation = trpc.gamePresenter.updateStats.useMutation();

  // Add to current attitude (cumulative)
  const handleAddAttitude = async (delta: number) => {
    const action = delta > 0 ? 'add' : 'subtract';
    setIsUpdating(action);
    try {
      const newAttitude = (currentAttitude ?? 0) + delta;
      await updateStatsMutation.mutateAsync({
        gpId,
        month: selectedMonth,
        year: selectedYear,
        attitude: newAttitude,
        mistakes: currentMistakes,
      });
      const label = delta > 0 ? '+1 added' : '-1 added';
      toast.success(`Attitude: ${label} (Total: ${newAttitude >= 0 ? '+' : ''}${newAttitude})`);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Failed to update");
    } finally {
      setIsUpdating(null);
    }
  };

  // Reset attitude to 0
  const handleReset = async () => {
    setIsUpdating('reset');
    try {
      await updateStatsMutation.mutateAsync({
        gpId,
        month: selectedMonth,
        year: selectedYear,
        attitude: 0,
        mistakes: currentMistakes,
      });
      toast.success('Attitude reset to 0');
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Failed to reset");
    } finally {
      setIsUpdating(null);
    }
  };

  const attitudeValue = currentAttitude ?? 0;
  const tone = attitudeValue > 0 ? "positive" : attitudeValue < 0 ? "negative" : "neutral";
  const valueClasses = tone === "positive"
    ? "bg-emerald-500/15 text-emerald-700 border-emerald-300/60"
    : tone === "negative"
      ? "bg-rose-500/15 text-rose-700 border-rose-300/60"
      : "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <div className="flex items-stretch gap-1.5">
      {/* Subtract button */}
      <Button
        size="sm"
        variant="ghost"
        className="gp-attitude-button-negative flex-1 h-9"
        onClick={() => handleAddAttitude(-1)}
        disabled={isUpdating !== null}
        title="Add -1 to attitude"
      >
        {isUpdating === 'subtract' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ThumbsDown className="h-4 w-4" />
        )}
      </Button>

      {/* Central value display — single source of truth for attitude.
          Click to reset to 0. */}
      <Button
        size="sm"
        variant="ghost"
        className={`px-2 h-9 min-w-[64px] font-bold tabular-nums border ${valueClasses} hover:opacity-90 focus:opacity-90`}
        onClick={handleReset}
        disabled={isUpdating !== null}
        title="Click to reset to 0"
      >
        {isUpdating === 'reset' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span className="text-base leading-none">
            {attitudeValue >= 0 ? '+' : ''}{attitudeValue}
          </span>
        )}
      </Button>

      {/* Add button */}
      <Button
        size="sm"
        variant="ghost"
        className="gp-attitude-button-positive flex-1 h-9"
        onClick={() => handleAddAttitude(1)}
        disabled={isUpdating !== null}
        title="Add +1 to attitude"
      >
        {isUpdating === 'add' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ThumbsUp className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}


// ============================================
// System Health Monitor Component
// ============================================
function SystemHealthMonitor() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { data: health, isLoading, error, refetch, dataUpdatedAt } = trpc.dashboard.serverHealth.useQuery(
    undefined,
    {
      refetchInterval: autoRefresh ? 30000 : false, // Auto-refresh every 30s
      retry: 2,
    }
  );

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    return `${minutes}m ${secs}s`;
  };

  const formatBytes = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb} MB`;
  };

  const lastChecked = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';
  const isOnline = health?.status === 'ok';
  const dbConnected = health?.database?.status === 'connected';
  // Use the real V8 heap cap (`heapLimit`) as the denominator instead
  // of `heapTotal` (the current V8 allocation). Otherwise the bar
  // sits at 95%+ as a steady state because V8 sizes `heapTotal` just
  // ahead of `heapUsed` and grows lazily — meaningless for an
  // operator. Falls back to `heapTotal` when `heapLimit` isn't yet
  // present (older API responses).
  const memoryDenominator =
    (health?.memory && (health.memory as any).heapLimit) ||
    health?.memory?.heapTotal ||
    0;
  const memoryPercent = health?.memory && memoryDenominator > 0
    ? Math.round((health.memory.heapUsed / memoryDenominator) * 100)
    : 0;

  return (
    <div className="unified-card">
      <div className="unified-card-header">
        <div className="flex items-center justify-between w-full">
          <div className="section-header" style={{ paddingLeft: 0 }}>
            <h3 className="section-title flex items-center gap-2">
              <Activity className={`h-5 w-5 ${isOnline ? 'text-green-500' : error ? 'text-red-500' : 'text-muted-foreground'}`} />
              System Health Monitor
            </h3>
            <p className="section-subtitle">
              Last checked: {lastChecked}
              {autoRefresh && <span className="text-primary ml-1">• Auto-refresh ON</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                autoRefresh
                  ? 'bg-green-500/10 border-green-500/20 text-green-400'
                  : 'bg-muted/50 border-border text-muted-foreground'
              }`}
            >
              {autoRefresh ? 'Auto' : 'Manual'}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>
      <div className="unified-card-body">
        {isLoading && !health ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 rounded-xl bg-red-500/5 border border-red-500/20 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 font-medium">Server Unreachable</p>
            <p className="text-sm text-muted-foreground mt-1">Unable to connect to the health endpoint</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
              <RefreshCw className="h-3 w-3 mr-1" /> Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Server Status */}
              <div className={`p-4 rounded-xl border transition-all ${
                isOnline
                  ? 'bg-green-500/5 border-green-500/20'
                  : 'bg-red-500/5 border-red-500/20'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Server</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                    <span className={`text-xs font-semibold ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                      {isOnline ? 'Online' : 'Error'}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Latency</span>
                    <span className={`font-medium ${
                      (health?.latency ?? 0) < 100 ? 'text-green-400' : (health?.latency ?? 0) < 500 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {health?.latency ?? 0}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Environment</span>
                    <span className="text-foreground font-medium">{health?.environment}</span>
                  </div>
                </div>
              </div>

              {/* Uptime */}
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Uptime</span>
                  <Clock className="h-4 w-4 text-blue-400" />
                </div>
                <p className="text-xl font-bold text-blue-400">
                  {health?.uptime ? formatUptime(health.uptime) : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Node {health?.nodeVersion || '—'}
                </p>
              </div>

              {/* Memory Usage */}
              <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Memory</span>
                  <span className={`text-xs font-semibold ${
                    memoryPercent < 70 ? 'text-green-400' : memoryPercent < 90 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {memoryPercent}%
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        memoryPercent < 70 ? 'bg-green-400' : memoryPercent < 90 ? 'bg-amber-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${memoryPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Heap: {formatBytes(health?.memory?.heapUsed ?? 0)}</span>
                    <span>/ {formatBytes(memoryDenominator)} cap</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>RSS: {formatBytes(health?.memory?.rss ?? 0)}</span>
                    {health?.memory?.heapTotal !== undefined && (
                      <span className="text-muted-foreground/70">· allocated {formatBytes(health.memory.heapTotal)}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Database */}
              <div className={`p-4 rounded-xl border transition-all ${
                dbConnected
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-red-500/5 border-red-500/20'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Database</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${dbConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                    <span className={`text-xs font-semibold ${dbConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                      {dbConnected ? 'Connected' : health?.database?.status || 'Unknown'}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Query Latency</span>
                    <span className={`font-medium ${
                      (health?.database?.latency ?? 0) < 200 ? 'text-green-400' : (health?.database?.latency ?? 0) < 1000 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {health?.database?.latency ?? 0}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <span className="text-foreground font-medium capitalize">{health?.database?.status || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Persona Sync Tab Component
// ============================================
type MatchDetail = {
  gpId: number | null;
  gpName: string;
  personaName: string;
  matched: boolean;
  similarity: number;
  changes: {
    sickLeaves?: { from: number; to: number };
    missedDays?: { from: number; to: number };
    extraShifts?: { from: number; to: number };
  };
  reason?: "below-threshold" | "wrong-team" | "no-candidates";
  closestGpName?: string;
  closestGpId?: number | null;
  closestGpTeam?: number | null;
  closestSimilarity?: number;
};

/** Local-state record of inline fixes the user applied without re-running sync. */
type RowFix =
  | { kind: "moved"; gpName: string; toTeamId: number }
  | { kind: "created"; gpName: string };

type TeamSyncResult = {
  kind: "team";
  month: number;
  year: number;
  teamName: string;
  totalPersonaWorkers: number;
  matched: number;
  unmatched: number;
  matchDetails: MatchDetail[];
  status: "success" | "partial" | "failed";
  /** Persona shift-type parser diagnostics — same shape as Test
   *  Connection's parserDiagnostics. Renders inline in the result
   *  panel so the FM doesn't have to bounce to Test Connection to see
   *  WHY everyone shows "No change". */
  parserDiagnostics?: {
    allTypes: string[];
    bucketCounts: { sick: number; missed: number; extra: number; late: number; unknown: number };
  };
};

type BulkSyncResult = {
  kind: "bulk";
  month: number;
  year: number;
  results: { teamId: number; teamName: string; status: "success" | "partial" | "failed"; matched: number; unmatched: number; error?: string }[];
  totals: { teams: number; matched: number; unmatched: number; failed: number };
};

type SyncState =
  | { phase: "idle" }
  | { phase: "running"; label: string }
  | { phase: "done"; result: TeamSyncResult | BulkSyncResult }
  | { phase: "error"; message: string };

type RowFilter = "all" | "matched" | "issues";

type TestStepStatus = "pending" | "success" | "failed" | "skipped";
type TestConnectionStep = {
  step: "credentials" | "browser" | "login" | "schedule" | "data";
  label: string;
  status: TestStepStatus;
  error?: string;
  durationMs?: number;
};
type TestConnectionResult = {
  success: boolean;
  steps: TestConnectionStep[];
  failureScreenshotB64: string;
  /** Parser diagnostics — distinct shift-type keys parsed from the
   *  schedule page + bucket counts. Used to debug "matched but
   *  everyone has 0 sick/missed/extra" by showing the operator what
   *  Persona actually returned. */
  parserDiagnostics?: {
    allTypes: string[];
    bucketCounts: { sick: number; missed: number; extra: number; late: number; unknown: number };
  };
};

// ============================================
// Studioworks Sync Tab — pulls evaluations from team.studioworks.ee
// and inserts them into our evaluations table.
// ============================================

type SwStepStatus = "pending" | "success" | "failed" | "skipped";
type SwTestStep = {
  step: "credentials" | "browser" | "login" | "evaluations" | "data";
  label: string;
  status: SwStepStatus;
  error?: string;
  durationMs?: number;
};

type SwTestResult = {
  success: boolean;
  steps: SwTestStep[];
  source: "json" | "html" | "none";
  sampleCount: number;
  failureScreenshotB64: string;
};

type SwImportDetail = {
  externalId: string;
  presenterName: string;
  evaluatorName?: string;
  date: string;
  game?: string;
  matched: boolean;
  gpId?: number;
  gpName?: string;
  skippedExisting?: boolean;
  error?: string;
};

type SwSyncSummary = {
  status: "success" | "partial" | "failed";
  source: "json" | "html" | "none";
  totalFound: number;
  inserted: number;
  skippedExisting: number;
  unmatched: number;
  errors: number;
  details: SwImportDetail[];
  error?: string;
};

function StudioworksSyncTab() {
  const [testResult, setTestResult] = useState<SwTestResult | null>(null);
  const [syncResult, setSyncResult] = useState<SwSyncSummary | null>(null);

  const utils = trpc.useUtils();

  const testMutation = trpc.studioworksSync.testConnection.useMutation({
    onSuccess: (data) => {
      setTestResult(data);
      if (data.success) {
        toast.success(`Connection OK — ${data.sampleCount} evaluations visible (${data.source})`);
      } else {
        const failed = data.steps.find(s => s.status === "failed");
        toast.error(`Test failed at: ${failed?.label ?? "unknown step"}`);
      }
    },
    onError: (err) => toast.error(`Test failed: ${err.message}`),
  });

  const syncMutation = trpc.studioworksSync.syncNow.useMutation({
    onSuccess: async (data) => {
      setSyncResult(data);
      if (data.status === "failed") {
        toast.error(`Sync failed: ${data.error ?? "no evaluations imported"}`);
      } else {
        toast.success(`Imported ${data.inserted} new (${data.skippedExisting} already in DB, ${data.unmatched} unmatched)`);
      }
      // Refresh anything that depends on evaluations
      await Promise.all([
        utils.dashboard.stats.invalidate(),
        utils.dashboard.monthlyTrend.invalidate(),
        utils.dashboard.activityFeed.invalidate(),
        utils.evaluation.list.invalidate(),
      ]);
    },
    onError: (err) => toast.error(`Sync failed: ${err.message}`),
  });

  return (
    <TabsContent value="studioworks" className="space-y-6">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="icon-box p-3">
            <FileCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Studioworks Evaluations Sync</h2>
            <p className="text-sm text-muted-foreground">
              Pulls evaluations from team.studioworks.ee/evaluations and writes them straight into the DB — replaces manual screenshot uploads.
            </p>
          </div>
        </div>
        <StudioworksImportButton variant="default" />
      </div>

      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
          <CardDescription>
            <strong>Test connection</strong> probes login + page load without writing anything.
            <strong> Sync now</strong> imports every visible evaluation (idempotent — re-runs skip duplicates).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setTestResult(null); testMutation.mutate(); }}
              disabled={testMutation.isPending || syncMutation.isPending}
            >
              {testMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing connection…</>
              ) : (
                <><Activity className="h-4 w-4 mr-2" /> Test connection</>
              )}
            </Button>
            <Button
              className="flex-1"
              onClick={() => { setSyncResult(null); syncMutation.mutate(); }}
              disabled={testMutation.isPending || syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Syncing…</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" /> Sync now</>
              )}
            </Button>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50/50 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <strong>Setup:</strong> set <code className="bg-amber-100 px-1 rounded text-[11px]">STUDIOWORKS_USERNAME</code> and <code className="bg-amber-100 px-1 rounded text-[11px]">STUDIOWORKS_PASSWORD</code> env vars on the deploy. Optional: <code className="bg-amber-100 px-1 rounded text-[11px]">STUDIOWORKS_NAV_TIMEOUT_MS</code> (default 60s).
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test result panel */}
      {testResult && (
        <Card className={`border ${testResult.success ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30"}`}>
          <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                {testResult.success ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-rose-600" />}
                Connection {testResult.success ? "OK" : "failed"}
              </CardTitle>
              <CardDescription>
                {testResult.success
                  ? `Found ${testResult.sampleCount} evaluations via ${testResult.source}. Sync should work.`
                  : "One of the stages broke — see which one below; the screenshot shows what the page actually rendered."}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTestResult(null)} title="Clear"><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {testResult.steps.map((s) => {
                const Icon = s.status === "success" ? Check : s.status === "failed" ? X : s.status === "skipped" ? AlertCircle : Loader2;
                const iconClass =
                  s.status === "success" ? "text-emerald-600" :
                  s.status === "failed" ? "text-rose-600" :
                  s.status === "skipped" ? "text-muted-foreground" :
                  "text-muted-foreground animate-spin";
                const bg =
                  s.status === "failed" ? "border-rose-200 bg-rose-50/40" :
                  s.status === "success" ? "border-emerald-200 bg-emerald-50/40" :
                  "border-border bg-muted/20";
                return (
                  <div key={s.step} className={`flex items-start gap-3 p-3 rounded-lg border ${bg}`}>
                    <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconClass}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{s.label}</span>
                        {s.durationMs !== undefined && <span className="text-[10px] text-muted-foreground">{s.durationMs} ms</span>}
                        {s.status === "skipped" && <Badge variant="outline" className="text-[10px] text-muted-foreground">Skipped</Badge>}
                      </div>
                      {s.error && <p className="text-xs text-rose-700 mt-1 whitespace-pre-wrap break-words">{s.error}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            {!testResult.success && testResult.failureScreenshotB64 && (
              <details className="rounded-lg border border-border bg-background p-3" open>
                <summary className="cursor-pointer text-sm font-medium select-none">Screenshot at the moment of failure</summary>
                <div className="mt-3 rounded-md overflow-hidden border border-border bg-muted">
                  <img
                    src={`data:image/png;base64,${testResult.failureScreenshotB64}`}
                    alt="Studioworks page at failure"
                    className="w-full max-h-[480px] object-contain"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Common patterns: blank page (network blocked), login form still visible (credentials wrong), 2FA / CAPTCHA (manual login required), unexpected redirect.
                </p>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sync result panel */}
      {syncResult && (
        <Card className={`border ${syncResult.status === "failed" ? "border-rose-200 bg-rose-50/30" : syncResult.status === "partial" ? "border-amber-200 bg-amber-50/30" : "border-emerald-200 bg-emerald-50/30"}`}>
          <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Sync result — {syncResult.status}
              </CardTitle>
              <CardDescription>
                {syncResult.status === "failed"
                  ? syncResult.error ?? "Sync ran but reported failure."
                  : `Source: ${syncResult.source} · Found ${syncResult.totalFound} · Inserted ${syncResult.inserted} · Skipped ${syncResult.skippedExisting} (already in DB) · Unmatched ${syncResult.unmatched} · Errors ${syncResult.errors}`}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSyncResult(null)} title="Clear"><X className="h-4 w-4" /></Button>
          </CardHeader>
          {syncResult.details.length > 0 && (
            <CardContent>
              <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
                {syncResult.details.map((d, i) => {
                  const ok = d.matched && !d.error && !d.skippedExisting;
                  const skipped = d.skippedExisting;
                  const err = !!d.error;
                  const Icon = ok ? Check : skipped ? AlertCircle : err ? X : AlertTriangle;
                  const tone = ok
                    ? "border-emerald-200 bg-emerald-50/40"
                    : skipped
                      ? "border-blue-200 bg-blue-50/40"
                      : err
                        ? "border-rose-200 bg-rose-50/40"
                        : "border-amber-200 bg-amber-50/40";
                  const iconColor = ok ? "text-emerald-600" : skipped ? "text-blue-600" : err ? "text-rose-600" : "text-amber-600";
                  return (
                    <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border ${tone}`}>
                      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm text-foreground truncate">{d.presenterName}</p>
                          {d.gpName && d.gpName !== d.presenterName && (
                            <Badge variant="outline" className="text-[10px]">→ {d.gpName}</Badge>
                          )}
                          {skipped && <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-800 border-blue-200">already imported</Badge>}
                          {err && !d.matched && <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-800 border-rose-200">unmatched</Badge>}
                          {err && d.matched && <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-800 border-rose-200">insert failed</Badge>}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {d.date}{d.game ? ` · ${d.game}` : ""}{d.evaluatorName ? ` · by ${d.evaluatorName}` : ""}
                        </p>
                        {d.error && <p className="text-[11px] text-rose-700 mt-0.5">{d.error}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* How it works */}
      <Card className="border border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-400">How Studioworks Sync Works</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Logs into team.studioworks.ee using stored credentials</li>
                <li>Discovers evaluations via JSON API intercept (preferred) or HTML scrape fallback</li>
                <li>Matches each presenter name to a GP using the same fuzzy matcher upload uses</li>
                <li>Inserts new evaluations; <strong>idempotent</strong> — re-runs skip rows we already have for the same (GP, date, evaluator, game)</li>
                <li>Click <strong>Test connection</strong> first if Sync fails — it shows you the exact stage that broke + a screenshot of the page</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
