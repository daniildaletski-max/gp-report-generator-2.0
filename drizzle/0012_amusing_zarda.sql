ALTER TABLE `fm_teams` DROP INDEX `fm_teams_teamName_unique`;--> statement-breakpoint
ALTER TABLE `fm_teams` ADD `userId` int;