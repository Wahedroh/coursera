CREATE TABLE `storage_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`files` integer DEFAULT 0 NOT NULL,
	`synced_at` integer
);
--> statement-breakpoint
CREATE TABLE `stored_files` (
	`key` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `submissions` ADD `images_purged_at` integer;