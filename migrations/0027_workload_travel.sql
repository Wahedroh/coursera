CREATE TABLE `school_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`reason` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`announcement_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `school_closures_dates_idx` ON `school_closures` (`from_date`,`to_date`);--> statement-breakpoint
CREATE TABLE `teacher_appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`start` text NOT NULL,
	`title` text NOT NULL,
	`map_url` text,
	`lat` real,
	`lng` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `teacher_appointments_date_idx` ON `teacher_appointments` (`date`);--> statement-breakpoint
ALTER TABLE `classes` ADD `weekly_periods` integer;--> statement-breakpoint
ALTER TABLE `schools` ADD `map_url` text;--> statement-breakpoint
ALTER TABLE `schools` ADD `lat` real;--> statement-breakpoint
ALTER TABLE `schools` ADD `lng` real;--> statement-breakpoint
ALTER TABLE `timetable_slots` ADD `periods` integer;--> statement-breakpoint
-- เป้าคาบต่อสัปดาห์เริ่มต้นตามที่ครูแจ้ง (แก้ได้ในหน้า "ภาระสอน & เดินทาง")
UPDATE `classes` SET `weekly_periods` = 3 WHERE `school_id` IN (SELECT `id` FROM `schools` WHERE `name` LIKE '%บำรุงอิสลาม%');--> statement-breakpoint
UPDATE `classes` SET `weekly_periods` = 4 WHERE `grade` IN (2, 4) AND `school_id` IN (SELECT `id` FROM `schools` WHERE `name` LIKE '%ประสาน%');--> statement-breakpoint
UPDATE `classes` SET `weekly_periods` = 4 WHERE `grade` IN (4, 5) AND `school_id` IN (SELECT `id` FROM `schools` WHERE `name` LIKE '%บาเจาะ%');--> statement-breakpoint
UPDATE `classes` SET `weekly_periods` = 4 WHERE `grade` = 5 AND `school_id` IN (SELECT `id` FROM `schools` WHERE `name` LIKE '%ดรุณ%');--> statement-breakpoint
UPDATE `classes` SET `weekly_periods` = 3 WHERE `grade` = 1 AND `school_id` IN (SELECT `id` FROM `schools` WHERE `name` LIKE '%ดรุณ%');--> statement-breakpoint
UPDATE `classes` SET `weekly_periods` = 3 WHERE `grade` IN (2, 4, 5) AND `school_id` IN (SELECT `id` FROM `schools` WHERE `name` LIKE '%ประทีป%');--> statement-breakpoint
UPDATE `classes` SET `weekly_periods` = 4 WHERE `school_id` IN (SELECT `id` FROM `schools` WHERE `name` LIKE '%ดารุลฟุรกอน%');--> statement-breakpoint
UPDATE `classes` SET `weekly_periods` = 4 WHERE `school_id` IN (SELECT `id` FROM `schools` WHERE `name` LIKE '%คัมภีร์%');
