/**
 * In-process realtime event bus.
 *
 * A tiny typed pub/sub that the SSE endpoint (`/api/events`) fans out to
 * connected browsers. Server code publishes a small "something changed"
 * signal — never the data itself — so the client can invalidate the
 * relevant TanStack Query caches and refetch through the normal
 * (user-scoped, access-controlled) tRPC procedures. That keeps the stream
 * free of PII and means "live" can't leak data the user couldn't already
 * fetch.
 *
 * In-process is intentional: a single Node server runs the app (see
 * `node dist/index.js`). If this ever scales to multiple instances, swap
 * the EventEmitter for Redis pub/sub behind the same publish/subscribe
 * signature.
 */
import { EventEmitter } from "node:events";

export type AppEvent =
  | { type: "evaluations.changed"; source?: string; userId?: number; teamId?: number; gpId?: number; count?: number }
  | { type: "attendance.changed"; source?: string; userId?: number; teamId?: number }
  | { type: "report.changed"; userId?: number; teamId?: number }
  | { type: "sync.completed"; source: "studioworks"; inserted?: number; userId?: number; teamId?: number };

export type EventEnvelope = AppEvent & { at: string; seq: number };

const bus = new EventEmitter();
// One listener per open SSE connection — there can be many, so lift the
// default 10-listener warning cap.
bus.setMaxListeners(0);

let seq = 0;

/** Publish a change signal to every connected client. Never throws. */
export function publish(ev: AppEvent): void {
  try {
    const env: EventEnvelope = { ...ev, at: new Date().toISOString(), seq: ++seq };
    bus.emit("event", env);
  } catch {
    // A misbehaving subscriber must never break the publisher (a DB write).
  }
}

/** Subscribe to all events. Returns an unsubscribe function. */
export function subscribe(handler: (e: EventEnvelope) => void): () => void {
  bus.on("event", handler);
  return () => { bus.off("event", handler); };
}

/** Current subscriber count — exposed for /api/health diagnostics. */
export function subscriberCount(): number {
  return bus.listenerCount("event");
}
