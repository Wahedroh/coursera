CREATE TABLE `makeup_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `makeup_exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `makeup_photos_exam_idx` ON `makeup_photos` (`exam_id`);--> statement-breakpoint
ALTER TABLE `makeup_exams` ADD `proctor` integer DEFAULT false NOT NULL;