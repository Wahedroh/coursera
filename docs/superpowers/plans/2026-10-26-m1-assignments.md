# M1 งาน (มอบหมาย / ส่ง / ทวง / ตรวจ) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ครูสร้างงานให้หลายห้อง, นักเรียนส่งข้อความ/รูป, ครูเห็นตารางทวงงาน, ตรวจพร้อมเขียนทับรูป ให้คะแนน/ส่งกลับแก้, นักเรียนได้ EXP อัตโนมัติ และส่งออกสมุดคะแนนเป็น Excel

**Architecture:** ต่อยอด M0: service ต่อโดเมน (`src/server/assignments/`, `src/server/files/`) ที่รับ `db`/`bucket` และ route บาง ๆ; รูปเก็บใน R2 เสิร์ฟผ่าน Worker หลังตรวจสิทธิ์; ฝั่ง client ย่อรูปด้วย canvas ก่อนอัปโหลด และวาดทับรูปด้วย canvas แล้วอัปโหลดเป็นไฟล์ใหม่

**Tech Stack:** เดิมจาก M0 + R2 binding `BUCKET` + `write-excel-file@4.1.1` (สร้าง .xlsx ในเบราว์เซอร์)

**Spec:** `docs/superpowers/specs/2026-10-25-classroom-assistant-design.md` (หัวข้อ 4 ตาราง assignments/submissions/point_events, 5.2, 7)

## Global Constraints

- ทุก Global Constraint ของ M0 ยังใช้ (ภาษาไทย, รูปแบบ error กลาง, ULID, epoch ms, ห้าม commit ข้อมูลจริง, D1 ≤ 100 ตัวแปรต่อคำสั่ง)
- สถานะงานของนักเรียน: `missing` (ไม่มี submission) / `submitted` / `late` / `graded` / `returned`
- ส่งหลัง `due_at` → `late`; ส่งได้เสมอแม้เลยกำหนด
- นักเรียนแก้ submission ได้จนกว่าจะ `graded`; หลัง `returned` ส่งใหม่ได้ (สถานะกลับเป็น `submitted`/`late` ตามเวลา)
- รูป: รับ `image/jpeg|png|webp`, ≤ 5MB ต่อรูป (ตรวจที่เซิร์ฟเวอร์), ≤ 10 รูปต่อการส่ง; client ย่อด้านยาวสุด 1600px JPEG คุณภาพ 0.8
- EXP เมื่อ `graded` ครั้งแรก: ตรงเวลา **+10**, สาย **+5**; ไม่ซ้ำ (unique `source`+`ref_id`)
- ทุกคำขอส่งงานมี `clientRequestId` → idempotent
- กำหนดส่งตัดสินด้วยเวลาเซิร์ฟเวอร์
- R2 key: งานของนักเรียน `sub/<studentId>/<ulid>.<ext>`, รูปประกอบงาน `asg/<ulid>.<ext>`, รูปที่ครูเขียนทับ `ann/<submissionId>/<ulid>.png`

## Review Focus

1. นักเรียนส่ง `imageKeys` ของคนอื่น (เดา key) → 400 `invalid_image`; ห้ามแนบไฟล์ที่ไม่ได้ขึ้นต้นด้วย `sub/<ตัวเอง>/` (Task 5)
2. นักเรียนขอรูปของเพื่อนผ่าน `/api/files/...` → 404 (ไม่บอกว่ามีอยู่) (Task 2)
3. ครูให้คะแนนเกินคะแนนเต็ม/ติดลบ → 400 `invalid_score` (Task 7)
4. ให้คะแนนซ้ำ/แก้คะแนนหลังตรวจแล้ว → EXP ไม่เพิ่มซ้ำ (Task 7)
5. นักเรียนที่ย้ายห้องหลังมีงานแล้ว → เห็นเฉพาะงานของห้องปัจจุบัน และ submission เดิมยังอยู่ในตารางครูของห้องเดิมไม่ได้ทำให้พัง (Task 4, 6)

