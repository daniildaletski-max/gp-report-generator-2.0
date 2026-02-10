import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  /** Show a "Go Back" button instead of "Go Home" */
  showGoBack?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Route-level error boundary for wrapping individual pages.
 * Provides contextual recovery options without crashing the entire app.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Log to console in development
    if (process.env.NODE_ENV !== "production") {
      console.error("[RouteErrorBoundary]", error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = "/dashboard";
  };

  handleGoBack = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      const { fallbackTitle = "Something went wrong", showGoBack = false } = this.props;

      return (
        <div className="flex items-center justify-center min-h-[60vh] p-6">
          <Card className="max-w-lg w-full border-destructive/20">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <CardTitle className="text-lg">{fallbackTitle}</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                An error occurred while rendering this page. You can try again or navigate elsewhere.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && process.env.NODE_ENV !== "production" && (
                <div className="rounded-lg bg-muted/50 p-3 text-xs">
                  <p className="font-mono text-destructive mb-1">{error.message}</p>
                  {errorInfo?.componentStack && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Component Stack
                      </summary>
                      <pre className="mt-1 text-[10px] overflow-auto max-h-40 whitespace-pre-wrap text-muted-foreground">
                        {errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}
              <div className="flex gap-2 justify-center">
                <Button variant="default" size="sm" onClick={this.handleRetry} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try Again
                </Button>
                {showGoBack ? (
                  <Button variant="outline" size="sm" onClick={this.handleGoBack} className="gap-1.5">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Go Back
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={this.handleGoHome} className="gap-1.5">
                    <Home className="h-3.5 w-3.5" />
                    Dashboard
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
