ALTER TABLE `workout_sessions` ADD COLUMN `meso_session_id` text REFERENCES `meso_sessions`(`id`);
--> statement-breakpoint
ALTER TABLE `exercise_logs` ADD COLUMN `meso_exercise_id` text REFERENCES `meso_exercises`(`id`);
--> statement-breakpoint
ALTER TABLE `exercise_logs` ADD COLUMN `superset_group_id` text;
--> statement-breakpoint
ALTER TABLE `exercise_logs` ADD COLUMN `is_done` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `set_logs` ADD COLUMN `execution_seconds` integer;
--> statement-breakpoint
ALTER TABLE `set_logs` ADD COLUMN `set_number` integer;
--> statement-breakpoint
ALTER TABLE `set_logs` ADD COLUMN `side` text;
--> statement-breakpoint
ALTER TABLE `program_exercises` ADD COLUMN `superset_group_id` text;
--> statement-breakpoint
ALTER TABLE `meso_exercises` ADD COLUMN `superset_group_id` text;
--> statement-breakpoint
ALTER TABLE `exercises` ADD COLUMN `weight_unit` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rest_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`seconds` integer NOT NULL,
	`sort_order` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_settings` (
	`id` text PRIMARY KEY NOT NULL DEFAULT 'singleton',
	`weight_unit` text NOT NULL DEFAULT 'kg'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `rest_presets` (`id`, `seconds`, `sort_order`) VALUES
	('preset_60', 60, 0),
	('preset_90', 90, 1),
	('preset_120', 120, 2),
	('preset_150', 150, 3),
	('preset_180', 180, 4),
	('preset_240', 240, 5);
--> statement-breakpoint
INSERT OR IGNORE INTO `user_settings` (`id`, `weight_unit`) VALUES ('singleton', 'kg');
