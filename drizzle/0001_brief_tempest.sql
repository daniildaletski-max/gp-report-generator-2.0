CREATE TABLE `evaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gamePresenterId` int NOT NULL,
	`evaluatorName` varchar(255),
	`evaluationDate` timestamp,
	`game` varchar(100),
	`totalScore` int,
	`hairScore` int,
	`hairMaxScore` int DEFAULT 3,
	`hairComment` text,
	`makeupScore` int,
	`makeupMaxScore` int DEFAULT 3,
	`makeupComment` text,
	`outfitScore` int,
	`outfitMaxScore` int DEFAULT 3,
	`outfitComment` text,
	`postureScore` int,
	`postureMaxScore` int DEFAULT 3,
	`postureComment` text,
	`dealingStyleScore` int,
	`dealingStyleMaxScore` int DEFAULT 5,
	`dealingStyleComment` text,
	`gamePerformanceScore` int,
	`gamePerformanceMaxScore` int DEFAULT 5,
	`gamePerformanceComment` text,
	`screenshotUrl` text,
	`screenshotKey` varchar(512),
	`rawExtractedData` json,
	`uploadedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `evaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `game_presenters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`teamName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_presenters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamName` varchar(255) NOT NULL,
	`floorManagerName` varchar(255),
	`reportMonth` varchar(20) NOT NULL,
	`reportYear` int NOT NULL,
	`fmPerformance` text,
	`goalsThisMonth` text,
	`teamOverview` text,
	`additionalComments` text,
	`reportData` json,
	`excelFileUrl` text,
	`excelFileKey` varchar(512),
	`status` enum('draft','generated','finalized') NOT NULL DEFAULT 'draft',
	`generatedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `upload_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadedById` int NOT NULL,
	`totalFiles` int DEFAULT 0,
	`processedFiles` int DEFAULT 0,
	`failedFiles` int DEFAULT 0,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `upload_batches_id` PRIMARY KEY(`id`)
);
