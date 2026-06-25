CREATE TABLE `mesocycles` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text,
	`name` text NOT NULL,
	`num_weeks` integer NOT NULL,
	`start_date` text,
	`notes` text,
	`created_at` text,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `meso_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`mesocycle_id` text NOT NULL,
	`program_session_id` text,
	`week_index` integer NOT NULL,
	`order` integer NOT NULL,
	`title` text,
	`note` text,
	`day` text,
	`color` text DEFAULT '#007AFF' NOT NULL,
	FOREIGN KEY (`mesocycle_id`) REFERENCES `mesocycles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_session_id`) REFERENCES `program_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `meso_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`meso_session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`alternative_exercise_ids` text,
	`order` integer NOT NULL,
	`selected_variation` text,
	FOREIGN KEY (`meso_session_id`) REFERENCES `meso_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meso_sets` (
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
	`tempo` integer,
	FOREIGN KEY (`meso_exercise_id`) REFERENCES `meso_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
