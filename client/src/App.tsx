import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Evaluations from "./pages/Evaluations";
import Reports from "./pages/Reports";
import Admin from "./pages/Admin";
import GPPortal from "./pages/GPPortal";
import InvitePage from "./pages/InvitePage";
import { useAuth } from "./_core/hooks/useAuth";
import { Upload as UploadIcon, LayoutDashboard, FileCheck, FileSpreadsheet, Settings, Shield } from "lucide-react";

// Base sidebar items for all users
const baseSidebarItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: UploadIcon },
  { href: "/evaluations", label: "Evaluations", icon: FileCheck },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet },
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
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/upload" component={Upload} />
        <Route path="/evaluations" component={Evaluations} />
        <Route path="/reports" component={Reports} />
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/gp/:token" component={GPPortal} />
      <Route path="/gp-portal/:token" component={GPPortal} />
      <Route path="/invite/:token" component={InvitePage} />
      {/* All dashboard pages use DashboardRoutes for consistent sidebar */}
      <Route path="/dashboard" component={DashboardRoutes} />
      <Route path="/upload" component={DashboardRoutes} />
      <Route path="/evaluations" component={DashboardRoutes} />
      <Route path="/reports" component={DashboardRoutes} />
      <Route path="/admin" component={DashboardRoutes} />
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
