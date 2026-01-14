CREATE TABLE `gp_access_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gamePresenterId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastAccessedAt` timestamp,
	CONSTRAINT `gp_access_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `gp_access_tokens_token_unique` UNIQUE(`token`)
);
