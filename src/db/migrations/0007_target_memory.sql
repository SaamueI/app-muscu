CREATE TABLE `target_memory` (
	`program_session_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`program_session_id`) REFERENCES `program_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
