CREATE TABLE `live_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`kind` text NOT NULL,
	`config` text NOT NULL,
	`show_results` integer DEFAULT false NOT NULL,
	`accepting` integer DEFAULT true NOT NULL,
	`opened_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `live_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`student_id` text NOT NULL,
	`answer` text NOT NULL,
	`correct` integer,
	`elapsed_ms` integer,
	`answered_at` integer NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `live_activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_responses_activity_student_unique` ON `live_responses` (`activity_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `live_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_activity_id` text,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
