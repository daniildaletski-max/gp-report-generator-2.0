CREATE TABLE `action_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`gamePresenterId` int NOT NULL,
	`createdById` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`category` enum('appearance','performance','attitude','attendance','errors','general') NOT NULL DEFAULT 'general',
	`status` enum('open','in_progress','done','cancelled') NOT NULL DEFAULT 'open',
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`source` enum('manual','ai_insight') NOT NULL DEFAULT 'manual',
	`dueDate` timestamp,
	`completedAt` timestamp,
	`completionNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `action_items_id` PRIMARY KEY(`id`)
);
