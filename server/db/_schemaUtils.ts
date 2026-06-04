/**
 * Shared helpers for idempotent, boot-time schema repair.
 *
 * The deploy pipeline doesn't reliably run drizzle migrations, so columns
 * added in schema.ts are also applied defensively at startup. Detecting
 * "already there" has to look through Drizzle's error wrapping: a
 * DrizzleQueryError's `.message` is the generic "Failed query: …" — the
 * real "Duplicate column name" text and the canonical MySQL code
 * (1060 / ER_DUP_FIELDNAME) live on `e.cause`.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./connection";
import { createLogger } from "../services/logger";

const log = createLogger("DB:Schema");

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** True when an error means the column/table already exists. */
export function isDuplicateColumnError(e: any): boolean {
  const codes = [e?.code, e?.errno, e?.cause?.code, e?.cause?.errno];
  if (codes.includes("ER_DUP_FIELDNAME") || codes.includes(1060)) return true;
  const text = `${e?.message ?? ""} ${e?.cause?.message ?? ""} ${e?.cause?.sqlMessage ?? ""}`;
  return /duplicate column|already exists/i.test(text);
}

/** Run an `ALTER TABLE … ADD COLUMN` DDL, treating "already there" as success. */
export async function addColumnIfMissing(db: Db, ddl: string, label: string): Promise<void> {
  try {
    await db.execute(sql.raw(ddl));
    log.info(`Schema repair: added ${label}`);
  } catch (e: any) {
    if (isDuplicateColumnError(e)) return;
    throw e;
  }
}
