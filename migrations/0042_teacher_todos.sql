CREATE TABLE `teacher_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`class_id` text,
	`done_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `teacher_todos_date_idx` ON `teacher_todos` (`date`);