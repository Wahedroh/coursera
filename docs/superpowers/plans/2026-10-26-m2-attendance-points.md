# M2 เช็กชื่อ + แต้ม/EXP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ครูเช็กชื่อรายวัน (มี QR ให้นักเรียนเช็กอินเอง), ส่งออก Excel, แจกแต้มผ่านผังที่นั่ง, สุ่มชื่อ/แบ่งกลุ่ม; นักเรียนเห็นเลเวล/EXP/ประวัติแต้ม เปิดไข่สุ่มตัวละคร และกระดานจัดอันดับ (ครูเปิด/ปิด)

**Architecture:** ต่อยอด M0/M1: โดเมน `src/server/attendance/`, `src/server/points/`; EXP = ผลรวม `point_events` (มีอยู่แล้วจาก M1); ไข่สร้างแบบ lazy ตามเลเวลที่ถึง; QR token = HMAC(SESSION_SECRET, dayId + ช่วงเวลา 30 วิ)

**Tech Stack:** เดิม + `qrcode-generator@2.0.4` (วาด QR ฝั่ง client)

**Spec:** `docs/superpowers/specs/2026-10-25-classroom-assistant-design.md` หัวข้อ 4, 5.3, 5.4

## Global Constraints

- ทุก Global Constraint ของ M0/M1 ยังใช้
- สถานะเช็กชื่อ: `present` มา / `late` สาย / `sick` ป่วย / `leave` ลา / `absent` ขาด; ค่าเริ่มต้นเมื่อเปิดวัน = `present`
- วันที่เป็นสตริง `YYYY-MM-DD` ตามเวลาไทย (Asia/Bangkok)
- EXP: มาเรียน/สาย **+2** ครั้งเดียวต่อวัน (`source='attendance'`, `refId=recordId`); เปลี่ยนเป็นป่วย/ลา/ขาด → ลบ EXP ของวันนั้นคืน
- แต้มมือ: delta ∈ {-5..+10} ยกเว้น 0, เหตุผล ≤ 100 ตัวอักษร
- เลเวล = `floor(EXP / 100)`; ได้ไข่ 1 ใบต่อเลเวลที่ถึง (เลเวล 1 ขึ้นไป); EXP ติดลบรวมไม่ทำให้ไข่ที่ได้แล้วหาย
- ความหายาก: ธรรมดา 60% / หายาก 25% / หายากมาก 12% / ตำนาน 3% สุ่มฝั่งเซิร์ฟเวอร์
- ตัวละคร 16 ตัว (ธรรมดา 8, หายาก 4, หายากมาก 3, ตำนาน 1) อยู่ใน `src/shared/characters.ts`
- กระดานจัดอันดับต่อห้อง ค่าเริ่มต้น **ปิด** (`settings.leaderboard_enabled`)
- QR token อายุ 30 วิ ยอมรับช่วงปัจจุบันและก่อนหน้า (รวม ≤ 60 วิ); เช็กอินได้เฉพาะเมื่อครูเปิด `selfCheckinOpen` และนักเรียนอยู่ห้องนั้น
- กฎ EXP เป็นค่าคงที่ใน `src/shared/points.ts` (ยังไม่มีหน้าแก้ในเฟสนี้)

## Review Focus

1. นักเรียนส่ง QR token เก่า/ของห้องอื่น/ตอนครูปิดเช็กอิน → 400 `invalid_checkin` และไม่เปลี่ยนสถานะ (Task 3)
2. ครูเปลี่ยนสถานะไปมา มา→ขาด→มา → EXP ของวันนั้นเหลือ +2 ครั้งเดียว (Task 2)
3. เปิดไข่ใบเดียวกันพร้อมกัน 2 คำขอ → ได้ตัวละครครั้งเดียว อีกคำขอ 409 `egg_already_opened` (Task 5)
4. ห้องที่มีนักเรียน >100 คน เปิดวันเช็กชื่อได้ (D1 100 ตัวแปร) (Task 2)
5. นักเรียนดูกระดานจัดอันดับตอนครูปิด → 403 `leaderboard_disabled` (Task 5)

---

