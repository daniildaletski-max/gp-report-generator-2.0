import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QueryErrorProps {
  title?: string;
  description?: string;
  /** Wire to the query's `refetch`. When provided, a Retry button shows. */
  onRetry?: () => void;
  /** Any extra action (e.g. a link). */
  action?: ReactNode;
  /** Smaller variant for inline contexts (e.g. inside a card). */
  size?: "default" | "compact";
}

/**
 * Standard "this failed to load" state for a tRPC/react-query error.
 *
 * tRPC query errors don't throw — they surface as `isError`, which the
 * route-level ErrorBoundary never sees. So each data view needs to render
 * this explicitly to degrade gracefully (a blank list or zeroed stats
 * otherwise looks identical to "no data", hiding real outages). Pair it
 * with the query's `refetch` for one-click recovery.
 */
export function QueryError({
  title = "Couldn't load this",
  description = "Something went wrong fetching the data — likely a brief network or server hiccup.",
  onRetry,
  action,
  size = "default",
}: QueryErrorProps) {
  const padding = size === "compact" ? "py-8" : "py-14";
  const iconBox = size === "compact" ? "h-14 w-14" : "h-18 w-18";
  const iconSize = size === "compact" ? "h-7 w-7" : "h-9 w-9";

  return (
    <div className={`relative flex flex-col items-center justify-center text-center ${padding} px-6 overflow-hidden`}>
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-48 w-48 rounded-full bg-rose-100/40 blur-3xl" />
      </div>

      <div className="relative mb-4">
        <div className={`relative ${iconBox} rounded-2xl bg-gradient-to-br from-rose-50 to-amber-50 border border-rose-200/60 flex items-center justify-center shadow-sm`}>
          <AlertTriangle className={`${iconSize} text-rose-500/80`} />
        </div>
      </div>

      <h3 className="text-base font-semibold text-slate-800 mb-1.5">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed">{description}</p>

      {(onRetry || action) && (
        <div className="mt-5 flex items-center gap-2">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
