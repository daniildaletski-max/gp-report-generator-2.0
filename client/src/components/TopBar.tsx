import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Bell, ChevronRight, LogOut, Search, Settings, User as UserIcon, Sparkles, AlertTriangle, Award, Target, Zap, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Global TopBar — sticky strip above page content on desktop.
 *
 * Replaces the previous "blank gap above the page header" with an
 * always-visible navigation strip that:
 *   - Renders breadcrumbs derived from the URL (Section / Tab)
 *   - Exposes a real-looking search input (clicking opens the
 *     Cmd+K palette — same target, but discoverable for users
 *     who'd never guess Cmd+K exists)
 *   - Surfaces a notifications bell with a live badge driven by
 *     dashboard.insights — clicking opens a popover with the actionable
 *     insights and one-click navigation
 *   - Has a user avatar dropdown with profile / sign out
 *
 * Mobile keeps the existing mobile nav header (in DashboardLayout) —
 * this component renders only at md+ to avoid horizontal crowding.
 */
export function TopBar({
  user,
  isMac,
  onOpenSearch,
  onLogout,
  onNavigate,
}: {
  user: { name?: string | null; email?: string | null; role?: string | null } | null;
  isMac: boolean;
  onOpenSearch: () => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
}) {
  // wouter v3's useLocation returns only the pathname — query params
  // come from the separate useSearch hook. Without it, our admin
  // sub-tab breadcrumb (?tab=persona etc.) would never render because
  // the splitter on "?" never finds anything in the path.
  const [pathname] = useLocation();
  const search = useSearch();
  const breadcrumb = useMemo(() => buildBreadcrumb(pathname, search), [pathname, search]);

  const { data: insights } = trpc.dashboard.insights.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const insightsList = (insights ?? []) as Insight[];
  const actionableCount = insightsList.filter(
    i => i.severity === "alert" || i.severity === "warning",
  ).length;

  return (
    <div className="hidden md:flex sticky top-0 z-30 h-14 items-center gap-3 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-4">
      <Breadcrumb crumbs={breadcrumb} />

      <div className="flex-1" />

      {/* Search input — looks like a real input, opens Cmd+K palette */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="hidden lg:flex items-center gap-2 h-9 w-72 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted/70 hover:border-primary/30 transition-colors text-left text-sm text-muted-foreground hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate text-xs">Search GPs, teams, reports…</span>
        <kbd className="inline-flex items-center gap-0.5 rounded border border-border bg-background text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 shrink-0">
          {isMac ? "⌘" : "Ctrl"}<span>K</span>
        </kbd>
      </button>

      {/* Compact search button below the lg breakpoint */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="lg:hidden h-9 w-9 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Open search"
      >
        <Search className="h-4 w-4" />
      </button>

      {/* Notifications */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative h-9 w-9 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {actionableCount > 0 && (
              <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold leading-none">
                {actionableCount > 9 ? "9+" : actionableCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-card via-card to-primary/5">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> What needs attention
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {insightsList.length === 0
                ? "Nothing flagged — everything's quiet."
                : `${actionableCount} need action · ${insightsList.length - actionableCount} other`}
            </p>
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
            {insightsList.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 mb-2">
                  <Zap className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-sm text-foreground">All caught up</p>
              </div>
            ) : (
              insightsList.slice(0, 8).map(i => (
                <NotificationRow key={i.id} insight={i} onNavigate={onNavigate} />
              ))
            )}
          </div>
          {insightsList.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate("/dashboard")}
              className="w-full px-4 py-2.5 border-t border-border text-xs font-medium text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1"
            >
              View all on Dashboard
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </PopoverContent>
      </Popover>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-xl hover:bg-muted transition-colors"
          >
            <Avatar className="h-7 w-7 border border-primary/20 bg-gradient-to-br from-primary/15 to-primary/5">
              <AvatarFallback className="text-[11px] font-semibold text-primary bg-transparent">
                {user?.name?.charAt(0).toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <span className="hidden xl:inline text-sm font-medium text-foreground max-w-[120px] truncate">
              {user?.name ?? "Account"}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-foreground truncate">{user?.name ?? "Account"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
              {user?.role && (
                <Badge variant="outline" className="self-start mt-1 text-[10px] capitalize">
                  {user.role}
                </Badge>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onNavigate("/dashboard")}>
            <UserIcon className="h-4 w-4" />
            <span>My dashboard</span>
          </DropdownMenuItem>
          {user?.role === "admin" && (
            <DropdownMenuItem onClick={() => onNavigate("/admin")}>
              <Settings className="h-4 w-4" />
              <span>Admin panel</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout} className="text-rose-600 focus:text-rose-600">
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ============================================
// Breadcrumb derivation
// ============================================

type Crumb = { label: string; href?: string };

const PATH_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  reports: "Reports",
  evaluations: "Evaluations",
  upload: "Upload",
  attendance: "Attendance",
  admin: "Admin",
  invite: "Invite",
  "gp-portal": "GP Portal",
};

const ADMIN_TAB_LABELS: Record<string, string> = {
  overview: "Overview",
  invitations: "Invitations",
  users: "Users",
  teams: "Teams",
  stats: "GP Stats",
  "action-items": "Coaching plans",
  access: "GP Access",
  errors: "Errors",
  persona: "Persona sync",
  studioworks: "Studioworks sync",
};

function buildBreadcrumb(pathname: string, search: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Home", href: "/dashboard" }];

  let acc = "";
  for (const seg of segments) {
    acc += `/${seg}`;
    const label = PATH_LABELS[seg] ?? capitalize(seg);
    crumbs.push({ label, href: acc });
  }

  // Surface ?tab=foo for the admin page so the breadcrumb shows the
  // active sub-tab. `search` comes from wouter's useSearch hook (the
  // raw query string without the leading "?"), since useLocation in
  // wouter v3 returns only pathname.
  if (segments[0] === "admin" && search) {
    const params = new URLSearchParams(search);
    const tab = params.get("tab");
    if (tab && ADMIN_TAB_LABELS[tab]) {
      crumbs.push({ label: ADMIN_TAB_LABELS[tab] });
    }
  }
  return crumbs;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center min-w-0">
      <ol className="flex items-center gap-1 min-w-0">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
              {c.href && !isLast ? (
                <a
                  href={c.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate"
                  onClick={(e) => {
                    // Wouter routing — prevent full reload
                    e.preventDefault();
                    if (c.href) window.history.pushState({}, "", c.href);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                  }}
                >
                  {c.label}
                </a>
              ) : (
                <span className={`text-sm truncate ${isLast ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ============================================
// Notification row — same insight shape as Operations Brain
// ============================================

type Insight = {
  id: string;
  kind: "stale_sync" | "missing_report" | "score_regression" | "score_improvement" | "coverage_gap";
  severity: "alert" | "warning" | "recommendation" | "celebration" | "info";
  title: string;
  description: string;
  action?: { label: string; href: string };
};

function NotificationRow({ insight, onNavigate }: { insight: Insight; onNavigate: (path: string) => void }) {
  const Icon =
    insight.severity === "alert" ? AlertTriangle :
    insight.severity === "warning" ? Zap :
    insight.severity === "recommendation" ? Target :
    insight.severity === "celebration" ? Award :
    Sparkles;
  const iconColor =
    insight.severity === "alert" ? "text-rose-600 bg-rose-100" :
    insight.severity === "warning" ? "text-amber-600 bg-amber-100" :
    insight.severity === "recommendation" ? "text-blue-600 bg-blue-100" :
    insight.severity === "celebration" ? "text-emerald-600 bg-emerald-100" :
    "text-muted-foreground bg-muted";
  return (
    <button
      type="button"
      onClick={() => insight.action && onNavigate(insight.action.href)}
      disabled={!insight.action}
      className="w-full text-left px-4 py-2.5 hover:bg-muted/40 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
    >
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 rounded-lg p-1.5 ${iconColor}`}>
          <Icon className="h-3 w-3" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">{insight.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{insight.description}</p>
        </div>
        {insight.action && (
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
        )}
      </div>
    </button>
  );
}
