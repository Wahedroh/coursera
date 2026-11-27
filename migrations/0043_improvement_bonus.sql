ALTER TABLE `score_items` ADD `improvement_bonus` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `scores` ADD `bonus` real DEFAULT 0 NOT NULL;