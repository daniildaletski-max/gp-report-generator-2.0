import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import net from "net";
import { sql } from "drizzle-orm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initScheduledReports, initStudioworksSync, initAutoCoaching, initPersonaAutoSync } from "../scheduledReports";
import { createLogger } from "../services/logger";
import { requestTracingMiddleware, requestValidation } from "../services/requestTracing";
import { cache } from "../services/cache";
import { checkHealth as checkDbHealth, getDb } from "../db/connection";
import { ENV } from "./env";
import * as db from "../db";

const log = createLogger("Server");

// ============================
// Simple in-memory rate limiter
// ============================
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function rateLimiter(opts: { windowMs: number; max: number; keyPrefix?: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${opts.keyPrefix || "global"}:${ip}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + opts.windowMs });
      return next();
    }

    record.count++;
    if (record.count > opts.max) {
      res.status(429).json({
        error: "Too many requests. Please try again later.",
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
      return;
    }

    next();
  };
}

// Clean up expired rate limit entries every 5 minutes.
// Held in a handle so graceful shutdown can clear it and let the event loop exit.
const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  rateLimitStore.forEach((value, key) => {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  });
}, 5 * 60 * 1000);
rateLimitCleanupTimer.unref();

// Request logger replaced by requestTracingMiddleware (services/requestTracing.ts)

// ============================
// Global error handler
// ============================
function globalErrorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  log.error(`Unhandled error: ${err.message}`, err);

  res.status(500).json({
    error: isProduction ? "Internal server error" : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

// ============================
// Security headers middleware
// ============================
const isProduction = process.env.NODE_ENV === "production";

// Build a CSP that allows the SPA + Vite HMR in dev. In dev we relax
// connect-src/script-src for the HMR websocket and inline runtime injections.
// 'unsafe-inline' for styles is kept because Tailwind/Radix emit inline styles.
function buildCsp(): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:", "https:"],
    "style-src": ["'self'", "'unsafe-inline'", "https:"],
    "script-src": ["'self'"],
    "connect-src": ["'self'", "https:"],
    "worker-src": ["'self'", "blob:"],
  };

  if (!isProduction) {
    // Vite injects inline scripts and uses a websocket for HMR
    directives["script-src"].push("'unsafe-inline'", "'unsafe-eval'");
    directives["connect-src"].push("ws:", "wss:");
  }

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

const CSP_HEADER = buildCsp();

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  // X-XSS-Protection is deprecated and can introduce vulnerabilities in older
  // browsers. Modern browsers honour CSP instead. Intentionally not set.
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", CSP_HEADER);
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (isProduction) {
    // Only emit HSTS over real HTTPS deployments; sending it over plain HTTP
    // in dev breaks subsequent localhost requests in some browsers.
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  next();
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function ensureRealNameColumn(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`ALTER TABLE \`game_presenters\` ADD COLUMN \`realName\` varchar(255) NULL`);
    log.info("Schema repair: added `realName` column to game_presenters");
  } catch (e: any) {
    const msg = e?.message || String(e);
    // MySQL: "Duplicate column name" → already there, this is the steady-state.
    if (/Duplicate column|already exists/i.test(msg)) return;
    throw e;
  }
}

/**
 * Boot-time credential audit for the automation pipeline.
 *
 * History: misconfigured env vars used to fail silently — `RESEND_API_KEY`
 * absence made every monthly report email return `false` from
 * `sendReportEmail` with only a `console.warn`, and Persona/Studioworks
 * cron jobs would log "Credentials not configured — skipped" once and
 * then silently never run again. Operators only discovered the
 * misconfig weeks later when an FM asked "where's my report?".
 *
 * This function runs once at server boot and emits LOUD log entries
 * for any integration that's plausibly required but missing its
 * credentials. Non-fatal — the server still comes up — but the
 * messages land in deploy logs where they're hard to miss.
 *
 * Checks:
 * 1. RESEND_API_KEY (always required for monthly emails) — log.error
 *    if missing.
 * 2. Persona credentials — log.error if any team has personaProjectId
 *    set (i.e. Persona auto-sync is expected to do work) but
 *    PERSONA_USERNAME/PASSWORD are missing.
 * 3. Studioworks credentials — log.warn if STUDIOWORKS_SYNC_CRON is
 *    enabled (default: every 6h) but credentials are missing.
 *
 * No-op silent path: each integration that's correctly configured
 * just passes through; only failures log.
 */
