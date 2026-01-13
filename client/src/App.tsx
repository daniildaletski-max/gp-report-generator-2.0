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
import { Upload as UploadIcon, LayoutDashboard, FileCheck, FileSpreadsheet } from "lucide-react";

const sidebarItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: UploadIcon },
  { href: "/evaluations", label: "Evaluations", icon: FileCheck },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet },
];

function DashboardRoutes() {
  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/upload" component={Upload} />
        <Route path="/evaluations" component={Evaluations} />
        <Route path="/reports" component={Reports} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={DashboardRoutes} />
      <Route path="/upload" component={DashboardRoutes} />
      <Route path="/evaluations" component={DashboardRoutes} />
      <Route path="/reports" component={DashboardRoutes} />
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
