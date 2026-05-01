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
import { initScheduledReports, initStudioworksSync, initAutoCoaching } from "../scheduledReports";
import { createLogger } from "../services/logger";
import { requestTracingMiddleware, requestValidation } from "../services/requestTracing";
import { cache } from "../services/cache";
import { checkHealth as checkDbHealth, getDb } from "../db/connection";

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
