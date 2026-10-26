# M0 ฐานระบบ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เว็บแอปบน Cloudflare ที่ครูล็อกอินได้, นำเข้ารายชื่อจาก CSV ของ ZipGrade ได้ (มีพรีวิว), นักเรียนล็อกอินด้วย ZipGrade ID + PIN ได้, ครูจัดการ PIN/session ได้ และ deploy ได้จริง

**Architecture:** Worker ตัวเดียว: Hono API (`src/server`) + React SPA (`src/client`) เสิร์ฟเป็น static assets ผ่าน `@cloudflare/vite-plugin`; ข้อมูลใน D1 ผ่าน Drizzle; logic แต่ละโดเมนอยู่ใน service ที่รับ `db` (ไม่รู้จัก HTTP) แล้ว route ทำแค่ auth + validate + เรียก service; โค้ดที่ใช้ทั้งสองฝั่ง (zod schema, CSV parser) อยู่ใน `src/shared`

**Tech Stack:** Node 22, wrangler 4.152.0, vite 8.3.5, @cloudflare/vite-plugin 1.65.0, @vitejs/plugin-react 6.1.2, react 19.3.1, react-router 8.5.0, tailwindcss + @tailwindcss/vite 4.3.3, hono 4.13.14, drizzle-orm 0.45.4, drizzle-kit 0.31.11, zod 4.6.7, ulid 3.0.2, papaparse 5.7.0, vitest 5.0.5, @cloudflare/vitest-plugin 1.4.7, @cloudflare/workers-types, @playwright/test (ใช้ Chromium ที่ติดตั้งไว้แล้ว ห้าม `playwright install`)

**Spec:** `docs/superpowers/specs/2026-10-25-classroom-assistant-design.md` (หัวข้อ 1, 2, 3, 4, 5.1, 7, 8, 10, 11)

## Global Constraints

- ข้อความ UI และ error message ทั้งหมดเป็นภาษาไทย
- Error response รูปแบบเดียว: `{ "error": { "code": string, "message": string } }` (code เป็นภาษาอังกฤษ snake_case เช่น `invalid_pin`)
- ทุกตารางมี `id` เป็น ULID (text) และ `created_at` เป็น epoch ms (integer, UTC); แสดงผลเป็นเขตเวลา `Asia/Bangkok`
- **ห้าม commit CSV รายชื่อจริง**: `.gitignore` มี `*.csv` และ `!tests/fixtures/*.csv`; fixture ใช้ชื่อสมมติเท่านั้น
- รหัสผ่าน/PIN hash: PBKDF2-SHA256, **100000 iterations** (เพดานของ Workers), salt 16 ไบต์สุ่ม, รูปแบบสตริง `pbkdf2-sha256$100000$<salt base64>$<hash base64>`
- Session cookie ชื่อ `sid` (HttpOnly, Secure, SameSite=Lax, Path=/); เก็บเฉพาะ SHA-256 hex ของ token ใน DB; ครู 30 วัน, นักเรียน 90 วัน
- นักเรียน: PIN ต้องเป็นตัวเลข 4 หลักพอดี; ผิด 5 ครั้งติด → ล็อก 15 นาที; จำกัดต่อ IP 60 ครั้ง/นาที บน endpoint ล็อกอินนักเรียน
- ครู: ผิดรวม 10 ครั้งใน 15 นาที → ปิดล็อกอินครู 15 นาที
- ZipGrade ID canonical: trim แล้ว ถ้าเป็นตัวเลขล้วน → ตัดศูนย์นำหน้า (`"007"` → `"7"`); ใช้ฟังก์ชันเดียวกัน (`canonicalZipgradeId`) ทั้งตอนนำเข้าและตอนล็อกอิน
- join code ห้อง 6 ตัวจากอักษร `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
- ทดสอบด้วย `@cloudflare/vitest-plugin`: **storage แยกต่อไฟล์เทสต์ ไม่ใช่ต่อเทสต์** → เทสต์ในไฟล์เดียวกันต้องใช้ข้อมูลที่ไม่ชนกัน (ใช้ helper สร้างข้อมูลด้วย id/zipgrade_id ไม่ซ้ำ)

## Review Focus

1. CSV ที่ export/บันทึกผ่าน Excel มี UTF-8 BOM และ CRLF → ต้อง parse ได้เหมือนไฟล์ปกติ (เทสต์ใน Task 4)
2. นักเรียนพิมพ์ ID มีช่องว่างหรือศูนย์นำหน้า (`" 0124 "`) → ต้องหาเจอเป็นคนเดียวกับ `124` (เทสต์ใน Task 4 และ Task 8)
3. นักเรียน 2 เครื่องตั้ง PIN ให้ ID เดียวกันที่ยังไม่มี PIN พร้อมกัน → สำเร็จแค่รายแรก อีกรายได้ `pin_already_set` (เทสต์ใน Task 8)
4. นำเข้าซ้ำแล้วนักเรียนย้ายห้อง/หายจากไฟล์ → ย้ายห้องโดย session ไม่หลุด, ที่หายไม่ถูกลบ (ปิดใช้งานเมื่อครูเลือกเท่านั้น), คนที่ปิดใช้งานล็อกอินไม่ได้ (เทสต์ใน Task 5 และ Task 8)
5. PIN ผิดรูปแบบ (`"12a4"`, `"12345"`, `""`) → 400 `invalid_pin_format` พร้อมข้อความไทย และไม่นับเป็นความพยายามผิด (เทสต์ใน Task 8)

---

## File Structure

```
package.json, tsconfig.json, wrangler.jsonc, vite.config.ts, vitest.config.ts, drizzle.config.ts, .gitignore
migrations/                       SQL ที่ drizzle-kit สร้าง (wrangler d1 migrations ใช้โฟลเดอร์นี้)
scripts/hash-password.mjs         สร้าง TEACHER_PASSWORD_HASH
src/shared/
  errors.ts                       ApiError type + รหัส error
  zipgrade.ts                     canonicalZipgradeId
  roster/parse.ts                 parse CSV ของ ZipGrade → RosterRow[] + flags
  schemas.ts                      zod schema ของ request body
