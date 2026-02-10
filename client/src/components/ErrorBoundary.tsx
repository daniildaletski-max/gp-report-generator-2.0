import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home, Bug } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: { componentStack?: string } | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo: { componentStack: errorInfo.componentStack || undefined } });
    // Log error for monitoring
    console.error("[ErrorBoundary] Caught error:", error.message);
    if (errorInfo.componentStack) {
      console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-[#0a0906]">
          <div className="flex flex-col items-center w-full max-w-lg text-center">
            <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>

            <h2 className="text-xl font-semibold text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-white/40 text-sm mb-6">
              {this.state.error?.message || "An unexpected error occurred. Please try again."}
            </p>

            {isDev && this.state.error?.stack && (
              <div className="w-full mb-6 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-auto max-h-48">
                <pre className="text-xs text-white/30 whitespace-pre-wrap text-left font-mono">
                  {this.state.error.stack}
                </pre>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={this.handleReset}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium",
                  "bg-white/[0.05] text-white/70 border border-white/[0.08]",
                  "hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer"
                )}
              >
                <Bug className="h-4 w-4" />
                Try Again
              </button>
              <button
                onClick={this.handleGoHome}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium",
                  "bg-white/[0.05] text-white/70 border border-white/[0.08]",
                  "hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer"
                )}
              >
                <Home className="h-4 w-4" />
                Go Home
              </button>
              <button
                onClick={this.handleReload}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium",
                  "bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-black",
                  "hover:from-[#b8860b] hover:to-[#8b6914] transition-all cursor-pointer",
                  "shadow-lg shadow-[#d4af37]/20"
                )}
              >
                <RotateCcw className="h-4 w-4" />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
