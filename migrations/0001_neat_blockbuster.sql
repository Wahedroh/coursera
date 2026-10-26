CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`attachment_keys` text DEFAULT '[]' NOT NULL,
	`due_at` integer,
	`max_score` real NOT NULL,
	`submit_mode` text NOT NULL,
	`published` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `point_events` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`source` text NOT NULL,
	`ref_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `point_events_source_ref_unique` ON `point_events` (`source`,`ref_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`image_keys` text DEFAULT '[]' NOT NULL,
	`annotated_keys` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`score` real,
	`comment` text DEFAULT '' NOT NULL,
	`graded_at` integer,
	`client_request_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_assignment_student_unique` ON `submissions` (`assignment_id`,`student_id`);