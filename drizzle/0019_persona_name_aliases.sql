CREATE TABLE `persona_name_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`personaName` varchar(255) NOT NULL,
	`gamePresenterId` int NOT NULL,
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `persona_name_aliases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `persona_name_aliases_team_idx` ON `persona_name_aliases` (`teamId`);--> statement-breakpoint
CREATE UNIQUE INDEX `persona_name_aliases_team_name_unique` ON `persona_name_aliases` (`teamId`,`personaName`);
