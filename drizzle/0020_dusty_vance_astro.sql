CREATE TABLE `persona_name_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`personaName` varchar(255) NOT NULL,
	`gamePresenterId` int NOT NULL,
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `persona_name_aliases_id` PRIMARY KEY(`id`)
);