---

## File Structure

```
migrations/0001_*.sql                    drizzle-kit generate
src/server/db/schema.ts                  + assignments, submissions, pointEvents
src/server/files/service.ts              putImage / getObject / canRead
src/server/files/routes.ts               POST /api/files, GET /api/files/*
src/server/assignments/service.ts        createAssignments, listForClass, updateAssignment, deleteAssignment,
                                         listForStudent, getForStudent, upsertSubmission,
                                         gradebook, getSubmission, gradeSubmission, returnSubmission
src/server/assignments/teacher-routes.ts /api/teacher/assignments*, /api/teacher/classes/:id/gradebook, /api/teacher/submissions/*
src/server/assignments/student-routes.ts /api/student/assignments*
src/shared/assignments.ts                 types + zod schemas + statusOf()
src/client/lib/image.ts                   resizeImage(file) → Blob
src/client/lib/upload.ts                  uploadImage(blob) → key
src/client/lib/excel.ts                   exportGradebook(data)
src/client/pages/StudentAssignments.tsx   รายการงาน (แท็บ) — แทนกล่อง "เร็ว ๆ นี้" ใน StudentHome
src/client/pages/StudentSubmit.tsx        หน้าส่งงาน / ดูผลตรวจ
src/client/pages/TeacherAssignments.tsx   สร้าง/แก้งาน + รายการงานต่อห้อง
src/client/pages/TeacherGradebook.tsx     ตารางทวงงาน + คัดลอกรายชื่อ + Excel
src/client/pages/TeacherGrade.tsx         ตรวจทีละคน + AnnotateCanvas
src/client/components/AnnotateCanvas.tsx  วาดทับรูป
tests/files.test.ts, tests/assignments-*.test.ts, tests/e2e/m1.spec.ts
```

---

### Task 1: Schema + R2 binding

**Files:** Modify `src/server/db/schema.ts`, `src/server/env.ts`, `wrangler.jsonc`; Create `migrations/0001_*.sql`; Test `tests/assignments-schema.test.ts`

**Interfaces — Produces:**
- `assignments`: `id`, `classId`→classes, `title` notNull, `instructions` notNull default `''`, `attachmentKeys` text JSON notNull default `'[]'`, `dueAt` integer nullable, `maxScore` real notNull, `submitMode` text enum `text|image|both` notNull, `published` boolean default true, `createdAt`, `updatedAt`
- `submissions`: `id`, `assignmentId`→assignments, `studentId`→students, unique(`assignmentId`,`studentId`), `text` notNull default `''`, `imageKeys` JSON notNull default `'[]'`, `annotatedKeys` JSON notNull default `'[]'`, `status` enum `submitted|late|graded|returned` notNull, `submittedAt` integer notNull, `score` real nullable, `comment` notNull default `''`, `gradedAt` nullable, `clientRequestId` text nullable, `updatedAt`
- `pointEvents`: `id`, `studentId`→students, `delta` integer notNull, `reason` notNull, `source` enum `manual|assignment|attendance|live` notNull, `refId` text nullable, `createdAt`; unique(`source`,`refId`)
- `Env.BUCKET: R2Bucket`; `wrangler.jsonc` `r2_buckets: [{ binding: "BUCKET", bucket_name: "classroom-files" }]`

- [ ] **Step 1:** test `บันทึก assignment + submission และ unique(assignment, student)` และ `pointEvents unique(source, refId)`
- [ ] **Step 2:** run → FAIL
- [ ] **Step 3:** เพิ่มตาราง, `npm run db:generate`, เพิ่ม binding
- [ ] **Step 4:** `npm test` PASS, `npm run typecheck`
- [ ] **Step 5:** commit `feat: M1 schema and R2 binding`

---

