CREATE TABLE `student_avatars` (
	`student_id` text PRIMARY KEY NOT NULL,
	`nickname` text DEFAULT '' NOT NULL,
	`config` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
