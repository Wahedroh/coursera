CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`size` integer NOT NULL,
	`published` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `materials_class_idx` ON `materials` (`class_id`);