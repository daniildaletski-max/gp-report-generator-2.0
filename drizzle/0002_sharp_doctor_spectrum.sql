CREATE TABLE `error_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`fileType` enum('playgon','mg') NOT NULL,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`fileUrl` text,
	`fileKey` varchar(512),
	`processedAt` timestamp,
	`uploadedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `error_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fm_teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamName` varchar(255) NOT NULL,
	`floorManagerName` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fm_teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `fm_teams_teamName_unique` UNIQUE(`teamName`)
);
--> statement-breakpoint
CREATE TABLE `gp_errors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`errorFileId` int NOT NULL,
	`gamePresenterId` int,
	`gpName` varchar(255) NOT NULL,
	`gpAlias` varchar(255),
	`errorDate` timestamp,
	`errorCode` varchar(50),
	`gameType` varchar(50),
	`tableId` varchar(100),
	`errorDescription` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gp_errors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gp_monthly_attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gamePresenterId` int NOT NULL,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`mistakes` int DEFAULT 0,
	`extraShifts` int DEFAULT 0,
	`lateToWork` int DEFAULT 0,
	`missedDays` int DEFAULT 0,
	`sickLeaves` int DEFAULT 0,
	`remarks` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gp_monthly_attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `reports` MODIFY COLUMN `reportMonth` int NOT NULL;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `appearanceScore` int;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `gamePerformanceTotalScore` int;--> statement-breakpoint
ALTER TABLE `game_presenters` ADD `teamId` int;--> statement-breakpoint
ALTER TABLE `reports` ADD `teamId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `game_presenters` DROP COLUMN `teamName`;--> statement-breakpoint
ALTER TABLE `reports` DROP COLUMN `teamName`;--> statement-breakpoint
ALTER TABLE `reports` DROP COLUMN `floorManagerName`;