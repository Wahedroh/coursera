CREATE TABLE `teacher_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '/teacher' NOT NULL,
	`dedupe_key` text,
	`count` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`pushed_at` integer,
	`shown_at` integer,
	`read_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_notifications_dedupe_key_unique` ON `teacher_notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `teacher_notifications_created_idx` ON `teacher_notifications` (`created_at`);--> statement-breakpoint
CREATE TABLE `teacher_push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_push_subscriptions_endpoint_unique` ON `teacher_push_subscriptions` (`endpoint`);