### Task 1: Schema
**Files:** `src/server/db/schema.ts`, `migrations/0002_*.sql`; Test `tests/m2-schema.test.ts`
- `attendanceDays`: id, classId→classes, date text, selfCheckinOpen boolean default false, createdAt; unique(classId, date)
- `attendanceRecords`: id, dayId→attendanceDays, studentId→students, status enum, source enum `teacher|self`, updatedAt; unique(dayId, studentId)
- `seating`: classId pk→classes, layout JSON `{ cols: number; seats: (string|null)[] }`, updatedAt
- `eggs`: id, studentId→students, level integer, characterId text nullable, openedAt nullable, createdAt; unique(studentId, level)
- [ ] tests unique constraints → FAIL → implement + `npm run db:generate` → PASS → commit `feat: M2 schema`

### Task 2: เช็กชื่อ (ครู) + EXP
**Files:** `src/shared/attendance.ts`, `src/shared/points.ts`, `src/server/attendance/service.ts`, `src/server/attendance/teacher-routes.ts`; Test `tests/attendance.test.ts`
- `openDay(db, classId, date) → { day: { id, date, selfCheckinOpen }, records: { studentId, zipgradeId, title, firstName, lastName, status, source }[] }` — สร้างวัน + record `present` ให้นักเรียน active ที่ยังไม่มี record (insert เป็นชุดละ ≤ 10 แถว) และให้ EXP
- `setStatus(db, dayId, studentId, status, source)`; EXP sync ตาม Global Constraints
- `attendanceRange(db, classId, from, to) → { days: string[], students: [...], cells: Record<studentId, Record<date, status>>, totals: Record<studentId, Record<status, number>> }`
- Routes: `GET /api/teacher/classes/:id/attendance?date=` · `PUT /api/teacher/attendance/:dayId/records/:studentId {status}` · `GET /api/teacher/classes/:id/attendance-range?from=&to=`
- [ ] tests: `เปิดวันแล้วทุกคนเป็น present และได้ +2`; `เปิดวันซ้ำไม่สร้างซ้ำ`; `มา→ขาด→มา EXP เหลือ +2`; `ห้อง 120 คนเปิดวันได้`; `วันที่ผิดรูปแบบ 400`; `range นับสถานะถูก`; `นักเรียนเรียก 401` → commit `feat: teacher attendance with EXP`

### Task 3: QR เช็กอินเอง
**Files:** attendance service/routes, `src/server/attendance/student-routes.ts`, `src/server/auth/crypto.ts` (ใช้ `hmacSha256Hex`); Test `tests/checkin.test.ts`
- `checkinToken(secret, dayId, window: number): Promise<string>` (16 hex ตัวแรกของ HMAC); `window = floor(now / 30000)`
- `PUT /api/teacher/attendance/:dayId/self-checkin {open}` · `GET /api/teacher/attendance/:dayId/qr → { url, expiresAt }` (`url = /checkin?d=<dayId>&t=<token>`)
- `POST /api/student/checkin {dayId, token}` → `{ status: 'present', className, date }`; ครูตั้ง ป่วย/ลา/ขาด ไว้แล้ว → นักเรียนเช็กอินเปลี่ยนเป็น present ได้ (source self); token ผิด/หมดอายุ/ห้องอื่น/ปิดอยู่ → 400 `invalid_checkin` "QR หมดอายุหรือไม่ถูกต้อง ให้สแกนใหม่จากจอหน้าห้อง"
- [ ] tests ตาม Review Focus 1 + `เช็กอินสำเร็จได้ present source self` + `token ช่วงก่อนหน้ายังใช้ได้` → commit `feat: QR self check-in`

### Task 4: แต้มมือ + ผังที่นั่ง
**Files:** `src/server/points/service.ts`, `src/server/points/teacher-routes.ts`; Test `tests/points.test.ts`
- `POST /api/teacher/points {studentIds: string[] 1..60, delta, reason}` → แทรก point_events `source='manual'` (refId = null)
- `GET /api/teacher/classes/:id/points` → `{ studentId, exp, level }[]`
- `GET|PUT /api/teacher/classes/:id/seating` layout; GET ไม่มี → ผังเริ่มต้น `cols=6`, ที่นั่งเรียง sortOrder; PUT ตรวจว่า studentId ทุกตัวอยู่ห้องนั้น
- [ ] tests: `แจกแต้มหลายคน`; `delta 0/เกินช่วง 400`; `exp/level รวมถูก`; `ผังเริ่มต้น`; `บันทึกผังที่มีคนห้องอื่น 400` → commit `feat: manual points and seating`

