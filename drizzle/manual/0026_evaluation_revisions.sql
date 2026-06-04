-- 0026 — Evaluation edit history (Phase 3)
--
-- Applied idempotently at boot by ensureEvaluationHistorySchema()
-- (server/db/evaluationHistory.ts). Same rationale as 0025: the deploy
-- pipeline does not run drizzle migrations. Kept under drizzle/manual/
-- with no meta snapshot, so drizzle-kit migrate must not pick it up.

CREATE TABLE IF NOT EXISTS `evaluation_revisions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `evaluationId` int NOT NULL,
  `editedById` int NULL,
  `reason` text NULL,
  `changedFields` json NULL,
  `snapshotBefore` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_evaluation_revisions_eval` (`evaluationId`)
);