### Task 2: ไฟล์รูป (อัปโหลด/เสิร์ฟพร้อมตรวจสิทธิ์)

**Files:** Create `src/server/files/service.ts`, `src/server/files/routes.ts`; Modify `src/server/index.ts`; Test `tests/files.test.ts`

**Interfaces — Produces:**
- `ALLOWED_IMAGE_TYPES = ['image/jpeg','image/png','image/webp']`, `MAX_IMAGE_BYTES = 5 * 1024 * 1024`
- `putImage(bucket, key, body: ArrayBuffer, contentType: string): Promise<void>` — throw `apiError('invalid_image','รองรับเฉพาะรูป JPG/PNG/WebP ขนาดไม่เกิน 5MB',400)`
- `canRead(db, session: SessionInfo, key: string): Promise<boolean>` — ครู: ทุก key; นักเรียน: `sub/<ตัวเอง>/…`, key ใน `attachmentKeys` ของงานในห้องตัวเอง, key ใน `annotatedKeys` ของ submission ตัวเอง
- `POST /api/files?kind=submission|attachment|annotation&submissionId=` (body = ไฟล์ดิบ, header `content-type`) → `{ key }`
  - `submission`: ต้องเป็นนักเรียน → `sub/<studentId>/<ulid>.<ext>`
  - `attachment`: ครู → `asg/<ulid>.<ext>`; `annotation`: ครู + `submissionId` → `ann/<submissionId>/<ulid>.png`
- `GET /api/files/<key>` → stream object พร้อม `content-type`, `cache-control: private, max-age=86400`; ไม่มีสิทธิ์หรือไม่มีไฟล์ → 404 `not_found`

- [ ] **Step 1:** tests: `นักเรียนอัปโหลดรูปได้ key ขึ้นต้น sub/<id>/`; `ไฟล์ไม่ใช่รูปหรือเกิน 5MB ได้ 400 invalid_image`; `นักเรียนอัปโหลด attachment ได้ 401`; `นักเรียนอ่านรูปตัวเองได้ อ่านของเพื่อนได้ 404`; `ครูอ่านได้ทุกไฟล์`; `ไม่ล็อกอินอ่านได้ 401`
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS
- [ ] **Step 5:** commit `feat: image upload and authorized serving via R2`

---

### Task 3: ครูจัดการงาน

**Files:** Create `src/shared/assignments.ts`, `src/server/assignments/service.ts`, `src/server/assignments/teacher-routes.ts`; Test `tests/assignments-teacher.test.ts`

**Interfaces — Produces:**
- zod `assignmentInputSchema = { title: string 1..200, instructions: string ≤5000, attachmentKeys: string[] ≤5 (ขึ้นต้น 'asg/'), dueAt: number|null, maxScore: number >0 ≤1000, submitMode: 'text'|'image'|'both' }`
- `createAssignments(db, classIds: string[], input): Promise<string[]>` (1 แถวต่อห้อง; ห้องไม่มีอยู่ → 404 `class_not_found`)
- `listForClass(db, classId)` → `{ id,title,dueAt,maxScore,submitMode, counts: { submitted, late, graded, returned, missing } }[]` เรียง `dueAt` (null ท้าย) แล้ว `createdAt`
- `updateAssignment(db, id, input)`; `deleteAssignment(db, id)` → มี submission แล้ว 409 `has_submissions` "มีนักเรียนส่งงานแล้ว ลบไม่ได้"
- Routes (requireTeacher): `POST /api/teacher/assignments` `{ classIds, ...input }` → `{ ids }`; `GET /api/teacher/classes/:id/assignments`; `GET|PUT|DELETE /api/teacher/assignments/:id`

