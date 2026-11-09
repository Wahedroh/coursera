CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`season` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terms_name_unique` ON `terms` (`name`);--> statement-breakpoint
DROP INDEX `eggs_student_level_unique`;--> statement-breakpoint
ALTER TABLE `eggs` ADD `term_id` text DEFAULT 'term-1' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `eggs_student_term_level_unique` ON `eggs` (`student_id`,`term_id`,`level`);--> statement-breakpoint
ALTER TABLE `videos` ADD `questions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- เทอมแรก (ครอบคลุมข้อมูลเดิมทั้งหมด) · ซีซัน 1
INSERT INTO `terms` (`id`, `name`, `started_at`, `season`, `created_at`) VALUES ('term-1', '1/2569', 0, 1, 0);
