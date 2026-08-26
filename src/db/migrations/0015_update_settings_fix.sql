ALTER TABLE `user_settings` ADD COLUMN `last_update_check_at` text;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `skipped_version` text;
