ALTER TABLE `attitude_screenshots` ADD `evaluationId` int;--> statement-breakpoint
ALTER TABLE `attitude_screenshots` ADD `attitudeType` enum('positive','negative','neutral') DEFAULT 'neutral';--> statement-breakpoint
ALTER TABLE `attitude_screenshots` ADD `comment` text;--> statement-breakpoint
ALTER TABLE `error_screenshots` ADD `evaluationId` int;