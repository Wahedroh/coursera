CREATE TABLE `assignment_closed` (
	`assignment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_closed_unique` ON `assignment_closed` (`assignment_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `assignment_closed_student_idx` ON `assignment_closed` (`student_id`);