CREATE TABLE `card_answers` (
	`game_id` text NOT NULL,
	`q_index` integer NOT NULL,
	`student_id` text NOT NULL,
	`answer` integer NOT NULL,
	`scanned_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `card_games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_answers_unique` ON `card_answers` (`game_id`,`q_index`,`student_id`);--> statement-breakpoint
CREATE INDEX `card_answers_student_idx` ON `card_answers` (`student_id`);--> statement-breakpoint
CREATE TABLE `card_games` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`class_id` text NOT NULL,
	`questions` text NOT NULL,
	`current` integer DEFAULT 0 NOT NULL,
	`revealed` integer DEFAULT false NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `card_quizzes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_games_class_idx` ON `card_games` (`class_id`);--> statement-breakpoint
CREATE TABLE `card_quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`questions` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
