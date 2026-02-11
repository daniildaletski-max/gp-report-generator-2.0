import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initScheduledReports } from "../scheduledReports";
import { createLogger } from "../services/logger";
import { requestTracingMiddleware, requestValidation } from "../services/requestTracing";
import { cache } from "../services/cache";

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

// Clean up expired rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const keys = Array.from(rateLimitStore.keys());
  for (const key of keys) {
    const value = rateLimitStore.get(key);
    if (value && now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Request logger replaced by requestTracingMiddleware (services/requestTracing.ts)

// ============================
// Global error handler
// ============================
function globalErrorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  log.error(`Unhandled error: ${err.message}`, err);

  const isProduction = process.env.NODE_ENV === "production";
  res.status(500).json({
    error: isProduction ? "Internal server error" : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

// ============================
// Security headers middleware
// ============================
function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
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

async function startServer() {
  const app = express();
  const server = createServer(app);

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

  // Health check endpoint with cache stats
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      nodeVersion: process.version,
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
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    log.info(`[${signal}] Shutting down gracefully...`);
    cache.clear();
    server.close(() => {
      log.info("Server closed.");
      process.exit(0);
    });
    setTimeout(() => {
      log.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled rejection", reason instanceof Error ? reason : new Error(String(reason)));
  });
}

startServer().catch((err) => log.error("Server startup failed", err instanceof Error ? err : undefined));
