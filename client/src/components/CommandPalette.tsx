import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard, FileSpreadsheet, FileCheck, Upload, CalendarCheck,
  Shield, Users, Target, BarChart3, AlertTriangle, RefreshCw,
  User, Sparkles, Radar, Sun, Zap, ScanLine, BadgeEuro, Trophy,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { GPDetailDrawer } from "@/components/GPDetailDrawer";
import { useAuth } from "@/_core/hooks/useAuth";

const NAV_ITEMS = [
  { label: "Command Center", path: "/command", icon: Radar, hint: "Cockpit" },
  { label: "Today", path: "/today", icon: Sun, hint: "Your day" },
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, hint: "Overview" },
  { label: "Workspace", path: "/workspace", icon: Zap, hint: "Evaluate" },
  { label: "Upload screenshots", path: "/upload", icon: Upload, hint: "AI extract" },
  { label: "Bulk AI upload", path: "/upload-bulk", icon: ScanLine, hint: "Batch extract" },
  { label: "Evaluations", path: "/evaluations", icon: FileCheck, hint: "List + bulk" },
  { label: "Reports", path: "/reports", icon: FileSpreadsheet, hint: "Monthly Excel" },
  { label: "Attendance", path: "/attendance", icon: CalendarCheck, hint: "Sick / late / extra" },
  { label: "Bonus", path: "/bonus", icon: BadgeEuro, hint: "Eligibility & payout" },
  { label: "Leaderboard", path: "/leaderboard", icon: Trophy, hint: "Rankings" },
  { label: "Assistant", path: "/assistant", icon: Sparkles, hint: "Ask your data" },
];

const ADMIN_QUICK_TABS = [
  { label: "Coaching plans", path: "/admin?tab=action-items", icon: Target },
  { label: "GP stats", path: "/admin?tab=stats", icon: BarChart3 },
  { label: "Errors", path: "/admin?tab=errors", icon: AlertTriangle },
  { label: "Studioworks sync", path: "/admin?tab=studioworks", icon: RefreshCw },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the search input with this query when the palette opens */
  initialQuery?: string;
}

/**
 * Global Cmd+K palette. Shows:
 *   - quick navigation (pages + admin tabs)
 *   - GPs (clicking opens the GP Detail Drawer in-place)
 *   - recent reports
 *   - open action items (jump to that GP's coaching plan)
 *
 * Loads its index lazily — only when first opened — to keep the
 * initial page paint cheap.
 *
 * Accepts an optional `initialQuery` prop so the TopBar search input
 * can pre-fill the palette with whatever the user started typing.
 */
export function CommandPalette({ open, onOpenChange, initialQuery }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [drawerGpId, setDrawerGpId] = useState<number | null>(null);
  const [hasOpened, setHasOpened] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const prevOpen = useRef(false);

  // Track whether the palette has been opened so we can lazy-fetch the index.
  // Also pre-fill the query from the TopBar search input when provided.
  useEffect(() => {
    if (open) {
      setHasOpened(true);
      // Pre-fill with the query passed from the TopBar search input
      if (initialQuery !== undefined && initialQuery !== "") {
        setInputValue(initialQuery);
      }
    }
    // Reset input when closing so next open starts fresh
    if (!open && prevOpen.current) {
      setInputValue("");
    }
    prevOpen.current = open;
  }, [open, initialQuery]);

  const { data: index } = trpc.search.paletteIndex.useQuery(undefined, {
    enabled: hasOpened,
    // Stale-time: 30s so flipping it open repeatedly doesn't hammer the server.
    staleTime: 30_000,
  });

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const go = useCallback(
    (path: string) => {
      close();
      setLocation(path);
    },
    [close, setLocation],
  );

  const openGp = useCallback(
    (gpId: number) => {
      close();
      // Slight delay so the dialog close animation completes before the
      // drawer slides in — feels less jumpy.
      setTimeout(() => setDrawerGpId(gpId), 80);
    },
    [close],
  );

  const isAdmin = user?.role === "admin";

  const sortedGps = useMemo(() => {
    if (!index) return [];
    return [...index.gps].sort((a, b) => a.name.localeCompare(b.name));
  }, [index]);

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Quick navigation"
        description="Search GPs, reports, plans, or jump to any page."
      >
        <CommandInput
          placeholder="Search GPs, reports, plans…"
          value={inputValue}
          onValueChange={setInputValue}
        />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>

          <CommandGroup heading="Navigate">
            {NAV_ITEMS.map(item => (
              <CommandItem key={item.path} onSelect={() => go(item.path)} value={`nav ${item.label} ${item.hint}`}>
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
                <span className="text-muted-foreground text-xs ml-auto">{item.hint}</span>
              </CommandItem>
            ))}
            <CommandItem onSelect={() => go("/admin")} value="admin settings management">
              <Shield className="h-4 w-4" />
              <span>{isAdmin ? "Admin panel" : "Settings"}</span>
              <CommandShortcut>{isAdmin ? "Admin" : "FM"}</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          {isAdmin && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Admin shortcuts">
                {ADMIN_QUICK_TABS.map(tab => (
                  <CommandItem key={tab.path} onSelect={() => go(tab.path)} value={`admin ${tab.label}`}>
                    <tab.icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {sortedGps.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Game presenters (${sortedGps.length})`}>
                {sortedGps.map(gp => (
                  <CommandItem
                    key={`gp-${gp.id}`}
                    onSelect={() => openGp(gp.id)}
                    value={`gp ${gp.name}`}
                  >
                    <User className="h-4 w-4" />
                    <span>{gp.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}


          {index && index.actionItems.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Open coaching items (${index.actionItems.length})`}>
                {index.actionItems.slice(0, 8).map(item => (
                  <CommandItem
                    key={`ai-${item.id}`}
                    onSelect={() => openGp(item.gpId)}
                    value={`item ${item.title} ${item.gpName}`}
                  >
                    <Target className="h-4 w-4" />
                    <span className="truncate">{item.title}</span>
                    <span className="text-muted-foreground text-xs ml-auto">{item.gpName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {index && index.reports.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Recent reports">
                {index.reports.slice(0, 8).map(r => (
                  <CommandItem
                    key={`r-${r.id}`}
                    onSelect={() => go("/reports")}
                    value={`report ${r.teamName} ${r.month} ${r.year}`}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span className="truncate">{r.teamName}</span>
                    <span className="text-muted-foreground text-xs ml-auto">
                      {new Date(r.year, r.month - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <div className="px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>Tips:</span>
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-foreground text-[10px]">↑↓</kbd>
            <span>navigate</span>
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-foreground text-[10px]">↵</kbd>
            <span>open</span>
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-foreground text-[10px]">Esc</kbd>
            <span>close</span>
            <Sparkles className="h-3 w-3 text-primary ml-2" />
            <span>Type any GP, report or plan title</span>
          </div>
        </CommandList>
      </CommandDialog>

      <GPDetailDrawer
        gpId={drawerGpId}
        open={drawerGpId !== null}
        onOpenChange={(o) => { if (!o) setDrawerGpId(null); }}
      />
    </>
  );
}

/**
 * Hook that owns the open state + the global Cmd+K / Ctrl+K shortcut.
 * Mount the returned `<CommandPalette />` once in the layout.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const openWithQuery = useCallback((q: string) => {
    setQuery(q);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setQuery("");
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen, query, openWithQuery };
}
