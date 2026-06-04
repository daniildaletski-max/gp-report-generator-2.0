-- 0028 — Consolidate mistakes onto a single source of truth (Phase 5)
--
-- Applied idempotently at boot by ensureMistakesConsolidated()
-- (server/db/attendance.ts). monthly_gp_stats.mistakes is the source of
-- truth; gp_monthly_attendance.mistakes is deprecated. These statements
-- raise stats to any higher legacy attendance value and create stats rows
-- for attendance-only months carrying mistakes, so reading mistakes from
-- stats alone never under-reports. Both are no-ops once consolidated.

UPDATE `monthly_gp_stats` s
JOIN `gp_monthly_attendance` a
  ON a.gamePresenterId = s.gamePresenterId AND a.month = s.month AND a.year = s.year
SET s.mistakes = a.mistakes
WHERE COALESCE(a.mistakes, 0) > COALESCE(s.mistakes, 0);

INSERT INTO `monthly_gp_stats` (gamePresenterId, month, year, mistakes)
SELECT a.gamePresenterId, a.month, a.year, a.mistakes
FROM `gp_monthly_attendance` a
LEFT JOIN `monthly_gp_stats` s
  ON s.gamePresenterId = a.gamePresenterId AND s.month = a.month AND s.year = a.year
WHERE s.id IS NULL AND COALESCE(a.mistakes, 0) > 0;