async function validateAutomationCredentials(): Promise<void> {
  const issues: string[] = [];

  // 1. Resend (monthly report emails). Always required when any FM is
  // expected to receive a report, so we treat absence as an error.
  if (!ENV.resendApiKey) {
    log.error(
      "[BootAudit] RESEND_API_KEY is not set — monthly report emails WILL NOT be delivered. " +
      "Set the env var on your deploy host (Resend dashboard → API Keys → create) and restart.",
      new Error("RESEND_API_KEY missing"),
    );
    issues.push("RESEND_API_KEY");
  }

  // 2. Persona credentials — only required when at least one team has
  // a personaProjectId configured AND the auto-sync cron isn't
  // explicitly disabled. Mirrors the same `PERSONA_SYNC_CRON=off`
  // guard `initPersonaAutoSync` itself uses, so an operator who
  // intentionally turned the integration off doesn't see a false
  // actionable error in their deploy logs.
  const personaCronEnabled = (process.env.PERSONA_SYNC_CRON ?? "").toLowerCase() !== "off";
  const hasPersonaUser = !!process.env.PERSONA_USERNAME;
  const hasPersonaPass = !!process.env.PERSONA_PASSWORD;
  if (personaCronEnabled && (!hasPersonaUser || !hasPersonaPass)) {
    try {
      const allTeams = await db.getAllFmTeams();
      const teamsExpectingPersona = allTeams.filter(t => (t as any).personaProjectId);
      if (teamsExpectingPersona.length > 0) {
        const names = teamsExpectingPersona.map(t => t.teamName).join(", ");
        log.error(
          `[BootAudit] PERSONA_USERNAME/PERSONA_PASSWORD missing but ${teamsExpectingPersona.length} team(s) have personaProjectId configured: ${names}. ` +
          `Persona auto-sync will skip every run; attendance data will go stale. Set both env vars and restart, or set PERSONA_SYNC_CRON=off to silence.`,
          new Error("PERSONA_* credentials missing"),
        );
        issues.push("PERSONA_*");
      }
    } catch (e) {
      // DB not reachable yet — Persona check is informational, don't
      // block the audit on it.
      log.warn("[BootAudit] Could not check teams for personaProjectId (DB not ready)", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 3. Studioworks — warn rather than error since the integration is
  // optional and many deploys don't use it. Only flag when the cron
  // is actively enabled.
  const studioCronEnabled = (process.env.STUDIOWORKS_SYNC_CRON ?? "").toLowerCase() !== "off";
  const hasStudioUser = !!process.env.STUDIOWORKS_USERNAME;
  const hasStudioPass = !!process.env.STUDIOWORKS_PASSWORD;
  if (studioCronEnabled && (!hasStudioUser || !hasStudioPass)) {
    log.warn(
      "[BootAudit] STUDIOWORKS_USERNAME/PASSWORD missing — Studioworks auto-sync will skip every run. " +
      "Set credentials or set STUDIOWORKS_SYNC_CRON=off to silence this warning.",
    );
    issues.push("STUDIOWORKS_*");
  }

  if (issues.length === 0) {
    log.info("[BootAudit] Automation credentials OK (Resend / Persona / Studioworks)");
  } else {
    log.warn(`[BootAudit] ${issues.length} automation integration(s) missing config: ${issues.join(", ")}. See errors above for remediation.`);
  }
}


async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust the first proxy hop so req.ip reflects the real client (X-Forwarded-For).
  // Without this every rate-limit bucket collapses to the proxy's address.
  app.set("trust proxy", 1);

  // Security headers
  app.use(securityHeaders);

  // Request tracing (unique IDs + timing)
  app.use(requestTracingMiddleware);

  // Request validation (size limits)
  app.use(requestValidation);

  // Global rate limiter: 200 requests per minute per IP
  app.use(rateLimiter({ windowMs: 60_000, max: 200, keyPrefix: "api" }));

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // CORS for the bookmarklet-driven importer endpoints. The
  // bookmarklets run inside the Persona / Studioworks browser tabs
  // and POST cross-origin to our tRPC API; without these headers
  // the browser blocks the preflight before the mutation even
  // executes (Codex P1 on PR #79).
  //
  // Scope is intentionally narrow:
  //   - Only the two import endpoints get the CORS middleware.
  //   - Only the FM-source domains (and their subdomains) are
  //     allowed as Origin.
  //   - Credentials are NOT included — the bookmarklet sends a
  //     stateless payload; the FM still authenticates inside our
  //     own UI to *use* the imported data.
  const importCorsAllowList = new Set([
    "https://reports.persona.ee",
    "https://persona.ee",
    "https://team.studioworks.ee",
    "https://studioworks.ee",
    // Local-dev convenience
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ]);
  const importCorsRoutes = [
    "/api/trpc/personaSync.importBatchForTeam",
    "/api/trpc/studioworksSync.importBatch",
  ];
  for (const route of importCorsRoutes) {
    app.use(route, (req, res, next) => {
      const origin = req.headers.origin as string | undefined;
      if (origin && importCorsAllowList.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        // Required for the bookmarklet to send the session cookie on
        // a cross-origin POST. Note: the cookie itself must be set
        // with SameSite=None; Secure for the browser to actually
        // include it. Older browsers / SameSite=Lax sessions will
        // still fall through to the paste-mode fallback in the UI.
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Max-Age", "86400");
      }
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  // Stricter rate limit for file upload routes
  app.use("/api/trpc/evaluation.uploadAndExtract", rateLimiter({ windowMs: 60_000, max: 30, keyPrefix: "upload" }));
  app.use("/api/trpc/errorScreenshot.upload", rateLimiter({ windowMs: 60_000, max: 30, keyPrefix: "upload" }));
  app.use("/api/trpc/attitudeScreenshot.upload", rateLimiter({ windowMs: 60_000, max: 30, keyPrefix: "upload" }));
  app.use("/api/trpc/errorFile.upload", rateLimiter({ windowMs: 60_000, max: 10, keyPrefix: "file-upload" }));

  // Liveness check: cheap, never touches the DB.
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      cache: cache.getStats(),
    });
  });

  // Readiness check: probes the database. Returns 503 if it can't be reached
  // so load balancers / orchestrators stop routing traffic to this instance.
  app.get("/api/health/ready", async (_req, res) => {
    const dbHealth = await checkDbHealth();
    const status = dbHealth.ok ? 200 : 503;
    res.status(status).json({
      status: dbHealth.ok ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbHealth,
      cache: cache.getStats(),
    });
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Global error handler (must be last)
  app.use(globalErrorHandler);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    log.info(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    log.info(`Server running on http://localhost:${port}/`);
    log.info(`Environment: ${process.env.NODE_ENV || "development"}`);
    log.info(`Modules loaded: DB (13 domain modules), Services (5 modules), Routes (16 routers)`);
    // Initialize scheduled monthly report generation
    initScheduledReports();
    // Studioworks auto-sync — runs every 6h by default. Skipped at
    // runtime when STUDIOWORKS_USERNAME/PASSWORD env vars aren't set,
    // so this is safe even when the integration isn't configured yet.
    initStudioworksSync();
    // Auto-coaching — daily at 07:00 EET, turns regression insights
    // into action items so the FM doesn't have to manually create
    // a coaching plan for every GP that dropped points.
    initAutoCoaching();
    // Persona attendance auto-sync — every 12h. Keeps attendance
    // numbers fresh throughout the month instead of only on the
    // 1st. Anomaly detection inside personaSync flags sudden absence
    // spikes as high-priority action items.
    initPersonaAutoSync();
    // Idempotent schema repair for `game_presenters.realName`.
    // Manus's deploy doesn't run drizzle migrations automatically, so
    // when PR #38 added the column to schema.ts but the prod DB still
    // lacked it, every `SELECT` against `game_presenters` failed with
    // "Unknown column 'realName' in field list" — the admin page broke.
    // We add the column at boot if it's missing; if it's already there
    // MySQL throws "Duplicate column" which we swallow.
    ensureRealNameColumn().catch(err => {
      log.warn("realName boot check failed (non-fatal)", { error: err instanceof Error ? err.message : String(err) });
    });
    // Automation credentials audit — surfaces missing RESEND_API_KEY /
    // PERSONA_* / STUDIOWORKS_* env vars in deploy logs so operators
    // catch misconfig at startup instead of weeks later when an FM
    // asks why a report didn't arrive. See `validateAutomationCredentials`.
    validateAutomationCredentials().catch(err => {
      log.warn("Boot credential audit failed (non-fatal)", { error: err instanceof Error ? err.message : String(err) });
    });
  });

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = (signal: string, exitCode = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log.info(`[${signal}] Shutting down gracefully...`);
    clearInterval(rateLimitCleanupTimer);
    cache.clear();
    server.close(() => {
      log.info("Server closed.");
      process.exit(exitCode);
    });
    setTimeout(() => {
      log.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled rejection", reason instanceof Error ? reason : new Error(String(reason)));
  });

  // An uncaughtException leaves the process in an undefined state; log loudly
  // and tear down. The OS supervisor (systemd / k8s / pm2) is expected to
  // restart us. Without this handler Node's default is to exit silently with
  // status 1 after printing to stderr.
  process.on("uncaughtException", (err) => {
    log.error("Uncaught exception — initiating shutdown", err);
    shutdown("uncaughtException", 1);
  });
}

startServer().catch((err) => log.error("Server startup failed", err instanceof Error ? err : undefined));
