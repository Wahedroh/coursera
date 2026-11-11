CREATE TABLE `student_notes` (
	`student_id` text NOT NULL,
	`term_id` text NOT NULL,
	`note` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_notes_unique` ON `student_notes` (`student_id`,`term_id`);