/**
 * Database barrel — re-exports the modular `./db/*` implementation.
 *
 * Historically this file held a 3,600-line monolith. The codebase was
 * refactored into `server/db/<domain>.ts` modules (with structured logging,
 * connection retry, health checks, etc.), but the monolith was left in
 * place. Because Node module resolution picks the file `db.ts` over the
 * directory `db/`, every `import * as db from "./db"` was loading the old
 * monolith and the new modular code was effectively dead.
 *
 * Keeping this file as a barrel preserves the existing import surface
 * while making the modular implementation the single source of truth.
 */
export * from "./db/index";
