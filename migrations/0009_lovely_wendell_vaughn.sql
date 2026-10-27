CREATE TABLE `announcement_reads` (
	`announcement_id` text NOT NULL,
	`student_id` text NOT NULL,
	`read_at` integer NOT NULL,
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `announcement_reads_unique` ON `announcement_reads` (`announcement_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`expires_on` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `announcements_class_idx` ON `announcements` (`class_id`);