src/server/
  index.ts                        Hono app รวม route + export default
  env.ts                          type Env (bindings)
  http.ts                         apiError(), onError handler, getClientIp()
  db/schema.ts                    Drizzle tables ของ M0
  db/client.ts                    getDb(env)
  auth/crypto.ts                  hashSecret / verifySecret / randomToken / sha256Hex
  auth/sessions.ts                createSession / readSession / revoke*
  auth/middleware.ts              requireTeacher / requireStudent
  auth/rate-limit.ts              hitRateLimit
  auth/teacher-routes.ts          /api/teacher/login, /api/logout, /api/me
  auth/student-routes.ts          /api/student/*
  roster/service.ts               previewImport / applyImport / listClasses / listStudents
  roster/routes.ts                /api/teacher/roster/*, /api/teacher/classes*, /api/teacher/students/*
src/client/
  index.html, main.tsx, App.tsx, api.ts, index.css
  pages/StudentLogin.tsx, StudentHome.tsx, TeacherLogin.tsx, TeacherHome.tsx, TeacherImport.tsx, TeacherClass.tsx
tests/
  fixtures/roster.sample.csv      ชื่อสมมติ ครอบคลุมทุกรูปแบบ
  helpers.ts                      seedClass(), seedStudent(), loginTeacher(), cookieFrom()
  apply-migrations.ts             setup file
  *.test.ts                       ตาม task
  e2e/m0.spec.ts                  Playwright
docs/deploy-cloudflare.md         คู่มือ deploy ภาษาไทย
.github/workflows/deploy.yml
```

---

### Task 1: โครงโปรเจกต์ + health check

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.jsonc`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `src/server/index.ts`, `src/server/env.ts`, `src/server/http.ts`, `src/shared/errors.ts`, `src/client/index.html`, `src/client/main.tsx`, `src/client/App.tsx`, `src/client/index.css`, `tests/apply-migrations.ts`, `migrations/.gitkeep`
- Test: `tests/health.test.ts`

**Interfaces:**
- Produces:
  - `type Env = { DB: D1Database; BUCKET: R2Bucket; ASSETS: Fetcher; TEACHER_PASSWORD_HASH: string; SESSION_SECRET: string }` ใน `src/server/env.ts`
  - `type AppEnv = { Bindings: Env; Variables: { session?: SessionInfo } }` (SessionInfo มาจาก Task 6; ตอนนี้ประกาศเป็น `unknown` ไว้ก่อน)
  - `apiError(code: string, message: string, status: ContentfulStatusCode): HTTPException` ใน `src/server/http.ts` + `app.onError` ที่แปลงเป็นรูปแบบ error กลาง (error อื่นที่ไม่คาดคิด → 500 `internal_error` "เกิดข้อผิดพลาด กรุณาลองใหม่")
  - `getClientIp(c): string` อ่าน `cf-connecting-ip` (fallback `"unknown"`)
  - `export default app` (Hono) — route ที่ไม่ใช่ `/api/*` ส่งต่อให้ `c.env.ASSETS.fetch`

- [ ] **Step 1: สร้าง config**
  - `package.json`: `"type": "module"`, scripts: `dev` = `vite`, `build` = `vite build`, `preview` = `vite preview`, `test` = `vitest run`, `typecheck` = `tsc --noEmit`, `db:generate` = `drizzle-kit generate`, `db:migrate:local` = `wrangler d1 migrations apply classroom --local`, `db:migrate:remote` = `wrangler d1 migrations apply classroom --remote`, `deploy` = `vite build && wrangler deploy`; ติดตั้งเวอร์ชันตาม Tech Stack (pin แบบ exact)
  - `wrangler.jsonc`: `name: "classroom"`, `main: "src/server/index.ts"`, `compatibility_date: "2026-10-01"`, `compatibility_flags: ["nodejs_compat"]`, `assets: { not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`, `d1_databases: [{ binding: "DB", database_name: "classroom", database_id: "00000000-0000-0000-0000-000000000000", migrations_dir: "migrations" }]` (ครูแทนค่า id ตอน deploy ตามคู่มือ), `r2_buckets: [{ binding: "BUCKET", bucket_name: "classroom-files" }]`, `vars: {}`
  - `vite.config.ts`: plugins `cloudflare()`, `react()`, `tailwindcss()`; root ของ client คือ `src/client`
  - `vitest.config.ts`: แยกจาก vite config; ใช้รูปแบบที่ทดสอบแล้วนี้:
    ```ts
    import { defineConfig } from 'vitest/config'
    import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
    export default defineConfig(async () => {
      const migrations = await readD1Migrations('./migrations')
      return {
        plugins: [cloudflareTest({
          wrangler: { configPath: './wrangler.jsonc' },
          miniflare: { bindings: { TEST_MIGRATIONS: migrations, TEACHER_PASSWORD_HASH: '<hash ของ "teacher-pass">', SESSION_SECRET: 'test-secret' } },
        })],
        test: { setupFiles: ['./tests/apply-migrations.ts'], include: ['tests/**/*.test.ts'] },
      }
    })
    ```
    (`<hash ของ "teacher-pass">` สร้างใน Task 3 แล้วกลับมาแทน; ระหว่างนี้ใส่สตริงใดก็ได้)
  - `tests/apply-migrations.ts`: `await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` จาก `cloudflare:test`
  - `.gitignore`: `node_modules`, `dist`, `.wrangler`, `.dev.vars`, `*.csv`, `!tests/fixtures/*.csv`, `test-results`, `playwright-report`
  - `tsconfig.json`: strict, `types: ["@cloudflare/workers-types", "@cloudflare/vitest-plugin/types", "vite/client"]`, `jsx: "react-jsx"`, `moduleResolution: "bundler"`

- [ ] **Step 2: เขียนเทสต์ที่ล้มเหลว** `tests/health.test.ts`
  ```ts
  it('GET /api/health ตอบ ok', async () => {
    const r = await SELF.fetch('http://x/api/health')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })
  it('API ที่ไม่มีอยู่ตอบ 404 รูปแบบ error กลาง', async () => {
    const r = await SELF.fetch('http://x/api/nope')
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ error: { code: 'not_found', message: 'ไม่พบหน้าที่ต้องการ' } })
  })
  ```
- [ ] **Step 3: รัน `npm test` → FAIL** (ยังไม่มี app)
- [ ] **Step 4: เขียน `src/server/index.ts`, `env.ts`, `http.ts`, `src/shared/errors.ts`** ให้ผ่าน; client แสดงหน้า "ผู้ช่วยครู" ธรรมดา (ฟอนต์ Noto Sans Thai จาก Google Fonts ใน `index.html`)
- [ ] **Step 5: รัน `npm test` → PASS, `npm run typecheck` → ไม่มี error, `npm run build` → สำเร็จ**
- [ ] **Step 6: Commit** `chore: scaffold Cloudflare Worker + React app`

---

### Task 2: Schema D1 ของ M0

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/client.ts`, `drizzle.config.ts`, `migrations/0000_*.sql` (สร้างด้วย `npm run db:generate`), `tests/helpers.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces (Drizzle `sqliteTable`; boolean ใช้ `integer({ mode: 'boolean' })`):
  - `schools`: `id` pk, `name` notNull unique, `createdAt`
  - `classes`: `id` pk, `schoolId` → schools.id notNull, `grade` integer nullable, `name` notNull unique, `joinCode` notNull unique, `archived` boolean default false, `createdAt`
  - `students`: `id` pk, `zipgradeId` notNull unique, `classId` → classes.id notNull, `title` nullable, `firstName` notNull, `lastName` notNull (อาจเป็น `""`), `sortOrder` integer notNull, `active` boolean default true, `pinHash` nullable, `failedAttempts` integer default 0, `lockedUntil` integer nullable, `createdAt`, `updatedAt`
  - `sessions`: `id` pk, `kind` text (`'teacher' | 'student'`), `studentId` → students.id nullable, `tokenHash` notNull unique, `userAgent` text notNull default `''`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt` nullable, `flaggedNewDevice` boolean default false
  - `settings`: `key` pk, `value` text (JSON)
  - `rateLimits`: `key` pk, `windowStart` integer, `count` integer
  - (หมายเหตุ: spec มี `pin_salt` แยก แต่ salt อยู่ในสตริง hash แล้วตาม Global Constraints จึงไม่มีคอลัมน์นี้)
  - `getDb(env: Env)` → `drizzle(env.DB, { schema })`; export `type Db`
  - `newId(): string` (ulid) และ `now(): number` ใน `src/server/db/client.ts`
  - `tests/helpers.ts`: `seedClass(db, overrides?) → Promise<{ schoolId, classId, joinCode }>`, `seedStudent(db, classId, overrides?) → Promise<{ id, zipgradeId }>` (zipgradeId เริ่มต้นสุ่มไม่ซ้ำ)

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว** `tests/schema.test.ts`
  - `it('บันทึกและอ่านนักเรียนได้')` — seedClass + seedStudent แล้ว select ได้ `firstName` ตรง, `active === true`, `pinHash === null`
  - `it('zipgradeId ซ้ำไม่ได้')` — insert ซ้ำ → `rejects.toThrow()`
- [ ] **Step 2: รัน `npm test -- schema` → FAIL**
- [ ] **Step 3: เขียน schema + client + helpers, รัน `npm run db:generate`** ได้ `migrations/0000_*.sql`
- [ ] **Step 4: รัน `npm test` → PASS**
- [ ] **Step 5: Commit** `feat: add M0 database schema`

---

### Task 3: Crypto + สคริปต์สร้างรหัสผ่านครู

**Files:**
- Create: `src/server/auth/crypto.ts`, `scripts/hash-password.mjs`
- Modify: `vitest.config.ts` (ใส่ hash จริงของ `"teacher-pass"`)
- Test: `tests/crypto.test.ts`

**Interfaces:**
- Produces:
  - `hashSecret(secret: string): Promise<string>` — รูปแบบตาม Global Constraints (WebCrypto `PBKDF2`, SHA-256, 100000 iter, ยาว 32 ไบต์)
  - `verifySecret(secret: string, stored: string): Promise<boolean>` — คืน `false` ถ้ารูปแบบเสีย; เทียบแบบ constant-time
  - `randomToken(): string` — 32 ไบต์สุ่ม base64url
  - `sha256Hex(input: string): Promise<string>`
  - `scripts/hash-password.mjs`: `node scripts/hash-password.mjs <password>` พิมพ์ hash รูปแบบเดียวกัน (ใช้ `globalThis.crypto.subtle` ของ Node 22)

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**
  - `it('hash แล้ว verify ได้')` — `verifySecret('1234', await hashSecret('1234'))` เป็น `true`; `'1235'` เป็น `false`
  - `it('hash ขึ้นต้นด้วย pbkdf2-sha256$100000$ และ salt ต่างกันทุกครั้ง')`
  - `it('stored ผิดรูปแบบคืน false')` — `verifySecret('x', 'garbage')` เป็น `false`
  - `it('hash จากสคริปต์ Node ใช้กับ verifySecret ได้')` — ฮาร์ดโค้ดผลลัพธ์จากการรันสคริปต์กับ `"teacher-pass"` แล้ว verify เป็น `true`
  - `it('randomToken ไม่ซ้ำและยาว 43 ตัว')`
- [ ] **Step 2: รัน `npm test -- crypto` → FAIL**
- [ ] **Step 3: เขียน `crypto.ts` + สคริปต์; รันสคริปต์ด้วย `teacher-pass` แล้วนำผลไปใส่ในเทสต์และ `vitest.config.ts`**
- [ ] **Step 4: รัน `npm test` → PASS**
- [ ] **Step 5: Commit** `feat: add PBKDF2 hashing and password script`

---

### Task 4: ตัว parse CSV ของ ZipGrade

**Files:**
- Create: `src/shared/zipgrade.ts`, `src/shared/roster/parse.ts`, `tests/fixtures/roster.sample.csv`
- Test: `tests/roster-parse.test.ts`

**Interfaces:**
- Produces:
  - `canonicalZipgradeId(raw: string): string` — ตาม Global Constraints
  - ```ts
    type RosterFlag = 'no_title' | 'duplicate_name' | 'unusual_id' | 'missing_field'
    type RosterRow = { line: number; zipgradeId: string; title: string | null; firstName: string;
      lastName: string; className: string; schoolName: string; grade: number | null; flags: RosterFlag[] }
    type ParseResult = { rows: RosterRow[]; errors: { line: number; message: string }[] }
    parseZipgradeCsv(text: string): ParseResult
    splitThaiName(first: string, last: string): { title: string | null; firstName: string; lastName: string }
    parseClassName(name: string): { schoolName: string; grade: number | null }
    ```
  - คำนำหน้าที่รู้จัก (ตรวจตามลำดับนี้ เพื่อไม่ให้ `นาง` จับ `นางสาว`): `เด็กหญิง`, `เด็กชาย`, `นางสาว`, `นาง`, `นาย`
  - `parseClassName`: regex `^(.*\S)\s+ชั้น\s*(\d+)$`; ไม่ match → `{ schoolName: name, grade: null }`
  - `unusual_id`: ไม่ใช่ตัวเลขล้วน หรือยาวเกิน 4 หลัก; `duplicate_name`: ชื่อ+นามสกุล (ไม่รวมคำนำหน้า) ซ้ำกันใน className เดียวกัน (ติด flag ทุกแถวที่ซ้ำ)
  - แถวที่ ZipGrade ID ว่าง, ชื่อว่าง หรือ Classes ว่าง → ไม่เข้า `rows` แต่เข้า `errors` (`"แถว N: ไม่มี ZipGrade ID"` ฯลฯ); ZipGrade ID ซ้ำในไฟล์ → แถวหลังเข้า `errors` `"แถว N: ZipGrade ID ซ้ำกับแถว M"`
  - หัวคอลัมน์ต้องมี `ZipGrade ID`, `First Name`, `Last Name`, `Classes` (ไม่สนลำดับ); ขาด → `errors` บรรทัด 1 และ `rows` ว่าง
  - ใช้ papaparse (`header: true, skipEmptyLines: true`); ตัด BOM ก่อน parse

- [ ] **Step 1: สร้าง fixture** `tests/fixtures/roster.sample.csv` (ชื่อสมมติ, หัวคอลัมน์ `ZipGrade ID,External ID,First Name,Last Name,Classes`) อย่างน้อย:
  - `1,โรงเรียนทดสอบ ชั้น 1,เด็กหญิงสมใจ,ใจดี,โรงเรียนทดสอบ ชั้น 1`
  - `2,โรงเรียนทดสอบ ชั้น 1,เด็กชาย,สมชาย รักเรียน,โรงเรียนทดสอบ ชั้น 1`
  - `3,โรงเรียนทดสอบ ชั้น 1,มานี,มีนา,โรงเรียนทดสอบ ชั้น 1`
  - `4,โรงเรียนตัวอย่าง ชั้น 5,นางสาวปิติ,ยินดี,โรงเรียนตัวอย่าง ชั้น 5`
  - `5,โรงเรียนตัวอย่าง ชั้น 5,นายชูใจ,ใฝ่รู้,โรงเรียนตัวอย่าง ชั้น 5`
  - `6,โรงเรียนตัวอย่าง ชั้น 5,นายชูใจ,ใฝ่รู้,โรงเรียนตัวอย่าง ชั้น 5` (ชื่อซ้ำ)
  - `31448,,ทดลอง,ระบบ,โรงเรียนตัวอย่าง ชั้น 5` (ID ยาว + ไม่มีคำนำหน้า + External ID ว่าง)
- [ ] **Step 2: เขียนเทสต์ที่ล้มเหลว** (อ่าน fixture ด้วย `import fixture from './fixtures/roster.sample.csv?raw'`)
  - `it('แยกคำนำหน้าที่ติดกับชื่อ')` — `splitThaiName('เด็กหญิงสมใจ','ใจดี')` → `{ title:'เด็กหญิง', firstName:'สมใจ', lastName:'ใจดี' }`
  - `it('คำนำหน้าอยู่ลำพัง ชื่อจริงอยู่ในช่องนามสกุล')` — `splitThaiName('นางสาว','ปิติ ยินดี')` → `{ title:'นางสาว', firstName:'ปิติ', lastName:'ยินดี' }`; `splitThaiName('เด็กชาย','สมชาย รักเรียน มากมาย')` → lastName `'รักเรียน มากมาย'`
  - `it('นางสาวไม่ถูกตัดเป็นนาง')` — `splitThaiName('นางสาวปิติ','ยินดี').title === 'นางสาว'`
  - `it('ไม่มีคำนำหน้า')` — `splitThaiName('มานี','มีนา')` → title `null`
  - `it('แยกโรงเรียนและชั้น')` — `parseClassName('โรงเรียนทดสอบ ชั้น 1')` → `{ schoolName:'โรงเรียนทดสอบ', grade:1 }`; `parseClassName('ชมรมดนตรี')` → `{ schoolName:'ชมรมดนตรี', grade:null }`
  - `it('canonical ID')` — `' 0124 '` → `'124'`; `'0'` → `'0'`; `'A12'` → `'A12'`
  - `it('parse fixture ครบ 7 แถว พร้อม flag')` — `rows.length === 7`, แถว ID `3` มี `no_title`, ID `5` และ `6` มี `duplicate_name`, ID `31448` มี `unusual_id` และ `no_title`, `errors` ว่าง
  - `it('รองรับ BOM และ CRLF')` — `'﻿' + fixture.replace(/\n/g, '\r\n')` ได้ผลเท่ากับ fixture เดิม
  - `it('ID ซ้ำในไฟล์และแถวขาดข้อมูลเข้า errors')`
  - `it('หัวคอลัมน์ขาด → error บรรทัด 1')`
- [ ] **Step 3: รัน `npm test -- roster-parse` → FAIL**
- [ ] **Step 4: เขียน `zipgrade.ts` + `parse.ts`**
- [ ] **Step 5: รัน `npm test` → PASS**
- [ ] **Step 6: Commit** `feat: parse ZipGrade roster CSV`

---

### Task 5: Service นำเข้ารายชื่อ (preview + apply)

**Files:**
- Create: `src/server/roster/service.ts`
- Test: `tests/roster-service.test.ts`

**Interfaces:**
- Consumes: `RosterRow` (Task 4), `Db`, `newId`, `now` (Task 2)
- Produces:
  ```ts
  type ImportPreview = {
    newStudents: RosterRow[]
    changed: { row: RosterRow; before: { firstName: string; lastName: string; title: string | null; className: string } }[]
    unchanged: number
    missing: { id: string; zipgradeId: string; name: string; className: string }[]   // active ในระบบแต่ไม่อยู่ในไฟล์
    flagged: RosterRow[]
    newClasses: string[]
  }
  previewImport(db: Db, rows: RosterRow[]): Promise<ImportPreview>
  applyImport(db: Db, rows: RosterRow[], opts: { deactivateMissing: boolean }): Promise<{ created: number; updated: number; deactivated: number }>
  generateJoinCode(): string
  ```
  - apply ทำใน `db.batch([...])` ครั้งเดียว (atomic บน D1): สร้าง school/class ที่ยังไม่มี (join code ไม่ซ้ำ), upsert นักเรียนตาม `zipgradeId` (อัปเดต title/ชื่อ/นามสกุล/classId/updatedAt, ตั้ง `active = true` ถ้าเคยถูกปิด), `sortOrder` = ลำดับตาม ZipGrade ID แบบตัวเลขภายในห้อง (ID ไม่ใช่ตัวเลขต่อท้าย), **ไม่แตะ** `pinHash` และ session
  - `deactivateMissing: true` → ตั้ง `active = false` ให้ `missing`; ไม่มีการลบแถว

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว** (ใช้ `parseZipgradeCsv(fixture).rows`)
  - `it('preview ฐานข้อมูลว่าง: ทุกคนเป็นคนใหม่ ห้องใหม่ 2 ห้อง')` — `newStudents.length === 7`, `newClasses` = `['โรงเรียนตัวอย่าง ชั้น 5','โรงเรียนทดสอบ ชั้น 1']` (เรียงตามตัวอักษร), `flagged.length === 4`
  - `it('apply แล้วสร้างโรงเรียน ห้อง นักเรียน')` — `{ created: 7, updated: 0, deactivated: 0 }`; มี 2 schools; ห้อง `โรงเรียนทดสอบ ชั้น 1` มี `grade === 1` และ `joinCode` ตรง `/^[A-HJ-NP-Z2-9]{6}$/`; sortOrder ของ ID `31448` มากกว่า ID `4`
  - `it('นำเข้าซ้ำโดยไม่เปลี่ยน: unchanged 7')`
  - `it('ย้ายห้องและเปลี่ยนชื่อแสดงใน changed แล้ว apply อัปเดต โดย pinHash และ session ยังอยู่')`
  - `it('คนที่ไม่อยู่ในไฟล์อยู่ใน missing; ปิดใช้งานเฉพาะเมื่อ deactivateMissing')` — apply ด้วย false → ยัง active; ด้วย true → `active === false`, `deactivated === 1`
  - `it('คนที่ถูกปิดใช้งานกลับมาในไฟล์ → active อีกครั้ง')`
- [ ] **Step 2: รัน → FAIL**
- [ ] **Step 3: เขียน service**
- [ ] **Step 4: รัน → PASS**
- [ ] **Step 5: Commit** `feat: roster import preview and apply`

---

### Task 6: Session + ล็อกอินครู

**Files:**
- Create: `src/server/auth/sessions.ts`, `src/server/auth/middleware.ts`, `src/server/auth/rate-limit.ts`, `src/server/auth/teacher-routes.ts`, `src/shared/schemas.ts`
- Modify: `src/server/index.ts`, `src/server/env.ts` (SessionInfo จริง), `tests/helpers.ts` (+ `loginTeacher()`, `cookieFrom()`)
- Test: `tests/teacher-auth.test.ts`

**Interfaces:**
- Consumes: `hashSecret/verifySecret/randomToken/sha256Hex` (Task 3), schema (Task 2)
- Produces:
  - `type SessionInfo = { sessionId: string; kind: 'teacher' } | { sessionId: string; kind: 'student'; studentId: string; classId: string }`
  - `createSession(db, input: { kind: 'teacher' } | { kind: 'student'; studentId: string }, userAgent: string): Promise<{ token: string; flaggedNewDevice: boolean }>` — อายุตาม Global Constraints; นักเรียน: `flaggedNewDevice = true` ถ้ามี session อื่นที่ยังไม่ revoke/ไม่หมดอายุ และ `userAgent` ต่างกัน
  - `readSession(db, token: string): Promise<SessionInfo | null>` — ไม่คืน session ที่ revoke/หมดอายุ/นักเรียน `active = false`; อัปเดต `lastSeenAt` ถ้าเก่ากว่า 5 นาที
  - `revokeSession(db, sessionId)`, `revokeStudentSessions(db, studentId)`
  - `setSessionCookie(c, token, kind)`, `clearSessionCookie(c)`
  - middleware: `sessionMiddleware` (อ่าน cookie `sid` → `c.set('session', ...)`), `requireTeacher`, `requireStudent` → 401 `unauthorized` "กรุณาเข้าสู่ระบบ"
  - `hitRateLimit(db, key: string, limit: number, windowMs: number): Promise<boolean>` — `true` = เกินแล้ว (ใช้ upsert ใน `rateLimits` แบบ fixed window)
  - Routes:
    - `POST /api/teacher/login` body `{ password: string }` → 200 `{ ok: true }` + cookie; ผิด → 401 `invalid_password` "รหัสผ่านไม่ถูกต้อง"; เกิน (key `teacher-login`, 10 / 15 นาที นับเฉพาะครั้งที่ผิด) → 429 `too_many_attempts` "ลองหลายครั้งเกินไป กรุณารอ 15 นาที"
    - `POST /api/logout` → revoke + ล้าง cookie
    - `GET /api/me` → `{ kind: 'teacher' }` หรือ `{ kind: 'student', student: { id, zipgradeId, title, firstName, lastName, className } }` หรือ 401

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**
  - `it('ล็อกอินครูด้วยรหัสถูก ได้ cookie sid HttpOnly และ /api/me เป็น teacher')`
  - `it('รหัสผิดได้ 401 invalid_password')`
  - `it('ผิด 10 ครั้งแล้วครั้งที่ 11 ได้ 429 แม้รหัสถูก')`
  - `it('logout แล้ว /api/me ได้ 401')`
  - `it('cookie ปลอมได้ 401')`
- [ ] **Step 2: รัน → FAIL**
- [ ] **Step 3: เขียนโค้ด**
- [ ] **Step 4: รัน → PASS**
- [ ] **Step 5: Commit** `feat: sessions and teacher login`

---

### Task 7: API นำเข้ารายชื่อและรายการห้อง (ฝั่งครู)

**Files:**
- Create: `src/server/roster/routes.ts`
- Modify: `src/server/roster/service.ts` (+ `listClasses`), `src/server/index.ts`, `src/shared/schemas.ts`
- Test: `tests/roster-routes.test.ts`

**Interfaces:**
- Consumes: `previewImport/applyImport` (Task 5), `requireTeacher` (Task 6), `parseZipgradeCsv` (Task 4)
- Produces:
  - `POST /api/teacher/roster/preview` body `{ csv: string }` → `{ preview: ImportPreview, errors: ParseResult['errors'] }` (parse ฝั่งเซิร์ฟเวอร์ด้วยฟังก์ชันเดียวกัน; จำกัด body ≤ 1MB → 413 `too_large`)
  - `POST /api/teacher/roster/apply` body `{ csv: string, deactivateMissing: boolean }` → ผลของ `applyImport`; ถ้า parse มี `errors` ที่เป็นหัวคอลัมน์ขาด → 400 `invalid_csv`
  - `listClasses(db): Promise<{ schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null; joinCode: string; studentCount: number; pinSetCount: number }[] }[]>` เรียงโรงเรียนตามชื่อ ห้องตาม grade
  - `GET /api/teacher/classes` → ผลของ `listClasses`
  - ทุก route ต้อง `requireTeacher`

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**
  - `it('ไม่ได้ล็อกอินเรียก preview ได้ 401')`
  - `it('preview แล้ว apply fixture แล้ว GET classes ได้ 2 โรงเรียน')` — โรงเรียนทดสอบ studentCount 3, โรงเรียนตัวอย่าง 4, pinSetCount 0
  - `it('CSV ไม่มีหัวคอลัมน์ที่ต้องการ apply ได้ 400 invalid_csv')`
  - `it('นักเรียนเรียก API ครูได้ 401')` (ใช้ session นักเรียนจาก `createSession` ตรง)
- [ ] **Step 2: รัน → FAIL**
- [ ] **Step 3: เขียนโค้ด**
- [ ] **Step 4: รัน → PASS**
- [ ] **Step 5: Commit** `feat: teacher roster import API`

---

### Task 8: ล็อกอินนักเรียน (ID + PIN)

**Files:**
- Create: `src/server/auth/student-routes.ts`
- Modify: `src/server/index.ts`, `src/shared/schemas.ts`
- Test: `tests/student-auth.test.ts`

**Interfaces:**
- Consumes: `canonicalZipgradeId` (Task 4), `createSession`, `hitRateLimit` (Task 6), `hashSecret/verifySecret` (Task 3)
- Produces (ทุก endpoint นับ rate limit ต่อ IP key `ip:<ip>` 60/นาที → 429 `too_many_requests` "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่"):
  - `POST /api/student/lookup` `{ zipgradeId }` →
    - ไม่พบหรือ `active = false` → 404 `student_not_found` "ไม่พบรหัสนี้ กรุณาตรวจสอบกับครู"
    - ยังไม่มี PIN → `{ status: 'needs_pin', student: { title, firstName, lastName, className } }`
    - มี PIN แล้ว → `{ status: 'has_pin' }` (ไม่เปิดเผยชื่อ)
  - `POST /api/student/set-pin` `{ zipgradeId, pin }` → ตั้ง PIN ด้วย `UPDATE ... WHERE id = ? AND pin_hash IS NULL` แล้วเช็กจำนวนแถวที่เปลี่ยน; สำเร็จ → สร้าง session + cookie → `{ ok: true }`; ถ้ามี PIN อยู่แล้ว → 409 `pin_already_set` "รหัสนี้ตั้ง PIN แล้ว กรุณาเข้าสู่ระบบด้วย PIN หรือแจ้งครูให้รีเซ็ต"
  - `POST /api/student/login` `{ zipgradeId, pin }` →
    - ล็อกอยู่ (`lockedUntil > now`) → 423 `locked` "พิมพ์ PIN ผิดหลายครั้ง กรุณารอ N นาที หรือแจ้งครู" (N ปัดขึ้น)
    - ยังไม่ตั้ง PIN → 409 `pin_not_set`
    - PIN ผิด → `failedAttempts + 1`; ครบ 5 → `lockedUntil = now + 15 นาที`, `failedAttempts = 0` → 401 `invalid_pin` "PIN ไม่ถูกต้อง (เหลืออีก N ครั้ง)"
    - ถูก → `failedAttempts = 0`, session + cookie → `{ ok: true, flaggedNewDevice }`
  - PIN ไม่ตรง `^\d{4}$` → 400 `invalid_pin_format` "PIN ต้องเป็นตัวเลข 4 หลัก" (ไม่นับเป็นความพยายามผิด)

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**
  - `it('lookup คนยังไม่ตั้ง PIN ได้ชื่อและห้อง')`
  - `it('lookup ด้วย " 0124 " หาเจอคนที่ ID 124')`
  - `it('lookup ไม่พบ / ถูกปิดใช้งาน ได้ 404')`
  - `it('ตั้ง PIN ครั้งแรกได้ cookie และ /api/me เป็นนักเรียนคนนั้น')`
  - `it('ตั้ง PIN พร้อมกัน 2 คำขอ สำเร็จ 1 ได้ 409 อีก 1')` — `Promise.all` สองคำขอ แล้วนับ status `[200, 409]`
  - `it('lookup หลังตั้ง PIN ได้ has_pin โดยไม่มีชื่อ')`
  - `it('ล็อกอินด้วย PIN ถูก')`, `it('PIN ผิด 5 ครั้ง → 423 แม้ PIN ถูก')`, `it('ผ่านไป 15 นาที (แก้ lockedUntil ใน DB) ล็อกอินได้')`
  - `it('PIN ผิดรูปแบบ 12a4 / 12345 / "" ได้ 400 และ failedAttempts ไม่เพิ่ม')`
  - `it('ล็อกอินจาก user-agent ใหม่ขณะมี session เดิม → flaggedNewDevice true')`
  - `it('คำขอที่ 61 ใน 1 นาทีจาก IP เดียวได้ 429')` — ตั้ง header `cf-connecting-ip`
- [ ] **Step 2: รัน → FAIL**
- [ ] **Step 3: เขียนโค้ด**
- [ ] **Step 4: รัน → PASS**
- [ ] **Step 5: Commit** `feat: student login with ZipGrade ID and PIN`

---

### Task 9: ครูจัดการนักเรียน (รายชื่อ, รีเซ็ต PIN, ปลดล็อก, เครื่องใหม่)

**Files:**
- Modify: `src/server/roster/service.ts` (+ `listStudents`), `src/server/roster/routes.ts`
- Test: `tests/student-admin.test.ts`

**Interfaces:**
- Produces:
  - `listStudents(db, classId): Promise<{ id; zipgradeId; title; firstName; lastName; sortOrder; active; pinSet: boolean; locked: boolean; activeSessions: number; newDeviceSessionIds: string[]; lastSeenAt: number | null }[]>` เรียง `sortOrder`
  - `GET /api/teacher/classes/:classId/students` → `{ class: { id, name, joinCode }, students }` (ไม่พบ → 404 `class_not_found`)
  - `POST /api/teacher/students/:id/reset-pin` → `pinHash = null`, `failedAttempts = 0`, `lockedUntil = null`, revoke ทุก session ของคนนั้น
  - `POST /api/teacher/students/:id/unlock` → `failedAttempts = 0`, `lockedUntil = null`
  - `POST /api/teacher/students/:id/logout-all` → revoke ทุก session
  - `POST /api/teacher/sessions/:id/ack` → `flaggedNewDevice = false`
  - ทุก route `requireTeacher`; ไม่พบนักเรียน → 404 `student_not_found`

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**
  - `it('รายชื่อห้องแสดง pinSet, locked, newDeviceSessionIds')`
  - `it('reset-pin แล้วนักเรียนตั้ง PIN ใหม่ได้ และ cookie เดิมใช้ไม่ได้')`
  - `it('unlock แล้วล็อกอินได้ทันที')`
  - `it('ack แล้ว newDeviceSessionIds ว่าง')`
  - `it('นักเรียนเรียก reset-pin ได้ 401')`
- [ ] **Step 2: รัน → FAIL**
- [ ] **Step 3: เขียนโค้ด**
- [ ] **Step 4: รัน → PASS**
- [ ] **Step 5: Commit** `feat: teacher student management API`

---

### Task 10: หน้าเว็บ M0 + E2E

**Files:**
- Create: `src/client/api.ts`, `src/client/pages/*.tsx` (6 หน้าตาม File Structure), `playwright.config.ts`, `tests/e2e/m0.spec.ts`
- Modify: `src/client/App.tsx`, `src/client/main.tsx`, `package.json` (+ script `e2e`)

**Interfaces:**
- Consumes: ทุก API ของ Task 6–9
- Produces:
  - `api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>` — `credentials: 'include'`; non-2xx → throw `ApiClientError { code, message, status }`
  - Routes (react-router declarative `<BrowserRouter>`):
    - `/` → `StudentLogin`: ขั้น 1 พิมพ์ ZipGrade ID (`inputMode="numeric"`) → `needs_pin`: การ์ด "นี่คือคุณใช่ไหม? {คำนำหน้า}{ชื่อ} {นามสกุล} · {ห้อง}" ปุ่ม "ใช่ ตั้ง PIN" / "ไม่ใช่"; ตั้ง PIN 4 หลัก 2 ครั้ง (ไม่ตรง → "PIN ไม่ตรงกัน") → `has_pin`: ช่อง PIN → สำเร็จไป `/me`; แสดง error message จาก API ตรง ๆ
    - `/me` → `StudentHome`: "สวัสดี {ชื่อ}" + ห้อง + กล่อง "งานของฉัน — เร็ว ๆ นี้" + ปุ่มออกจากระบบ (401 → กลับ `/`)
    - `/teacher/login` → `TeacherLogin`
    - `/teacher` → `TeacherHome`: การ์ดจัดกลุ่มตามโรงเรียน แต่ละห้องแสดงจำนวนนักเรียน, ตั้ง PIN แล้ว X/Y, join code; ปุ่ม "นำเข้ารายชื่อ"
    - `/teacher/import` → `TeacherImport`: เลือกไฟล์ `.csv` → อ่านด้วย `File.text()` → preview: สรุปตัวเลข + ตาราง คนใหม่ / เปลี่ยนแปลง / ไม่อยู่ในไฟล์ / **ควรตรวจสอบ** (แสดง flag เป็นข้อความไทย: `no_title` "ไม่มีคำนำหน้า", `duplicate_name` "ชื่อซ้ำในห้อง", `unusual_id` "รหัสผิดรูปแบบ", `missing_field` "ข้อมูลไม่ครบ") + errors; checkbox "ปิดใช้งานคนที่ไม่อยู่ในไฟล์" (ค่าเริ่มต้นไม่ติ๊ก); ปุ่ม "ยืนยันนำเข้า"
    - `/teacher/classes/:id` → `TeacherClass`: ตารางนักเรียน (ลำดับ, ZipGrade ID, ชื่อ, PIN ✓/–, ล็อก, ป้าย "เครื่องใหม่" + ปุ่มรับทราบ), ปุ่มต่อแถว: รีเซ็ต PIN (ยืนยันก่อน), ปลดล็อก, ออกจากระบบทุกเครื่อง
    - หน้า `/teacher*` ที่ได้ 401 → ไป `/teacher/login`
  - UI: Tailwind, mobile-first, ปุ่มใหญ่แตะง่าย, ฟอนต์ Noto Sans Thai
  - `playwright.config.ts`: `webServer` = `npm run db:migrate:local && npx vite --port 5173` พร้อม `.dev.vars` ที่สร้างในขั้นทดสอบ (`TEACHER_PASSWORD_HASH` ของ `teacher-pass`, `SESSION_SECRET=dev`); ใช้ Chromium ที่ติดตั้งไว้แล้ว

- [ ] **Step 1: เขียน E2E ที่ล้มเหลว** `tests/e2e/m0.spec.ts`
  - `test('ครูนำเข้ารายชื่อ แล้วนักเรียนตั้ง PIN และเข้าสู่ระบบ')`: ครูล็อกอิน `teacher-pass` → `/teacher/import` อัปโหลด `tests/fixtures/roster.sample.csv` → เห็น "คนใหม่ 7" และ "ควรตรวจสอบ 4" → ยืนยัน → `/teacher` เห็น "โรงเรียนทดสอบ" → (context ใหม่) นักเรียนพิมพ์ `1` → เห็น "เด็กหญิงสมใจ ใจดี" → ตั้ง PIN `2468` สองครั้ง → `/me` เห็น "สวัสดี สมใจ" → ออกจากระบบ → พิมพ์ `1` + PIN `2468` → เข้าได้
  - `test('ครูรีเซ็ต PIN แล้วนักเรียนต้องตั้งใหม่')`
- [ ] **Step 2: รัน `npm run e2e` → FAIL**
- [ ] **Step 3: เขียน `api.ts` และหน้าเว็บ**
- [ ] **Step 4: รัน `npm run e2e` → PASS; `npm test`, `npm run typecheck`, `npm run build` → ผ่านทั้งหมด**
- [ ] **Step 5: เปิดหน้าจอที่ความกว้าง 390px ด้วย Playwright ถ่ายภาพหน้า `/`, `/teacher`, `/teacher/import` ตรวจว่าไม่มี horizontal scroll**
- [ ] **Step 6: Commit** `feat: M0 web pages for teacher and student login`

---

### Task 11: Deploy + คู่มือ Cloudflare ภาษาไทย

**Files:**
- Create: `docs/deploy-cloudflare.md`, `.github/workflows/deploy.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: scripts ใน `package.json` (Task 1), `scripts/hash-password.mjs` (Task 3)

- [ ] **Step 1: เขียน `docs/deploy-cloudflare.md`** ครอบคลุมตามลำดับ (แต่ละขั้นมีคำสั่งที่ copy ได้ และผลลัพธ์ที่ควรเห็น):
  1. สมัคร Cloudflare (ฟรี) + ติดตั้ง Node 22
  2. `npx wrangler login`
  3. `npx wrangler d1 create classroom` → นำ `database_id` ไปใส่ `wrangler.jsonc`
  4. `npx wrangler r2 bucket create classroom-files` (ต้องเปิดใช้ R2 ในแดชบอร์ดก่อน — ฟรี 10GB แต่ Cloudflare อาจขอข้อมูลบัตร)
  5. `node scripts/hash-password.mjs '<รหัสผ่าน>'` → `npx wrangler secret put TEACHER_PASSWORD_HASH`; สุ่ม `SESSION_SECRET` (`openssl rand -base64 32`) → `npx wrangler secret put SESSION_SECRET`
  6. `npm run db:migrate:remote`
  7. `npm run deploy` → ได้ URL `https://classroom.<subdomain>.workers.dev`
  8. ล็อกอินครู → นำเข้า CSV จริงจาก ZipGrade ผ่านหน้าเว็บ
  9. การอัปเดตครั้งถัดไป (migrate + deploy), ดู log (`npx wrangler tail`), กู้ข้อมูลด้วย D1 Time Travel (`npx wrangler d1 time-travel restore classroom --timestamp=...`)
  10. (ตัวเลือก) deploy อัตโนมัติด้วย GitHub Actions: สร้าง API token แบบ "Edit Cloudflare Workers" + สิทธิ์ D1 Edit, ใส่ GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
  11. (ตัวเลือก) ผูกโดเมนของตัวเอง
  12. การทดลองในเครื่อง: `.dev.vars`, `npm run db:migrate:local`, `npm run dev`
- [ ] **Step 2: เขียน `.github/workflows/deploy.yml`**: on push `main` + `workflow_dispatch`; Node 22; `npm ci` → `npm test` → `npm run db:migrate:remote` → `npm run deploy`; env จาก secrets ข้างต้น
- [ ] **Step 3: ทดลองทำตามคู่มือส่วน "ทดลองในเครื่อง" จริงตั้งแต่ clone ใหม่** → หน้าเว็บเปิดได้และล็อกอินครูได้
- [ ] **Step 4: อัปเดต `README.md`**: แอปนี้คืออะไร + ลิงก์ไป spec, plan, คู่มือ deploy
- [ ] **Step 5: Commit** `docs: Cloudflare deploy guide and CI workflow`
