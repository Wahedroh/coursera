CREATE TABLE `makeup_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`closure_id` text,
	`class_id` text NOT NULL,
	`date` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`periods` integer,
	`mode` text NOT NULL,
	`meet_url` text,
	`announcement_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`closure_id`) REFERENCES `school_closures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `makeup_classes_date_idx` ON `makeup_classes` (`date`);--> statement-breakpoint
CREATE INDEX `makeup_classes_closure_idx` ON `makeup_classes` (`closure_id`);--> statement-breakpoint
ALTER TABLE `school_closures` ADD `makeup_needed` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `timetable_slots` ADD `valid_from` text;--> statement-breakpoint
ALTER TABLE `timetable_slots` ADD `valid_to` text;--> statement-breakpoint
-- คาบที่มีอยู่แล้วเริ่มใช้ตั้งแต่วันเปิดเทอม 2/2569
UPDATE `timetable_slots` SET `valid_from` = '2026-11-01' WHERE `valid_from` IS NULL;--> statement-breakpoint
UPDATE `school_closures` SET `makeup_needed` = 0 WHERE `reason` = 'holiday';
