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
import { useTheme } from "@/contexts/ThemeContext";
import { LayoutDashboard, LogOut, PanelLeft, Sun, Moon } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState, createContext, useContext, useCallback } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { toast } from "sonner";

type MenuItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
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
  sidebarItems?: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  const menuItems: MenuItem[] = sidebarItems 
    ? sidebarItems.map(item => ({ icon: item.icon, label: item.label, path: item.href }))
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
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
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
            className="w-full shadow-lg hover:shadow-xl transition-all bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white"
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
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const menuItems = useContext(MenuItemsContext);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  const { theme, toggleTheme, switchable } = useTheme();

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      // Force clear any remaining cookies on the client side
      document.cookie = "app_session_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;";
      document.cookie = "app_session_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=" + window.location.hostname;
      document.cookie = "app_session_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=." + window.location.hostname;
      // Clear local storage auth data
      localStorage.removeItem("manus-runtime-user-info");
      toast.success("Signed out successfully");
      // Force full page reload to clear all state
      window.location.href = "/";
    } catch {
      // Even on error, force redirect
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
          <SidebarHeader className="h-16 justify-center border-b border-border/30">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center hover:bg-accent rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 group"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                    <span className="text-white text-xs font-bold">GP</span>
                  </div>
                  <span className="font-semibold tracking-tight truncate text-foreground/90">
                    Reports
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-2">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path} className="relative">
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-11 transition-all duration-300 font-normal rounded-xl ${
                        isActive 
                          ? "bg-primary/12 text-primary border border-primary/20 shadow-lg shadow-primary/5" 
                          : "hover:bg-accent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] bg-gradient-to-b from-violet-400 to-violet-600 rounded-r-full" />
                      )}
                      <item.icon
                        className={`h-4 w-4 transition-transform duration-200 ${
                          isActive ? "text-primary scale-110" : "group-hover:scale-110"
                        }`}
                      />
                      <span className={isActive ? "font-medium" : ""}>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-border/30">
            {/* Theme toggle */}
            {switchable && (
              <button
                onClick={toggleTheme}
                className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent transition-all duration-200 w-full text-left mb-1 group-data-[collapsible=icon]:justify-center"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 text-amber-400 shrink-0" />
                ) : (
                  <Moon className="h-4 w-4 text-indigo-400 shrink-0" />
                )}
                {!isCollapsed && (
                  <span className="text-sm text-muted-foreground">
                    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                  </span>
                )}
              </button>
            )}

            {/* User info */}
            <div className="flex items-center gap-3 rounded-xl px-2 py-2 w-full group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-9 w-9 border border-primary/20 shrink-0 bg-gradient-to-br from-violet-500/20 to-indigo-500/20">
                <AvatarFallback className="text-xs font-semibold text-primary bg-transparent">
                  {user?.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate leading-none text-foreground/90">
                    {user?.name || "-"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-1.5">
                    {user?.email || "-"}
                  </p>
                </div>
              )}
            </div>

            {/* Sign out button — always visible, not in a dropdown */}
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-destructive/10 transition-all duration-200 w-full text-left group-data-[collapsible=icon]:justify-center text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
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
              {switchable && (
                <button
                  onClick={toggleTheme}
                  className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-400" />}
                </button>
              )}
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-destructive/10 transition-colors text-red-400"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
