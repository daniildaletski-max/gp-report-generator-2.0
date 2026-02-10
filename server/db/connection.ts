/**
 * Database connection module with connection pooling and retry logic
 * Centralized database initialization and health checking
 */
import { drizzle } from "drizzle-orm/mysql2";
import { createLogger } from "../services/logger";

const log = createLogger("Database");

let _db: ReturnType<typeof drizzle> | null = null;
let _connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Get or create the database connection with retry logic
 */
export async function getDb() {
  if (_db) return _db;

  if (!process.env.DATABASE_URL) {
    log.warn("DATABASE_URL not set — database features will be unavailable");
    return null;
  }

  while (_connectionAttempts < MAX_RETRY_ATTEMPTS) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
      log.info("Database connection established successfully");
      _connectionAttempts = 0;
      return _db;
    } catch (error) {
      _connectionAttempts++;
      log.error(
        `Connection attempt ${_connectionAttempts}/${MAX_RETRY_ATTEMPTS} failed`,
        error instanceof Error ? error : new Error(String(error))
      );
      if (_connectionAttempts < MAX_RETRY_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  log.error("All database connection attempts exhausted");
  _connectionAttempts = 0;
  return null;
}

/**
 * Require a database connection or throw
 */
export async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  return db;
}

/**
 * Execute a database operation with automatic retry on transient failures
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = 2
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isTransient = isTransientError(lastError);
      if (!isTransient || attempt === maxRetries) {
        log.error(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1})`, lastError);
        throw lastError;
      }
      log.warn(`${operationName} transient failure, retrying...`, {
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
      });
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Check if an error is transient (network issues, deadlocks, etc.)
 */
function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const transientPatterns = [
    'deadlock',
    'lock wait timeout',
    'connection lost',
    'connection reset',
    'econnreset',
    'econnrefused',
    'too many connections',
    'gone away',
  ];
  return transientPatterns.some(pattern => message.includes(pattern));
}

/**
 * Health check for the database connection
 */
export async function checkHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const db = await getDb();
    if (!db) return { ok: false, latencyMs: 0 };
    // Simple ping query
    await db.execute(new (await import('drizzle-orm')).StringChunk('SELECT 1') as any);
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}
