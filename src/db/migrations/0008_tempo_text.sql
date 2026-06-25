CREATE TABLE `meso_sets_new` (
	`id` text PRIMARY KEY NOT NULL,
	`meso_exercise_id` text NOT NULL,
	`set_number` integer NOT NULL,
	`target_reps_min` integer,
	`target_reps_max` integer,
	`target_weight_min` real,
	`target_weight_max` real,
	`target_rir_min` integer,
	`target_rir_max` integer,
	`target_rest_seconds` integer,
	`target_duration_seconds` integer,
	`tempo` text,
	FOREIGN KEY (`meso_exercise_id`) REFERENCES `meso_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `meso_sets_new` (`id`, `meso_exercise_id`, `set_number`, `target_reps_min`, `target_reps_max`, `target_weight_min`, `target_weight_max`, `target_rir_min`, `target_rir_max`, `target_rest_seconds`, `target_duration_seconds`, `tempo`)
SELECT `id`, `meso_exercise_id`, `set_number`, `target_reps_min`, `target_reps_max`, `target_weight_min`, `target_weight_max`, `target_rir_min`, `target_rir_max`, `target_rest_seconds`, `target_duration_seconds`, CAST(`tempo` AS TEXT)
FROM `meso_sets`;
--> statement-breakpoint
DROP TABLE `meso_sets`;
--> statement-breakpoint
ALTER TABLE `meso_sets_new` RENAME TO `meso_sets`;
