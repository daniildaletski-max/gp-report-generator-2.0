/**
 * In-Memory Cache Service
 * 
 * Provides TTL-based caching for expensive database queries like
 * dashboard stats, monthly trends, and team comparisons.
 * 
 * Features:
 *   - Configurable TTL per cache entry
 *   - Automatic expiration cleanup
 *   - Cache invalidation by prefix
 *   - Memory-safe with max entry limits
 *   - Statistics tracking (hits, misses, evictions)
 */
import { createLogger } from "./logger";

const log = createLogger("Cache");

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

const DEFAULT_TTL_MS = 60_000;     // 1 minute default
const MAX_ENTRIES = 500;            // Prevent memory bloat
const CLEANUP_INTERVAL_MS = 120_000; // Clean every 2 minutes

class MemoryCache {
  private store = new Map<string, CacheEntry>();
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0 };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanup();
  }

  /**
   * Get a cached value, or undefined if expired/missing
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.updateSize();
      return undefined;
    }
    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Set a cache value with optional TTL (defaults to 1 minute)
   */
  set<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
    // Evict oldest if at capacity
    if (this.store.size >= MAX_ENTRIES && !this.store.has(key)) {
      this.evictOldest();
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    });
    this.updateSize();
  }

  /**
   * Get cached value or compute and cache it
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs: number = DEFAULT_TTL_MS): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Invalidate a specific key
   */
  invalidate(key: string): boolean {
    const existed = this.store.delete(key);
    this.updateSize();
    return existed;
  }

  /**
   * Invalidate all keys matching a prefix
   */
  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    this.updateSize();
    if (count > 0) log.debug(`Invalidated ${count} cache entries with prefix "${prefix}"`);
    return count;
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    const size = this.store.size;
    this.store.clear();
    this.updateSize();
    log.info(`Cache cleared (${size} entries removed)`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + "%" : "N/A";
    return { ...this.stats, hitRate };
  }

  private evictOldest(): void {
    let oldest: { key: string; createdAt: number } | null = null;
    for (const [key, entry] of Array.from(this.store.entries())) {
      if (!oldest || entry.createdAt < oldest.createdAt) {
        oldest = { key, createdAt: entry.createdAt };
      }
    }
    if (oldest) {
      this.store.delete(oldest.key);
      this.stats.evictions++;
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      for (const [key, entry] of Array.from(this.store.entries())) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        this.stats.evictions += cleaned;
        this.updateSize();
        log.debug(`Cleaned ${cleaned} expired cache entries`);
      }
    }, CLEANUP_INTERVAL_MS);

    // Don't block process exit
    if (this.cleanupTimer?.unref) this.cleanupTimer.unref();
  }

  private updateSize(): void {
    this.stats.size = this.store.size;
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.store.clear();
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================
export const cache = new MemoryCache();

// ============================================
// CACHE KEY BUILDERS (consistent key generation)
// ============================================
export const CacheKeys = {
  dashboardStats: (month: number, year: number, teamId?: number) =>
    `dashboard:stats:${month}:${year}:${teamId || 'all'}`,
  dashboardStatsByUser: (month: number, year: number, userId?: number) =>
    `dashboard:user:${month}:${year}:${userId || 'all'}`,
  monthlyTrend: (months: number, teamId?: number, userId?: number) =>
    `dashboard:trend:${months}:${teamId || 'all'}:${userId || 'all'}`,
  teamComparison: (userId: number) =>
    `dashboard:comparison:${userId}`,
  adminStats: () => 'dashboard:admin',
} as const;

// ============================================
// CACHE TTLs (in milliseconds)
// ============================================
export const CacheTTL = {
  DASHBOARD_STATS: 30_000,     // 30 seconds  — frequently accessed
  MONTHLY_TREND: 120_000,      // 2 minutes   — heavy query, changes slowly
  TEAM_COMPARISON: 120_000,    // 2 minutes
  ADMIN_STATS: 60_000,         // 1 minute
  DEFAULT: 60_000,             // 1 minute
} as const;