- [ ] **Step 1:** tests: `สร้างงานให้ 2 ห้องได้ 2 งาน`; `ห้องไม่มีอยู่ 404`; `ข้อมูลไม่ถูกต้อง 400`; `listForClass นับสถานะถูก (missing = นักเรียน active ที่ยังไม่ส่ง)`; `ลบงานที่มีคนส่งแล้วได้ 409`; `นักเรียนเรียกได้ 401`
- [ ] **Step 2–4:** FAIL → implement → PASS
- [ ] **Step 5:** commit `feat: teacher assignment management`

---

### Task 4: นักเรียนดูงาน

**Files:** Modify `src/server/assignments/service.ts`, `src/shared/assignments.ts`; Create `src/server/assignments/student-routes.ts`; Test `tests/assignments-student.test.ts`

**Interfaces — Produces:**
- `type StudentAssignment = { id, title, instructions, attachmentKeys, dueAt, maxScore, submitMode, status: 'missing'|'submitted'|'late'|'graded'|'returned', submission: { text, imageKeys, annotatedKeys, score, comment, submittedAt } | null }`
- `listForStudent(db, studentId, classId, now)` — เฉพาะงาน `published` ของ `classId` ปัจจุบัน; เรียง: missing/returned ก่อน ตาม dueAt แล้วที่เหลือ
- `GET /api/student/assignments` (requireStudent) → `StudentAssignment[]`; `GET /api/student/assignments/:id` → ไม่ใช่ห้องตัวเอง 404 `assignment_not_found`

- [ ] **Step 1:** tests: `เห็นเฉพาะงานห้องตัวเอง`; `สถานะ missing เมื่อยังไม่ส่ง`; `เห็นคะแนน/คอมเมนต์หลังตรวจ`; `ย้ายห้องแล้วเห็นเฉพาะงานห้องใหม่`; `ของานห้องอื่นได้ 404`
- [ ] **Step 2–4:** FAIL → implement → PASS
- [ ] **Step 5:** commit `feat: student assignment list`

---

### Task 5: นักเรียนส่งงาน

**Files:** Modify service + student-routes + shared; Test `tests/assignments-submit.test.ts`

**Interfaces — Produces:**
- zod `submissionInputSchema = { text: string ≤5000, imageKeys: string[] ≤10, clientRequestId: string 1..64 }`
- `upsertSubmission(db, { assignmentId, studentId, classId, input, now }) → StudentAssignment`
  - ตรวจ submitMode: `text` ต้องมีข้อความ; `image` ต้องมี ≥1 รูป; `both` ต้องมีอย่างน้อยหนึ่งอย่าง → 400 `empty_submission` "กรุณาใส่ข้อความหรือรูปงาน"
  - ทุก imageKey ต้องขึ้นต้น `sub/<studentId>/` → 400 `invalid_image`
  - สถานะเดิม `graded` → 409 `already_graded` "ครูตรวจแล้ว แก้ไขไม่ได้"
  - `clientRequestId` เท่ากับของเดิม → คืนผลเดิมไม่แก้อะไร
  - สถานะใหม่ = `now > dueAt ? 'late' : 'submitted'`; `submittedAt = now`
- `PUT /api/student/assignments/:id/submission`

- [ ] **Step 1:** tests: `ส่งก่อนกำหนดได้ submitted`; `ส่งหลังกำหนดได้ late`; `แก้ได้ก่อนตรวจ`; `ตรวจแล้วแก้ได้ 409`; `ส่งกลับแก้แล้วส่งใหม่ได้`; `clientRequestId ซ้ำไม่สร้างซ้ำ/ไม่เปลี่ยน submittedAt`; `submitMode image แต่ไม่มีรูป 400 empty_submission`; `แนบ key ของคนอื่น 400 invalid_image`
- [ ] **Step 2–4:** FAIL → implement → PASS
- [ ] **Step 5:** commit `feat: student submissions`

---

### Task 6: ตารางทวงงาน (gradebook)

**Files:** Modify service + teacher-routes; Test `tests/assignments-gradebook.test.ts`

