import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { PageTransition } from "./components/PageTransition";
import Home from "./pages/Home";
import { useAuth } from "./_core/hooks/useAuth";
import { Upload as UploadIcon, LayoutDashboard, FileCheck, FileSpreadsheet, Settings, Shield, CalendarCheck } from "lucide-react";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy-loaded page components for code-splitting
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Upload = lazy(() => import("./pages/Upload"));
const Evaluations = lazy(() => import("./pages/Evaluations"));
const Reports = lazy(() => import("./pages/Reports"));
const Admin = lazy(() => import("./pages/Admin"));
const Attendance = lazy(() => import("./pages/Attendance"));
const GPPortal = lazy(() => import("./pages/GPPortal"));
const InvitePage = lazy(() => import("./pages/InvitePage"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// Base sidebar items for all users
const baseSidebarItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: UploadIcon },
  { href: "/evaluations", label: "Evaluations", icon: FileCheck },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
];

// Admin-only item
const adminSidebarItem = { href: "/admin", label: "Admin", icon: Shield };

// FM-only item (Team Management)
const fmSidebarItem = { href: "/admin", label: "Team", icon: Settings };

function DashboardRoutes() {
  const { user } = useAuth();
  
  // Build sidebar items based on role
  const sidebarItems = [
    ...baseSidebarItems,
    user?.role === "admin" ? adminSidebarItem : fmSidebarItem,
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <PageTransition>
        <Suspense fallback={<PageLoader />}>
          <Switch>
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
            <Route path="/evaluations">
              <RouteErrorBoundary fallbackTitle="Evaluations failed to load">
                <Evaluations />
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
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </PageTransition>
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
      <Route path="/dashboard" component={DashboardRoutes} />
      <Route path="/upload" component={DashboardRoutes} />
      <Route path="/evaluations" component={DashboardRoutes} />
      <Route path="/reports" component={DashboardRoutes} />
      <Route path="/admin" component={DashboardRoutes} />
      <Route path="/attendance" component={DashboardRoutes} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable={false}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
