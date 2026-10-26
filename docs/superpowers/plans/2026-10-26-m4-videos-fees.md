# M4 คลิปย้อนหลัง + ค่าเอกสารเรียน Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ครูวางลิงก์ YouTube ให้นักเรียนดูในเว็บเท่านั้น (คลิกออก/แชร์ไม่ได้) และบันทึกค่าเอกสารที่นักเรียนบางคนค้างจ่าย

**Architecture:** 2 โดเมนใหม่ตามแบบ scores: `src/server/videos/`, `src/server/fees/` (service + teacher-routes + student-routes), ฟังก์ชันล้วนใน `src/shared/videos.ts`, `src/shared/fees.ts`. ฝั่ง client: ตัวเล่น `ProtectedYouTube` ใช้ YouTube IFrame API (`controls=0`, youtube-nocookie) + ชั้นโปร่งใสทับ + ปุ่มควบคุมของเราเอง

**Tech Stack:** Hono, Drizzle/D1, zod 4, React 19, write-excel-file, vitest + Playwright

**Spec:** `docs/superpowers/specs/2026-10-25-classroom-assistant-design.md` §4 (`videos`, `fee_items`, `fee_charges`), §5.6, §5.7

## Global Constraints
- นักเรียนเห็นเฉพาะคลิปที่ `published` ของห้องตัวเอง และเฉพาะค่าเอกสารของตัวเอง
- หน้าเว็บนักเรียนไม่มีลิงก์ไป youtube.com; ไม่ใช้ปุ่ม/โลโก้/ชื่อคลิปของ YouTube
- เงิน: 0 < ราคา ≤ 100000, ทศนิยม ≤ 2; 0 ≤ จ่ายแล้ว ≤ ยอดที่ต้องจ่าย
- D1 ≤ 100 ตัวแปรต่อคำสั่ง (insert ทีละ 10 แถว)

## Review Focus
1. ลิงก์ YouTube หลายรูปแบบ (มี `&t=`, `si=`, shorts, youtu.be, m.youtube) และลิงก์ที่ไม่ใช่ YouTube → แปลงถูก/ปฏิเสธ 400
2. นักเรียนห้องอื่นหรือคลิปที่ซ่อน → 404 ไม่รั่ว youtube_id
3. ลดยอดต้องจ่ายต่ำกว่ายอดที่จ่ายแล้ว → 400
4. "เลือกทั้งห้อง" กับห้อง 40+ คน → ไม่ชน 100 ตัวแปร, ไม่สร้างซ้ำคนที่มีอยู่แล้ว
5. โหลด YouTube API ไม่ได้ → แสดงข้อความ ไม่ค้างหน้าขาว

---

### Task 1: shared + schema
- `parseYouTubeId(input): string | null`, `videoInputSchema`, `createVideosSchema`
- `feeItemInputSchema`, `chargeInputSchema` (refine paid ≤ amount), `moneyOk`
- tables + migration 0004

### Task 2: videos API + tests
- Teacher: POST `/videos {classIds,…}`, GET `/classes/:id/videos`, PUT `/videos/:id`, DELETE `/videos/:id`
- Student: GET `/api/student/videos`, GET `/api/student/videos/:id`

### Task 3: fees API + tests
- Teacher: POST `/fee-items`, GET `/classes/:id/fee-items` (สรุป), GET/PUT/DELETE `/fee-items/:id`, PUT/DELETE `/fee-items/:id/charges/:studentId`, POST `/fee-items/:id/charges/bulk {studentIds}`
- Student: GET `/api/student/fees`

### Task 4: client
TeacherVideos, StudentVideos, StudentVideo + `ProtectedYouTube`, TeacherFees, TeacherFeeItem, StudentFees, ลิงก์ในหน้าห้อง/หน้าแรก, แถบยอดค้างที่หน้าแรกนักเรียน, Excel ค่าเอกสาร

### Task 5: E2E `tests/e2e/m4.spec.ts`
ครูเพิ่มคลิป → นักเรียนเห็นในรายการ, หน้าเล่นไม่มีลิงก์ youtube.com; ครูสร้างค่าเอกสาร → เลือก 1 คน → จ่ายบางส่วน → นักเรียนเห็นยอดค้าง
