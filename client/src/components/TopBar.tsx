import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Bell, ChevronRight, LogOut, Search, Settings, User as UserIcon, Sparkles, AlertTriangle, Award, Target, Zap, ArrowRight, CheckCheck } from "lucide-react";
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

const NOTIF_SEEN_KEY = "gp-notif-last-seen";

/**
 * Global TopBar — sticky strip above page content on desktop.
 *
 * Features:
 *   - Breadcrumbs derived from the URL (Section / Tab)
 *   - Real search input: typing any character immediately opens the
 *     Cmd+K palette with the typed text pre-filled as the query
 *   - Notifications bell with a persistent unread badge (localStorage
 *     tracks last-seen timestamp; only truly new items since last open
 *     count as unread)
 *   - User avatar dropdown with profile / sign out
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
  onOpenSearch: (query?: string) => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
}) {
  const [pathname] = useLocation();
  const search = useSearch();
  const breadcrumb = useMemo(() => buildBreadcrumb(pathname, search), [pathname, search]);

  // ── Search input state ──────────────────────────────────────────────
  // The input is a real <input> that captures keystrokes. On any input
  // event we immediately open the palette and pass the typed value so
  // the user sees results as they type without a separate "click to open" step.
  const [searchValue, setSearchValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);
    onOpenSearch(val);
    // Clear the local input so the palette owns the query state
    setSearchValue("");
  }, [onOpenSearch]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      onOpenSearch(searchValue);
      setSearchValue("");
    }
    if (e.key === "Escape") {
      setSearchValue("");
      searchInputRef.current?.blur();
    }
  }, [onOpenSearch, searchValue]);

  // ── Notifications ───────────────────────────────────────────────────
  const { data: insights } = trpc.dashboard.insights.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Track last time the bell was opened (persisted in localStorage)
  const [lastSeenTs, setLastSeenTs] = useState<number>(() => {
    const stored = localStorage.getItem(NOTIF_SEEN_KEY);
    return stored ? parseInt(stored, 10) : 0;
  });

  const [bellOpen, setBellOpen] = useState(false);

  const insightsList = (insights ?? []) as Insight[];

  // Count insights that are newer than the last-seen timestamp.
  // Since insights don't have a timestamp, we use the total count as a
  // proxy — if the count changed since last seen, show the badge.
  const [lastSeenCount, setLastSeenCount] = useState<number>(() => {
    const stored = localStorage.getItem(NOTIF_SEEN_KEY + "-count");
    return stored ? parseInt(stored, 10) : 0;
  });

  const unreadCount = Math.max(0, insightsList.length - lastSeenCount);
  const actionableCount = insightsList.filter(
    i => i.severity === "alert" || i.severity === "warning",
  ).length;

  // When the bell popover opens, mark all as read
  const handleBellOpen = useCallback((open: boolean) => {
    setBellOpen(open);
    if (open) {
      const now = Date.now();
      setLastSeenTs(now);
      setLastSeenCount(insightsList.length);
      localStorage.setItem(NOTIF_SEEN_KEY, now.toString());
      localStorage.setItem(NOTIF_SEEN_KEY + "-count", insightsList.length.toString());
    }
  }, [insightsList.length]);

  return (
    <div className="hidden md:flex sticky top-0 z-30 h-14 items-center gap-3 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-4">
      <Breadcrumb crumbs={breadcrumb} />

      <div className="flex-1" />

      {/* Real search input — typing immediately opens the palette with the query pre-filled */}
      <div className="hidden lg:flex items-center gap-2 h-9 w-72 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted/70 hover:border-primary/30 focus-within:border-primary/40 focus-within:bg-muted/60 transition-colors text-left text-sm text-muted-foreground">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchValue}
          onChange={handleSearchInput}
          onKeyDown={handleSearchKeyDown}
          onFocus={() => onOpenSearch(searchValue || undefined)}
          placeholder="Search GPs, teams, reports…"
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none border-none min-w-0"
          aria-label="Search"
        />
        <kbd
          className="inline-flex items-center gap-0.5 rounded border border-border bg-background text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 shrink-0 cursor-pointer"
          onClick={() => onOpenSearch()}
        >
          {isMac ? "⌘" : "Ctrl"}<span>K</span>
        </kbd>
      </div>

      {/* Compact search button below the lg breakpoint */}
      <button
        type="button"
        onClick={() => onOpenSearch()}
        className="lg:hidden h-9 w-9 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Open search"
      >
        <Search className="h-4 w-4" />
      </button>

      {/* Notifications bell */}
      <Popover open={bellOpen} onOpenChange={handleBellOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative h-9 w-9 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} new)` : ""}`}
          >
            <Bell className={`h-4 w-4 transition-all ${unreadCount > 0 ? "text-primary animate-pulse" : ""}`} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold leading-none shadow-sm">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0 overflow-hidden shadow-xl border-primary/10">
          <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-card via-card to-primary/5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> What needs attention
              </p>
              {insightsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleBellOpen(false)}
                  className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark read
                </button>
              )}
            </div>
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
                <p className="text-sm font-medium text-foreground">All caught up</p>
                <p className="text-xs text-muted-foreground mt-1">No alerts or warnings right now.</p>
              </div>
            ) : (
              insightsList.slice(0, 8).map((i, idx) => (
                <NotificationRow
                  key={i.id}
                  insight={i}
                  onNavigate={(path) => { handleBellOpen(false); onNavigate(path); }}
                  isNew={idx < unreadCount}
                />
              ))
            )}
          </div>
          {insightsList.length > 0 && (
            <button
              type="button"
              onClick={() => { handleBellOpen(false); onNavigate("/dashboard"); }}
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
  // active sub-tab.
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

function NotificationRow({
  insight,
  onNavigate,
  isNew,
}: {
  insight: Insight;
  onNavigate: (path: string) => void;
  isNew?: boolean;
}) {
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
      className={`w-full text-left px-4 py-2.5 hover:bg-muted/40 transition-colors disabled:hover:bg-transparent disabled:cursor-default ${isNew ? "bg-primary/3" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        {isNew && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
        )}
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
