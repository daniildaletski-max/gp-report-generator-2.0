import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Live realtime updates over Server-Sent Events.
 *
 * Opens one EventSource to /api/events for the whole dashboard session.
 * The server pushes tiny "X changed" signals (no data); we react by
 * invalidating the relevant TanStack Query caches so the affected screens
 * refetch through the normal scoped procedures — i.e. data appears live
 * the moment a Studioworks sync / upload / manual eval lands, without
 * waiting for the existing polling interval.
 *
 * EventSource reconnects automatically; if a proxy drops the stream the
 * app's existing refetchInterval polling still covers it, so this is a
 * pure enhancement.
 */
export function useLiveEvents(): { connected: boolean; lastEventAt: number | null } {
  const utils = trpc.useUtils();
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  // Keep utils stable across renders without re-opening the stream.
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    let es: EventSource | null = null;
    let stopped = false;

    const invalidateEvaluations = () => {
      const u = utilsRef.current;
      u.evaluation.coverage.invalidate();
      u.evaluation.list.invalidate();
      u.dashboard.insights.invalidate();
      u.dashboard.activityFeed.invalidate();
      u.actionItems.stats.invalidate();
    };
    const invalidateAttendance = () => {
      const u = utilsRef.current;
      u.attendance.teamSummary.invalidate();
      u.attendance.trends.invalidate();
      u.dashboard.insights.invalidate();
    };

    const open = () => {
      if (stopped) return;
      es = new EventSource("/api/events", { withCredentials: true });

      es.addEventListener("hello", () => setConnected(true));
      es.onopen = () => setConnected(true);

      const bump = () => setLastEventAt(Date.now());
      es.addEventListener("evaluations.changed", () => { invalidateEvaluations(); bump(); });
      es.addEventListener("sync.completed", () => { invalidateEvaluations(); invalidateAttendance(); bump(); });
      es.addEventListener("attendance.changed", () => { invalidateAttendance(); bump(); });
      es.addEventListener("report.changed", () => { utilsRef.current.dashboard.activityFeed.invalidate(); bump(); });

      es.onerror = () => {
        setConnected(false);
        // EventSource retries on its own (server sends `retry:`). If it
        // permanently closed, fall back to a manual reopen after a delay.
        if (es && es.readyState === EventSource.CLOSED && !stopped) {
          es.close();
          setTimeout(open, 5000);
        }
      };
    };

    open();
    return () => { stopped = true; es?.close(); };
    // utils is read via ref; we want exactly one connection per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected, lastEventAt };
}
