/**
 * Request Tracing Middleware
 * 
 * Generates unique request IDs for every incoming request, enabling
 * end-to-end tracing across logs, errors, and async operations.
 * 
 * Features:
 *   - Unique request ID per request (X-Request-Id header)
 *   - Request timing with performance measurements
 *   - Response size tracking
 *   - Structured log integration
 *   - Error correlation
 */
import { Request, Response, NextFunction } from "express";
import { createLogger } from "./logger";

const log = createLogger("HTTP");

let requestCounter = 0;

/**
 * Generate a unique request ID
 * Format: timestamp-counter-random (e.g., "1707609600000-42-a3f9")
 */
function generateRequestId(): string {
  requestCounter = (requestCounter + 1) % 1_000_000;
  const random = Math.random().toString(36).substring(2, 6);
  return `${Date.now()}-${requestCounter}-${random}`;
}

/**
 * Express middleware that:
 * 1. Assigns a unique request ID (from header or generated)
 * 2. Adds X-Request-Id to the response
 * 3. Measures request duration
 * 4. Logs request completion with timing
 */
export function requestTracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use incoming header or generate a new ID
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  
  // Attach to request and response
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  
  const startTime = Date.now();
  const { method, originalUrl } = req;

  // Track response completion
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const contentLength = res.getHeader('content-length');
    
    // Categorize log level by status and duration
    if (status >= 500) {
      log.error(`${method} ${originalUrl} ${status} ${duration}ms [${requestId}]`);
    } else if (status >= 400 || duration > 5000) {
      log.warn(`${method} ${originalUrl} ${status} ${duration}ms [${requestId}]`);
    } else if (duration > 2000) {
      log.info(`SLOW ${method} ${originalUrl} ${status} ${duration}ms [${requestId}]`);
    }
    // Normal requests only logged at debug level
  });

  next();
}

/**
 * Get the request ID from a request object
 */
export function getRequestId(req: Request): string {
  return (req as any).requestId || 'unknown';
}

/**
 * Express middleware for request size limits and validation
 */
export function requestValidation(req: Request, res: Response, next: NextFunction): void {
  // Reject suspiciously large content-length headers early
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 55 * 1024 * 1024) { // 55MB hard limit
    res.status(413).json({ error: 'Request entity too large', maxSize: '50MB' });
    return;
  }
  next();
}
