ALTER TABLE `calendar_events` ADD COLUMN `ref_type` text;
--> statement-breakpoint
UPDATE `calendar_events`
SET `ref_type` = 'meso_session'
WHERE `ref_id` IS NOT NULL
  AND `ref_type` IS NULL
  AND EXISTS (SELECT 1 FROM `meso_sessions` WHERE `meso_sessions`.`id` = `calendar_events`.`ref_id`);
--> statement-breakpoint
UPDATE `calendar_events`
SET `ref_type` = 'program_session'
WHERE `ref_id` IS NOT NULL
  AND `ref_type` IS NULL
  AND EXISTS (SELECT 1 FROM `program_sessions` WHERE `program_sessions`.`id` = `calendar_events`.`ref_id`);