### Task 5: ความคืบหน้านักเรียน ไข่ และกระดานจัดอันดับ
**Files:** `src/shared/characters.ts`, `src/server/points/student-routes.ts`, settings route; Test `tests/progress.test.ts`
- `GET /api/student/progress → { exp, level, nextLevelAt, eggs: { id, level, characterId, openedAt }[], history: { delta, reason, createdAt }[] (ล่าสุด 30) }` — สร้างไข่ที่ยังไม่มีสำหรับเลเวล 1..level
- `POST /api/student/eggs/:id/open → { characterId }` — `UPDATE … WHERE id=? AND student_id=? AND opened_at IS NULL`; ไม่ได้แถว → 409 `egg_already_opened`
- `rollCharacter(rand: () => number): string` ตามน้ำหนัก
- `PUT /api/teacher/settings/leaderboard {enabled}`; `GET /api/student/leaderboard` → top 10 ห้องตัวเอง `{ rank, firstName, exp, level, isMe }` หรือ 403
- [ ] tests: `progress รวม EXP/เลเวล และสร้างไข่ตามเลเวล`; `เปิดไข่ได้ตัวละครจากแคตตาล็อก`; `เปิดพร้อมกัน 409`; `rollCharacter ตามน้ำหนัก (seeded)`; `leaderboard ปิด 403 / เปิดแล้วเรียงถูก` → commit `feat: student progress, eggs and leaderboard`

### Task 6: หน้าเว็บครู
**Files:** `src/client/pages/TeacherAttendance.tsx`, `TeacherCheckinScreen.tsx`, `TeacherSeating.tsx`, `src/client/lib/excel.ts` (+`exportAttendance`), `src/client/components/PixelArt.tsx`; nav + ลิงก์จาก TeacherClass; `npm i -E qrcode-generator@2.0.4`
- เช็กชื่อ: เลือกวันที่ → รายชื่อพร้อมปุ่มสถานะ 5 ปุ่ม + ตัวเลขสรุป, สลับเปิด QR, ส่งออก Excel ช่วงวันที่
- จอ QR: QR ใหญ่ หมุนทุก 30 วิ + รายชื่อที่เช็กอินแล้วสด (poll ทุก 5 วิ)
- ผังห้อง: แตะนักเรียน → +1/+5/−1 + เหตุผลสำเร็จรูป; โหมดจัดที่นั่ง (แตะคน แล้วแตะที่ว่าง); สุ่มชื่อไม่ซ้ำ (sessionStorage); แบ่งกลุ่มตามจำนวนกลุ่ม; ปุ่มเปิด/ปิดกระดานจัดอันดับ
- [ ] typecheck/build + E2E Task 8 → commit `feat: teacher attendance, QR and seating pages`

### Task 7: หน้าเว็บนักเรียน
**Files:** `src/client/pages/StudentProgress.tsx`, `StudentCheckin.tsx`; StudentHome (+แถบเลเวลและลิงก์)
- `/me/progress`: เลเวล แถบ EXP ไข่รอเปิด (ปุ่มเปิดไข่) คอลเลกชัน 16 ช่อง ประวัติแต้ม กระดานจัดอันดับถ้าเปิด
- `/checkin?d=&t=`: ถ้ายังไม่ล็อกอิน → ส่งไปหน้าแรกพร้อม `next` แล้วกลับมา; เช็กอินแล้วแสดง "เช็กชื่อแล้ว ✓"
- [ ] typecheck/build + E2E → commit `feat: student progress and check-in pages`

### Task 8: E2E
- `ครูเปิดเช็กชื่อ → ตั้งคนหนึ่งเป็นขาด → เปิด QR → นักเรียนเปิด URL เช็กอิน → ครูเห็นเป็นมา; ครูแจก +5 จากผังห้อง; นักเรียนเห็น EXP เพิ่ม ประวัติแต้ม และเปิดไข่ได้` (ให้ EXP ถึง 100 ด้วยการแจกแต้มหลายครั้ง)
- [ ] ตรวจหน้าจอ 390px ไม่มี horizontal scroll → commit `test: M2 end-to-end flow`
