CREATE INDEX `assignments_class_idx` ON `assignments` (`class_id`);--> statement-breakpoint
CREATE INDEX `attendance_records_student_idx` ON `attendance_records` (`student_id`);--> statement-breakpoint
CREATE INDEX `fee_charges_student_idx` ON `fee_charges` (`student_id`);--> statement-breakpoint
CREATE INDEX `point_events_student_idx` ON `point_events` (`student_id`);--> statement-breakpoint
CREATE INDEX `score_items_class_idx` ON `score_items` (`class_id`);--> statement-breakpoint
CREATE INDEX `scores_student_idx` ON `scores` (`student_id`);--> statement-breakpoint
CREATE INDEX `sessions_student_idx` ON `sessions` (`student_id`);--> statement-breakpoint
CREATE INDEX `students_class_idx` ON `students` (`class_id`);--> statement-breakpoint
CREATE INDEX `submissions_student_idx` ON `submissions` (`student_id`);--> statement-breakpoint
CREATE INDEX `videos_class_idx` ON `videos` (`class_id`);