CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'workout_session' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`date` text,
	`week` text,
	`ref_id` text
);
--> statement-breakpoint
CREATE TABLE `exercise_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`program_exercise_id` text,
	`order` integer NOT NULL,
	`time` text NOT NULL,
	`note` text,
	FOREIGN KEY (`workout_session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_exercise_id`) REFERENCES `program_exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`primary_muscles` text NOT NULL,
	`secondary_muscles` text,
	`description` text,
	`measurement_type` text DEFAULT 'reps' NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `program_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`program_session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`alternative_exercise_ids` text,
	`order` integer NOT NULL,
	`target_sets` integer,
	`target_reps` integer,
	`target_weight` real,
	`target_duration_seconds` integer,
	`tempo` integer,
	FOREIGN KEY (`program_session_id`) REFERENCES `program_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `program_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`name` text NOT NULL,
	`order` integer NOT NULL,
	`color` text NOT NULL,
	`day` text,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `set_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_log_id` text NOT NULL,
	`weight` real,
	`pdc` integer,
	`reps` integer,
	`duration_seconds` integer,
	`rest_seconds` integer,
	`partial_reps` integer,
	`rir` integer,
	FOREIGN KEY (`exercise_log_id`) REFERENCES `exercise_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_event_id` text NOT NULL,
	`program_session_id` text,
	`date` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`calendar_event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_session_id`) REFERENCES `program_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
