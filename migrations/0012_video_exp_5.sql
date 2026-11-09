-- ทบทวนคลิปเปลี่ยนจาก +3 เป็น +5 EXP: ปรับที่ได้ไปแล้วให้เท่ากัน
UPDATE `point_events` SET `delta` = 5 WHERE `source` = 'video';
