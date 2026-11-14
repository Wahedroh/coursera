CREATE TABLE `timetable_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `timetable_class_idx` ON `timetable_slots` (`class_id`);--> statement-breakpoint
ALTER TABLE `announcements` ADD `published` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `announcements` ADD `publish_at` integer;--> statement-breakpoint
ALTER TABLE `assignments` ADD `publish_at` integer;--> statement-breakpoint
ALTER TABLE `materials` ADD `publish_at` integer;--> statement-breakpoint
ALTER TABLE `videos` ADD `publish_at` integer;