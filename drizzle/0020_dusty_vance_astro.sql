-- 0019_persona_name_aliases.sql already created this table with indexes.
-- This auto-generated migration is kept idempotent so the journal stays
-- intact and re-runs are safe.
CREATE TABLE IF NOT EXISTS `persona_name_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`personaName` varchar(255) NOT NULL,
	`gamePresenterId` int NOT NULL,
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `persona_name_aliases_id` PRIMARY KEY(`id`)
);
