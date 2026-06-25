CREATE TABLE `program_exercises_new` (
	`id` text PRIMARY KEY NOT NULL,
	`program_session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`alternative_exercise_ids` text,
	`order` integer NOT NULL,
	`target_sets_min` integer,
	`target_sets_max` integer,
	`target_reps_min` integer,
	`target_reps_max` integer,
	`target_weight_min` real,
	`target_weight_max` real,
	`target_rir_min` integer,
	`target_rir_max` integer,
	`target_rest_seconds` integer,
	`target_duration_seconds` integer,
	`tempo` integer,
	`selected_variation` text,
	FOREIGN KEY (`program_session_id`) REFERENCES `program_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `program_exercises_new` (`id`, `program_session_id`, `exercise_id`, `alternative_exercise_ids`, `order`, `target_duration_seconds`, `tempo`)
SELECT `id`, `program_session_id`, `exercise_id`, `alternative_exercise_ids`, `order`, `target_duration_seconds`, `tempo`
FROM `program_exercises`;
--> statement-breakpoint
DROP TABLE `program_exercises`;
--> statement-breakpoint
ALTER TABLE `program_exercises_new` RENAME TO `program_exercises`;
