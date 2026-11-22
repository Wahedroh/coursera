CREATE TABLE `exam_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`questions` text DEFAULT '[]' NOT NULL,
	`page_keys` text DEFAULT '[]' NOT NULL,
	`answers` text DEFAULT '[]' NOT NULL,
	`choice_count` integer DEFAULT 4 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `makeup_events` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`ms` integer,
	FOREIGN KEY (`exam_id`) REFERENCES `makeup_exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `makeup_events_exam_idx` ON `makeup_events` (`exam_id`);--> statement-breakpoint
CREATE TABLE `makeup_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`score_item_id` text NOT NULL,
	`student_id` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`image_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`mode` text,
	`opens_at` integer,
	`closes_at` integer,
	`duration_min` integer,
	`cap_pct` integer DEFAULT 100 NOT NULL,
	`exam_set_id` text,
	`code` text,
	`seed` integer,
	`device_id` text,
	`started_at` integer,
	`submitted_at` integer,
	`answers` text DEFAULT '[]' NOT NULL,
	`leaves` integer DEFAULT 0 NOT NULL,
	`auto_score` real,
	`final_score` real,
	`teacher_note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`score_item_id`) REFERENCES `score_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exam_set_id`) REFERENCES `exam_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `makeup_exams_student_idx` ON `makeup_exams` (`student_id`);--> statement-breakpoint
CREATE INDEX `makeup_exams_item_idx` ON `makeup_exams` (`score_item_id`);--> statement-breakpoint
CREATE INDEX `makeup_exams_status_idx` ON `makeup_exams` (`status`);--> statement-breakpoint
ALTER TABLE `score_items` ADD `makeup_days` integer DEFAULT 14 NOT NULL;