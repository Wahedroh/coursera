CREATE TABLE `video_progress` (
	`video_id` text NOT NULL,
	`student_id` text NOT NULL,
	`percent` integer NOT NULL,
	`watched_seconds` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`first_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_progress_unique` ON `video_progress` (`video_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `video_progress_student_idx` ON `video_progress` (`student_id`);