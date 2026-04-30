CREATE TABLE `persona_sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`triggeredById` int,
	`source` enum('manual','scheduled') NOT NULL DEFAULT 'manual',
	`month` int NOT NULL,
	`year` int NOT NULL,
	`status` enum('success','partial','failed') NOT NULL,
	`totalWorkers` int NOT NULL DEFAULT 0,
	`matched` int NOT NULL DEFAULT 0,
	`unmatched` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `persona_sync_logs_id` PRIMARY KEY(`id`)
);
