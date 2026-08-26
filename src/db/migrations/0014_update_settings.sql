ALTER TABLE `user_settings` ADD COLUMN `update_check_enabled` integer NOT NULL DEFAULT 1;
ALTER TABLE `user_settings` ADD COLUMN `last_update_check_at` text;
ALTER TABLE `user_settings` ADD COLUMN `skipped_version` text;
