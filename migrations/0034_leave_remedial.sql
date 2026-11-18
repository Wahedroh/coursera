CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`class_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`image_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`teacher_note` text DEFAULT '' NOT NULL,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leave_requests_student_idx` ON `leave_requests` (`student_id`);--> statement-breakpoint
CREATE INDEX `leave_requests_class_idx` ON `leave_requests` (`class_id`,`status`);--> statement-breakpoint
CREATE TABLE `remedials` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`student_id` text NOT NULL,
	`reason` text NOT NULL,
	`title` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`due_at` integer,
	`status` text DEFAULT 'assigned' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`image_keys` text DEFAULT '[]' NOT NULL,
	`submitted_at` integer,
	`comment` text DEFAULT '' NOT NULL,
	`result_grade` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `remedials_class_idx` ON `remedials` (`class_id`);--> statement-breakpoint
CREATE INDEX `remedials_student_idx` ON `remedials` (`student_id`);