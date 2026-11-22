-- เกมการ์ดไม่ใช่ข้อสอบ: ไม่เปิดสอบย้อนหลัง
UPDATE `score_items` SET `makeup_days` = 0 WHERE `id` IN (SELECT `score_item_id` FROM `card_games` WHERE `score_item_id` IS NOT NULL);
--> statement-breakpoint
-- คืนสถานะ "ขาดสอบ" ให้คะแนนเกมการ์ดที่ระบบเพิ่งให้ 0 อัตโนมัติ
UPDATE `scores` SET `score` = NULL, `absent` = 1, `note` = '' WHERE `note` = 'หมดสิทธิ์สอบย้อนหลัง' AND `item_id` IN (SELECT `score_item_id` FROM `card_games` WHERE `score_item_id` IS NOT NULL);
--> statement-breakpoint
DELETE FROM `makeup_events` WHERE `exam_id` IN (SELECT `id` FROM `makeup_exams` WHERE `score_item_id` IN (SELECT `score_item_id` FROM `card_games` WHERE `score_item_id` IS NOT NULL));
--> statement-breakpoint
DELETE FROM `makeup_exams` WHERE `score_item_id` IN (SELECT `score_item_id` FROM `card_games` WHERE `score_item_id` IS NOT NULL);
