import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { PageTransition } from "./components/PageTransition";
import { MobileBottomNav } from "./components/MobileBottomNav";
import Home from "./pages/Home";
import { useAuth } from "./_core/hooks/useAuth";
import { Upload as UploadIcon, LayoutDashboard, FileCheck, FileSpreadsheet, Settings, Shield, ShieldAlert, CalendarCheck, Zap, SlidersHorizontal, Sun, Sparkles, ScanLine, BadgeEuro } from "lucide-react";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy-loaded page components for code-splitting
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Upload = lazy(() => import("./pages/Upload"));
const Evaluations = lazy(() => import("./pages/Evaluations"));
const Reports = lazy(() => import("./pages/Reports"));
const Admin = lazy(() => import("./pages/Admin"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Workspace = lazy(() => import("./pages/Workspace"));
const GPPortal = lazy(() => import("./pages/GPPortal"));
const InvitePage = lazy(() => import("./pages/InvitePage"));
const Review = lazy(() => import("./pages/Review"));
const Rubric = lazy(() => import("./pages/Rubric"));
const Today = lazy(() => import("./pages/Today"));
const Assistant = lazy(() => import("./pages/Assistant"));
const UploadBulk = lazy(() => import("./pages/UploadBulk"));
const Bonus = lazy(() => import("./pages/Bonus"));

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="relative">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
        <div className="absolute inset-0 rounded-xl bg-primary/5 animate-ping" />
      </div>
      <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
    </div>
  );
}

// Base sidebar items for all users
const baseSidebarItems = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspace", label: "Workspace", icon: Zap },
  { href: "/upload", label: "Upload", icon: UploadIcon },
  { href: "/evaluations", label: "Evaluations", icon: FileCheck },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/bonus", label: "Bonus", icon: BadgeEuro },
  // Placed after the first five so the mobile bottom nav (slice 0..5)
  // is unchanged; these live in the desktop sidebar.
  { href: "/upload-bulk", label: "Bulk AI", icon: ScanLine },
  { href: "/review", label: "Review", icon: ShieldAlert },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];

// Admin-only item
const adminSidebarItem = { href: "/admin", label: "Admin", icon: Shield };

// FM-only item (Team Management)
const fmSidebarItem = { href: "/admin", label: "Team", icon: Settings };

// Admin-only rubric manager
const rubricSidebarItem = { href: "/rubric", label: "Rubric", icon: SlidersHorizontal };

function DashboardRoutes() {
  const { user } = useAuth();

  // Build sidebar items based on role
  const sidebarItems = [
    ...baseSidebarItems,
    user?.role === "admin" ? adminSidebarItem : fmSidebarItem,
    ...(user?.role === "admin" ? [rubricSidebarItem] : []),
  ];

  // Mobile-only bottom navigation. Mirrors the sidebar but renders only on
  // small screens. We pad the main content's bottom edge inside the nav
  // itself by giving the page-transition wrapper room for the bar.
  const bottomNavItems = sidebarItems.slice(0, 5);

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <PageTransition>
        <div className="pb-20 md:pb-0">
          <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/today">
              <RouteErrorBoundary fallbackTitle="Today failed to load">
                <Today />
              </RouteErrorBoundary>
            </Route>
            <Route path="/dashboard">
              <RouteErrorBoundary fallbackTitle="Dashboard failed to load">
                <Dashboard />
              </RouteErrorBoundary>
            </Route>
            <Route path="/upload">
              <RouteErrorBoundary fallbackTitle="Upload page failed to load">
                <Upload />
              </RouteErrorBoundary>
            </Route>
            <Route path="/upload-bulk">
              <RouteErrorBoundary fallbackTitle="Bulk AI upload failed to load">
                <UploadBulk />
              </RouteErrorBoundary>
            </Route>
            <Route path="/evaluations">
              <RouteErrorBoundary fallbackTitle="Evaluations failed to load">
                <Evaluations />
              </RouteErrorBoundary>
            </Route>
            <Route path="/review">
              <RouteErrorBoundary fallbackTitle="Review queue failed to load">
                <Review />
              </RouteErrorBoundary>
            </Route>
            <Route path="/assistant">
              <RouteErrorBoundary fallbackTitle="Assistant failed to load">
                <Assistant />
              </RouteErrorBoundary>
            </Route>
            <Route path="/rubric">
              <RouteErrorBoundary fallbackTitle="Rubric manager failed to load">
                <Rubric />
              </RouteErrorBoundary>
            </Route>
            <Route path="/reports">
              <RouteErrorBoundary fallbackTitle="Reports failed to load">
                <Reports />
              </RouteErrorBoundary>
            </Route>
            <Route path="/admin">
              <RouteErrorBoundary fallbackTitle="Admin panel failed to load">
                <Admin />
              </RouteErrorBoundary>
            </Route>
            <Route path="/attendance">
              <RouteErrorBoundary fallbackTitle="Attendance failed to load">
                <Attendance />
              </RouteErrorBoundary>
            </Route>
            <Route path="/bonus">
              <RouteErrorBoundary fallbackTitle="Bonus failed to load">
                <Bonus />
              </RouteErrorBoundary>
            </Route>
            <Route path="/workspace">
              <RouteErrorBoundary fallbackTitle="Workspace failed to load">
                <Workspace />
              </RouteErrorBoundary>
            </Route>
            <Route component={NotFound} />
          </Switch>
          </Suspense>
        </div>
      </PageTransition>
      <MobileBottomNav items={bottomNavItems} />
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/gp/:token">
        {() => (
          <RouteErrorBoundary fallbackTitle="GP Portal failed to load" showGoBack>
            <Suspense fallback={<PageLoader />}>
              <GPPortal />
            </Suspense>
          </RouteErrorBoundary>
        )}
      </Route>
      <Route path="/gp-portal/:token">
        {() => (
          <RouteErrorBoundary fallbackTitle="GP Portal failed to load" showGoBack>
            <Suspense fallback={<PageLoader />}>
              <GPPortal />
            </Suspense>
          </RouteErrorBoundary>
        )}
      </Route>
      <Route path="/invite/:token">
        {() => (
          <RouteErrorBoundary fallbackTitle="Invitation page failed to load" showGoBack>
            <Suspense fallback={<PageLoader />}>
              <InvitePage />
            </Suspense>
          </RouteErrorBoundary>
        )}
      </Route>
      {/* All dashboard pages use DashboardRoutes for consistent sidebar */}
      <Route path="/today" component={DashboardRoutes} />
      <Route path="/dashboard" component={DashboardRoutes} />
      <Route path="/upload" component={DashboardRoutes} />
      <Route path="/upload-bulk" component={DashboardRoutes} />
      <Route path="/evaluations" component={DashboardRoutes} />
      <Route path="/review" component={DashboardRoutes} />
      <Route path="/assistant" component={DashboardRoutes} />
      <Route path="/rubric" component={DashboardRoutes} />
      <Route path="/reports" component={DashboardRoutes} />
      <Route path="/admin" component={DashboardRoutes} />
      <Route path="/attendance" component={DashboardRoutes} />
      <Route path="/bonus" component={DashboardRoutes} />
      <Route path="/workspace" component={DashboardRoutes} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
