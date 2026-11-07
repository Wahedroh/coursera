ALTER TABLE `assignments` ADD `exp_reward` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
-- ปรับกติกา EXP ใหม่ย้อนหลังให้ทุกคนเท่ากัน: มาเรียน +2 → +5 · ส่งงาน +10/+5 → +30/+15
UPDATE `point_events` SET `delta` = 5 WHERE `source` = 'attendance';
--> statement-breakpoint
UPDATE `point_events` SET `delta` = CASE `delta` WHEN 10 THEN 30 WHEN 5 THEN 15 ELSE `delta` END WHERE `source` = 'assignment';
