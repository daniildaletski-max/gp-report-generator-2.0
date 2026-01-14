CREATE TABLE `monthly_gp_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gamePresenterId` int NOT NULL,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`attitude` int,
	`mistakes` int DEFAULT 0,
	`notes` text,
	`updatedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_gp_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `teamId` int;