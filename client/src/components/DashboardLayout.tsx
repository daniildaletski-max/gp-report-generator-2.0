import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { LayoutDashboard, LogOut, PanelLeft, Search } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState, createContext, useContext, useCallback, Fragment } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { toast } from "sonner";
import { CommandPalette, useCommandPalette } from "./CommandPalette";
import { TopBar } from "./TopBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";

type MenuItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  /** Optional group label. Consecutive items sharing a section render under
   *  one header; a new value starts a new group. */
  section?: string;
};

const defaultMenuItems: MenuItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
];

const MenuItemsContext = createContext<MenuItem[]>(defaultMenuItems);

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
  sidebarItems,
}: {
  children: React.ReactNode;
  sidebarItems?: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; section?: string }[];
}) {
  const menuItems: MenuItem[] = sidebarItems
    ? sidebarItems.map(item => ({ icon: item.icon, label: item.label, path: item.href, section: item.section }))
    : defaultMenuItems;
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-white text-xl font-bold">GP</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-center text-foreground">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-white font-semibold"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <MenuItemsContext.Provider value={menuItems}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
          } as CSSProperties
        }
      >
        <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
          {children}
        </DashboardLayoutContent>
      </SidebarProvider>
    </MenuItemsContext.Provider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const live = useLiveEvents(); // one SSE connection for the whole dashboard session
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const menuItems = useContext(MenuItemsContext);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  const palette = useCommandPalette();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useKeyboardShortcuts({
    onOpenSearch: () => palette.setOpen(true),
    onShowHelp: () => setShortcutsOpen(true),
  });
  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      document.cookie = "app_session_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;";
      document.cookie = "app_session_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=" + window.location.hostname;
      document.cookie = "app_session_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=." + window.location.hostname;
      localStorage.removeItem("manus-runtime-user-info");
      toast.success("Signed out successfully");
      window.location.href = "/";
    } catch {
      document.cookie = "app_session_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;";
      localStorage.removeItem("manus-runtime-user-info");
      window.location.href = "/";
    }
  }, [logout, isLoggingOut]);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center border-b border-primary/10">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center hover:bg-primary/8 rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 group"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/15">
                    <span className="text-white text-xs font-bold">GP</span>
                  </div>
                  <span className="font-semibold tracking-tight truncate text-foreground">
                    Reports
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            {/* Quick search trigger — opens Cmd+K palette */}
            <div className="px-2 pt-2">
              <button
                type="button"
                onClick={() => palette.setOpen(true)}
                className={`w-full flex items-center gap-2 rounded-xl border border-border bg-muted/40 hover:bg-muted/70 transition-colors text-left text-sm text-muted-foreground hover:text-foreground ${
                  isCollapsed ? "h-10 justify-center px-0" : "h-10 px-3"
                }`}
                aria-label="Open command palette"
                title="Open command palette"
              >
                <Search className="h-4 w-4 shrink-0" />
                {!isCollapsed && (
                  <>
                    <span className="flex-1 truncate">Search…</span>
                    <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-border bg-background text-[10px] font-medium text-muted-foreground px-1.5 py-0.5">
                      {isMac ? "⌘" : "Ctrl"}<span>K</span>
                    </kbd>
                  </>
                )}
              </button>
            </div>

            <SidebarMenu className="px-2 py-2">
              {menuItems.map((item, idx) => {
                const isActive = location.startsWith(item.path);
                const prevSection = idx > 0 ? menuItems[idx - 1].section : undefined;
                const isNewSection = !!item.section && item.section !== prevSection;
                return (
                  <Fragment key={item.path}>
                    {/* Group header when expanded, a hairline divider when
                        collapsed — so the nav reads as labelled clusters
                        instead of one long flat list. */}
                    {isNewSection && !isCollapsed && (
                      <li className={`px-2 ${idx === 0 ? "pt-1" : "pt-4"} pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold`}>
                        {item.section}
                      </li>
                    )}
                    {isNewSection && isCollapsed && idx > 0 && (
                      <li aria-hidden className="mx-2 my-1.5 border-t border-border/60" />
                    )}
                    <SidebarMenuItem className="relative group/nav">
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className={`h-11 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] font-normal rounded-xl nav-ink-spread ${
                          isActive
                            ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary border border-primary/25 shadow-md shadow-primary/10"
                            : "hover:bg-primary/5 text-muted-foreground hover:text-foreground hover:translate-x-0.5"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[65%] bg-gradient-to-b from-primary to-primary/60 rounded-r-full animate-in fade-in-0 slide-in-from-left-1 duration-300" />
                        )}
                        <item.icon
                          className={`h-4 w-4 transition-all duration-200 ${
                            isActive ? "text-primary scale-110" : "group-hover/nav:scale-110 group-hover/nav:text-primary"
                          }`}
                        />
                        <span className={isActive ? "font-semibold" : ""}>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </Fragment>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-primary/10">
            {/* User info */}
            <div className="flex items-center gap-3 rounded-xl px-2 py-2 w-full group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-9 w-9 border border-primary/20 shrink-0 bg-gradient-to-br from-primary/15 to-primary/15">
                <AvatarFallback className="text-xs font-semibold text-primary bg-transparent">
                  {user?.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate leading-none text-foreground">
                    {user?.name || "-"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-1.5">
                    {user?.email || "-"}
                  </p>
                </div>
              )}
            </div>

            {/* Sign out button — always visible */}
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-red-500/10 transition-all duration-200 w-full text-left group-data-[collapsible=icon]:justify-center text-red-500/70 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Sign out"
            >
              <LogOut className={`h-4 w-4 shrink-0 ${isLoggingOut ? 'animate-spin' : ''}`} />
              {!isCollapsed && (
                <span className="text-sm font-medium">
                  {isLoggingOut ? 'Signing out...' : 'Sign out'}
                </span>
              )}
            </button>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b border-primary/10 h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => palette.setOpen(true)}
                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                aria-label="Open search"
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-red-500/15 transition-colors text-red-400"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {!isMobile && (
          <TopBar
            user={user as { name?: string | null; email?: string | null; role?: string | null } | null}
            isMac={isMac}
            onOpenSearch={(q?: string) => q ? palette.openWithQuery(q) : palette.setOpen(true)}
            onLogout={handleLogout}
            onNavigate={setLocation}
          />
        )}
        <main className="flex-1 p-4">{children}</main>

        {/* Realtime connection indicator (desktop). The behaviour — live
            cache invalidation — runs regardless; this just shows the state. */}
        <div
          className="hidden md:flex fixed bottom-3 right-3 z-40 items-center gap-1.5 rounded-full border bg-card/90 backdrop-blur px-2.5 py-1 text-[11px] shadow-sm select-none"
          title={live.connected ? "Live updates connected" : "Live updates reconnecting…"}
        >
          <span className={`h-2 w-2 rounded-full ${live.connected ? "bg-emerald-500 breathing-glow" : "bg-muted-foreground/40"}`} />
          <span className="text-muted-foreground">{live.connected ? "Live" : "Offline"}</span>
        </div>
      </SidebarInset>

      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} initialQuery={palette.query} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
