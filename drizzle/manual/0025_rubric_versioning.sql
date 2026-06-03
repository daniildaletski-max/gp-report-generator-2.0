-- 0025 — Versioned rubric (Phase 2)
--
-- This is the human-readable DDL for the versioned-rubric schema. It is
-- applied IDEMPOTENTLY AT BOOT by `server/db/rubricMigration.ts`
-- (ensureRubricSchema), mirroring how 0024_team_manager_email reaches the
-- production DB — the deploy pipeline does not run drizzle migrations.
--
-- It lives under drizzle/manual/ (not the flat drizzle-kit numbered space)
-- on purpose: there is no matching meta snapshot, so it must NOT be picked
-- up by `drizzle-kit migrate`. When a DB is available, regenerate a proper
-- snapshot migration with `drizzle-kit generate` and retire this file.
--
-- Safe to run by hand against an existing DB: every statement is idempotent
-- (CREATE TABLE IF NOT EXISTS / INSERT IGNORE / IS NULL-guarded UPDATE).

-- 1. Rubric tables -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS `rubrics` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(255) NOT NULL,
  `isActive` int NOT NULL DEFAULT 1,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `rubric_versions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `rubricId` int NOT NULL,
  `version` int NOT NULL,
  `label` varchar(255) NOT NULL,
  `effectiveFrom` timestamp NULL,
  `totalMax` int NOT NULL DEFAULT 0,
  `isLocked` int NOT NULL DEFAULT 0,
  `isActive` int NOT NULL DEFAULT 0,
  `createdById` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_rubric_versions_rubric_version` (`rubricId`, `version`),
  KEY `idx_rubric_versions_rubric` (`rubricId`)
);

CREATE TABLE IF NOT EXISTS `rubric_criteria` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `versionId` int NOT NULL,
  `criterionKey` varchar(64) NOT NULL,
  `label` varchar(255) NOT NULL,
  `description` text NULL,
  `maxScore` int NOT NULL,
  `criterionGroup` enum('appearance','game') NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  UNIQUE KEY `uk_rubric_criteria_version_key` (`versionId`, `criterionKey`),
  KEY `idx_rubric_criteria_version` (`versionId`)
);

-- 2. New evaluation columns --------------------------------------------------
-- (ALTER ... ADD COLUMN has no IF NOT EXISTS in MySQL; the boot guard
--  swallows the "Duplicate column" error. Run these once when applying by hand.)

ALTER TABLE `evaluations` ADD COLUMN `rubricVersionId` int NULL;
ALTER TABLE `evaluations` ADD COLUMN `scores` json NULL;

-- 3. Seed rubric v1 (must match shared/scoring DEFAULT_RUBRIC_V1) -------------

INSERT IGNORE INTO `rubrics` (`id`, `name`, `isActive`) VALUES (1, 'Default GP Evaluation', 1);

INSERT IGNORE INTO `rubric_versions`
  (`id`, `rubricId`, `version`, `label`, `totalMax`, `isLocked`, `isActive`)
  VALUES (1, 1, 1, 'v1 — Original /22', 22, 1, 1);

INSERT IGNORE INTO `rubric_criteria`
  (`versionId`, `criterionKey`, `label`, `description`, `maxScore`, `criterionGroup`, `sortOrder`)
VALUES
  (1, 'hair',            'Hair',             'Neatness, styling and camera-readiness of hair.',        3, 'appearance', 0),
  (1, 'makeup',          'Makeup',           'Camera-appropriate makeup application and upkeep.',      3, 'appearance', 1),
  (1, 'outfit',          'Outfit',           'Uniform condition, fit and overall presentation.',       3, 'appearance', 2),
  (1, 'posture',         'Posture',          'Stance, body language and on-camera presence.',          3, 'appearance', 3),
  (1, 'dealingStyle',    'Dealing Style',    'Accuracy, clarity and style of card / game handling.',   5, 'game',       4),
  (1, 'gamePerformance', 'Game Performance', 'Energy, engagement and overall game presentation.',      5, 'game',       5);

-- 4. Backfill legacy evaluations ---------------------------------------------

UPDATE `evaluations` SET `rubricVersionId` = 1 WHERE `rubricVersionId` IS NULL;

UPDATE `evaluations` SET `scores` = JSON_OBJECT(
  'hair',            COALESCE(`hairScore`, 0),
  'makeup',          COALESCE(`makeupScore`, 0),
  'outfit',          COALESCE(`outfitScore`, 0),
  'posture',         COALESCE(`postureScore`, 0),
  'dealingStyle',    COALESCE(`dealingStyleScore`, 0),
  'gamePerformance', COALESCE(`gamePerformanceScore`, 0)
) WHERE `scores` IS NULL;
