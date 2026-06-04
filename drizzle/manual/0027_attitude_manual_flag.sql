-- 0027 — Attitude hybrid flag (Phase 4)
--
-- Applied idempotently at boot by ensureAttitudeManualColumn()
-- (server/db/attitude.ts). Same rationale as 0025/0026 — the deploy
-- pipeline does not run drizzle migrations. Kept under drizzle/manual/.
--
-- attitudeIsManual: 1 = `attitude` is a manual FM override and must NOT be
-- recomputed from screenshots; 0/null = derived (kept in sync with the
-- sum of attitudeScreenshots scores for the GP/month).

ALTER TABLE `monthly_gp_stats` ADD COLUMN `attitudeIsManual` int NULL DEFAULT 0;