**Interfaces — Produces:**
- `gradebook(db, classId)` → `{ class: { id, name }, assignments: { id, title, dueAt, maxScore }[], students: { id, zipgradeId, title, firstName, lastName, cells: Record<assignmentId, { status, score: number|null, submissionId: string|null }> }[] }` — นักเรียน active ของห้อง เรียง sortOrder
- `GET /api/teacher/classes/:id/gradebook`
- ข้อความ "คัดลอกรายชื่อคนยังไม่ส่ง" สร้างฝั่ง client: `missingText(gb, assignmentId)` ใน `src/shared/assignments.ts` → `"<ชื่องาน> — ยังไม่ส่ง N คน\n1. <ชื่อ> (<zipgradeId>)\n…"`

- [ ] **Step 1:** tests: `gradebook มีทุกคน×ทุกงาน`; `missingText ตรงรูปแบบ`; `นักเรียนที่ปิดใช้งานไม่อยู่ในตาราง`
- [ ] **Step 2–4:** FAIL → implement → PASS
- [ ] **Step 5:** commit `feat: teacher gradebook`

---

### Task 7: ตรวจงาน + EXP

**Files:** Modify service + teacher-routes; Test `tests/assignments-grade.test.ts`

**Interfaces — Produces:**
- `getSubmission(db, id)` → submission + `assignment` + `student` + `neighbors: { prevId, nextId }` (ตาม sortOrder ในห้อง ข้ามคนไม่ส่ง)
- `gradeSubmission(db, id, { score, comment, annotatedKeys }, now)` — `0 ≤ score ≤ maxScore` ไม่งั้น 400 `invalid_score` "คะแนนต้องอยู่ระหว่าง 0 ถึง <max>"; annotatedKeys ขึ้นต้น `ann/<id>/`; สถานะ `graded`; ครั้งแรกเพิ่ม `pointEvents` (`+10` ถ้า submission เคยเป็น `submitted`, `+5` ถ้า `late`; reason "ส่งงาน: <title>", source `assignment`, refId = submissionId) ด้วย `INSERT … ON CONFLICT DO NOTHING`
- `returnSubmission(db, id, comment)` → `returned` (ไม่ให้ EXP)
- Routes: `GET /api/teacher/submissions/:id`, `POST /api/teacher/submissions/:id/grade`, `POST /api/teacher/submissions/:id/return`
- ตัดสิน EXP จาก `submittedAt > dueAt` (ส่งสาย = +5) ไม่ใช่จาก status ปัจจุบัน

- [ ] **Step 1:** tests: `ให้คะแนนแล้วสถานะ graded และ EXP +10`; `ส่งสายได้ +5`; `ตรวจซ้ำ EXP ไม่เพิ่ม`; `คะแนนเกิน/ติดลบ 400`; `ส่งกลับแก้ได้ returned ไม่มี EXP`; `neighbors ข้ามคนไม่ส่ง`
- [ ] **Step 2–4:** FAIL → implement → PASS
- [ ] **Step 5:** commit `feat: grading with automatic EXP`

---

### Task 8: หน้าเว็บนักเรียน

**Files:** Create `src/client/lib/image.ts`, `src/client/lib/upload.ts`, `src/client/pages/StudentAssignments.tsx`, `src/client/pages/StudentSubmit.tsx`; Modify `StudentHome.tsx`, `App.tsx`

- `resizeImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob>` (createImageBitmap + canvas → JPEG)
- `uploadImage(blob, kind, submissionId?) → Promise<string>` (POST `/api/files`)
- `/me` แสดงแถบเตือนงานค้าง (เหลือ < 24 ชม. หรือเลยกำหนด) + แท็บ ค้างส่ง/ส่งแล้ว/ตรวจแล้ว/แก้ (ตาม mockup 03)
- `/me/assignments/:id` ส่งงาน: ข้อความ + เลือก/ถ่ายรูปหลายรูป (`accept="image/*" capture="environment" multiple`), สถานะอัปโหลดต่อรูป, ร่างข้อความเก็บ localStorage (`draft:<assignmentId>`), ปุ่ม "ส่งงาน" สร้าง `clientRequestId` ใหม่ต่อการกด; หลังตรวจแสดงคะแนน คอมเมนต์ และรูปที่ครูเขียนทับ (ตาม mockup 04)

