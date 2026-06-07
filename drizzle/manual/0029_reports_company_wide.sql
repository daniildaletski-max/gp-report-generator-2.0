-- 0029 — Company-wide monthly reports (Phase 7)
--
-- Applied idempotently at boot by ensureReportsTeamNullable()
-- (server/db/reports.ts), wired in server/_core/index.ts. Same rationale
-- as 0025–0028: the deploy pipeline does not run drizzle migrations. Kept
-- under drizzle/manual/ with no meta snapshot, so drizzle-kit migrate must
-- not pick it up. When a DB is available, regenerate a proper snapshot
-- migration with `drizzle-kit generate` and retire this file.
--
-- A NULL teamId marks a company-wide report covering every GP for the month
-- (the new default). Legacy per-team reports keep their teamId for
-- historical display. Relaxing NOT NULL never fails on existing data, so the
-- statement below is safe to run by hand against an existing DB and is a
-- no-op once the column is already nullable.

ALTER TABLE `reports` MODIFY `teamId` int NULL;
