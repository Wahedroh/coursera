ALTER TABLE `schools` ADD `nav_lead_minutes` integer DEFAULT 60;--> statement-breakpoint
-- ตามที่ครูกำหนด: ประทีป 30 นาที · ดารุล 1 ชม.ครึ่ง · ที่เหลือ 1 ชม. (ค่าเริ่มต้น)
UPDATE `schools` SET `nav_lead_minutes` = 30 WHERE `name` LIKE '%ประทีป%';--> statement-breakpoint
UPDATE `schools` SET `nav_lead_minutes` = 90 WHERE `name` LIKE '%ดารุล%';