- [ ] ตรวจด้วย Task 10 E2E; `npm run typecheck`, `npm run build` ผ่าน; commit `feat: student assignment pages`

---

### Task 9: หน้าเว็บครู

**Files:** Create `src/client/lib/excel.ts`, `src/client/components/AnnotateCanvas.tsx`, `src/client/pages/TeacherAssignments.tsx`, `src/client/pages/TeacherGradebook.tsx`, `src/client/pages/TeacherGrade.tsx`; Modify `TeacherLayout.tsx` (+เมนู "งาน"), `TeacherClass.tsx` (+ลิงก์ งาน/ตารางทวงงาน), `App.tsx`; `npm i -E write-excel-file@4.1.1`

- `/teacher/assignments/new?classId=` ฟอร์มสร้างงาน (เลือกหลายห้องแบบ checkbox จัดกลุ่มตามโรงเรียน, กำหนดส่งเป็นวันที่+เวลา Asia/Bangkok, รูปประกอบ)
- `/teacher/classes/:id/gradebook` ตารางนักเรียน×งาน (สีตาม mockup 10), คลิกช่อง → หน้าตรวจ, ปุ่ม "📋 คัดลอกรายชื่อคนยังไม่ส่ง" ต่องาน (`navigator.clipboard.writeText(missingText(...))`), ปุ่ม "⬇ Excel" (`exportGradebook`)
- `exportGradebook(gb)` → ไฟล์ `สมุดคะแนน-<ชื่อห้อง>.xlsx` แถว = ลำดับ, ZipGrade ID, ชื่อ; คอลัมน์ = งาน (ค่า = คะแนน, ส่งแล้วยังไม่ตรวจ = "ส่งแล้ว", ไม่ส่ง = ว่าง)
- `/teacher/submissions/:id` ตรวจ: AnnotateCanvas (ปากกา/ไฮไลต์/ข้อความ/ยางลบ, 5 สี `#E53935 #222222 #1E63D6 #2E9D6A #F59E0B`, ขนาด, undo) ต่อรูป → บันทึกเป็น PNG อัปโหลด `kind=annotation`; คะแนน + ปุ่มลัด + คอมเมนต์สำเร็จรูป; "บันทึก & ถัดไป", "ส่งกลับให้แก้" (ตาม mockup 11)

- [ ] ตรวจด้วย Task 10 E2E; typecheck/build ผ่าน; commit `feat: teacher assignment, gradebook and grading pages`

---

### Task 10: E2E + deploy

**Files:** Create `tests/e2e/m1.spec.ts`; Modify `.github/workflows/deploy.yml` (ไม่ต้องแก้ถ้า binding อยู่ใน wrangler.jsonc), `docs/deploy-cloudflare.md` (R2 จำเป็นตั้งแต่ M1)

- [ ] **Step 1:** E2E `ครูสร้างงาน → นักเรียนส่งข้อความ+รูป → ครูเห็นในตาราง ตรวจและเขียนทับ ให้คะแนน → นักเรียนเห็นคะแนน` (รูปจาก `tests/fixtures/sample.jpg` สร้างด้วยโค้ด ไม่มีข้อมูลจริง)
- [ ] **Step 2:** `npm run e2e` → FAIL ก่อน Task 8–9 เสร็จ / PASS หลังเสร็จ
- [ ] **Step 3:** ตรวจหน้าจอ 390px ทุกหน้าใหม่ ไม่มี horizontal scroll
- [ ] **Step 4:** commit `test: M1 end-to-end flow`
