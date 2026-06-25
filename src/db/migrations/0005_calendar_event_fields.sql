ALTER TABLE `calendar_events` ADD COLUMN `title` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `calendar_events` ADD COLUMN `description` text;
