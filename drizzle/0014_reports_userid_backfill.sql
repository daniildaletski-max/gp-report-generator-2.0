UPDATE `reports`
SET `userId` = `generatedById`
WHERE `userId` IS NULL
  AND `generatedById` IS NOT NULL;
