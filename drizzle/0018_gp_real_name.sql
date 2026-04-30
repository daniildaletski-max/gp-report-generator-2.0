-- Add a column for the GP's real-life legal name. The existing
-- `name` column stores the dealer pseudonym shown on the floor
-- ("Clover", "Cleo"), which doesn't match what HR systems like
-- Persona use ("Aleksandra Borovkova"). Without this column the
-- Persona sync matched 0/138 workers because every fuzzy match was
-- comparing real names against pseudonyms. NULLABLE so the column
-- can roll out without backfill; matcher prefers it when set.
ALTER TABLE `game_presenters` ADD `realName` varchar(255);
