# คู่มือ deploy "ผู้ช่วยครู" ขึ้น Cloudflare

> **ทางลัด:** ไม่อยากใช้ terminal ไปที่ [ข้อ 10](#10-deploy-อัตโนมัติด้วย-github-actions-ไม่ต้องใช้-terminal) ได้เลย

คู่มือนี้พาตั้งแต่สมัครบัญชีจนได้เว็บที่นักเรียนใช้งานได้จริง ใช้ **แพ็กเกจฟรี** ของ Cloudflare ทั้งหมด
(Workers 100,000 คำขอ/วัน, D1 5GB, R2 10GB — เกินพอสำหรับนักเรียน ~300–500 คน)

ทุกคำสั่งรันในโฟลเดอร์โปรเจกต์ (ที่มีไฟล์ `package.json`)

---

## 0. เตรียมเครื่อง

1. ติดตั้ง **Node.js 22** จาก https://nodejs.org (เลือก LTS)
2. ตรวจว่าติดตั้งแล้ว:
   ```bash
   node -v   # ควรเห็น v22.x.x
   ```
3. ดาวน์โหลดโค้ด (clone) แล้วติดตั้งแพ็กเกจ:
   ```bash
   git clone https://github.com/Wahedroh/coursera.git
   cd coursera
   npm ci
   ```

## 1. สมัคร Cloudflare

1. สมัครที่ https://dash.cloudflare.com/sign-up (ใช้อีเมล ฟรี)
2. ยืนยันอีเมล

## 2. ล็อกอิน wrangler (เครื่องมือของ Cloudflare)

```bash
npx wrangler login
```
เบราว์เซอร์จะเปิดขึ้นมา กด **Allow** → กลับมาที่ terminal ควรเห็น `Successfully logged in`

## 3. สร้างฐานข้อมูล D1

```bash
npx wrangler d1 create classroom
```
ผลลัพธ์จะมีบรรทัดประมาณนี้:
```
"database_id": "a1b2c3d4-...."
```
เปิดไฟล์ `wrangler.jsonc` แล้วแทนค่า `"database_id": "00000000-0000-0000-0000-000000000000"` ด้วยค่าที่ได้

## 4. สร้างที่เก็บไฟล์ R2 (ข้ามได้ — ใช้ตั้งแต่ M1 สำหรับรูปงาน)

1. ในแดชบอร์ด Cloudflare เลือกเมนู **R2 Object Storage** → กดเปิดใช้งาน
   (ฟรี 10GB แต่ Cloudflare อาจขอข้อมูลบัตรเพื่อยืนยันตัวตน — ไม่ถูกเก็บเงินถ้าใช้ไม่เกินโควตา)
2. สร้าง bucket:
   ```bash
   npx wrangler r2 bucket create classroom-files
   ```
   ควรเห็น `Created bucket 'classroom-files'`

## 5. ตั้งรหัสผ่านครูและ secret

1. สร้าง hash ของรหัสผ่านครู (เปลี่ยน `รหัสผ่านของครู` เป็นรหัสที่ต้องการ อย่างน้อย 10 ตัวอักษร):
   ```bash
   node scripts/hash-password.mjs 'รหัสผ่านของครู'
   ```
   จะได้ข้อความขึ้นต้นด้วย `pbkdf2-sha256$100000$...` — คัดลอกไว้
2. บันทึกเป็น secret (ระบบจะถามให้วางค่า):
   ```bash
   npx wrangler secret put TEACHER_PASSWORD_HASH
   ```
3. สร้าง secret สุ่มสำหรับ session:
   ```bash
   openssl rand -base64 32 | npx wrangler secret put SESSION_SECRET
   ```
   (Windows ที่ไม่มี `openssl`: พิมพ์ข้อความสุ่มยาว ๆ อะไรก็ได้ตอนระบบถาม)

> secret เก็บไว้ที่ Cloudflare เท่านั้น ไม่อยู่ในโค้ดหรือ GitHub

## 6. สร้างตารางในฐานข้อมูล

```bash
npm run db:migrate:remote
```
ระบบจะถามยืนยัน กด `y` → ควรเห็น `✅` ข้างชื่อไฟล์ migration

## 7. Deploy

```bash
npm run deploy
```
บรรทัดท้าย ๆ จะมี URL ของเว็บ เช่น
```
https://classroom.<ชื่อบัญชี>.workers.dev
```

## 8. เริ่มใช้งาน

1. เปิด `https://classroom.<ชื่อบัญชี>.workers.dev/teacher/login` → ใส่รหัสผ่านครู
2. กด **นำเข้ารายชื่อ** → เลือกไฟล์ CSV ที่ export จาก ZipGrade (Students → Export)
3. ตรวจรายการ "ควรตรวจสอบ" → กด **ยืนยันนำเข้า**
4. ให้นักเรียนเปิด `https://classroom.<ชื่อบัญชี>.workers.dev` → พิมพ์ ZipGrade ID → ยืนยันชื่อ → ตั้ง PIN 4 หลัก
   แนะนำให้ทุกคนตั้ง PIN ในคาบแรกพร้อมกัน

## 9. งานประจำ

| ต้องการ | คำสั่ง |
|---|---|
| อัปเดตเว็บหลังได้โค้ดใหม่ | `git pull && npm ci && npm run db:migrate:remote && npm run deploy` |
| ดู log สด (เวลามีปัญหา) | `npx wrangler tail` |
| กู้ฐานข้อมูลย้อนหลัง (แพ็กเกจฟรีย้อนได้ 7 วัน) | `npx wrangler d1 time-travel restore classroom --timestamp=2026-10-25T08:00:00+07:00` |
| ดูข้อมูลการใช้งาน/โควตา | แดชบอร์ด → Workers & Pages → classroom |

> **สำรองข้อมูล:** Time Travel ของแพ็กเกจฟรีย้อนได้แค่ 7 วัน ควรกด "ส่งออกทั้งหมด" เก็บไฟล์ Excel ไว้เองทุกสัปดาห์ (ปุ่มนี้มาใน M1)

> **ข้อมูลนักเรียนเป็นข้อมูลส่วนบุคคล (PDPA)** — อย่า commit ไฟล์ CSV ลง git (โปรเจกต์ตั้ง `.gitignore` กันไว้แล้ว) และอย่าแชร์รหัสผ่านครู

## 10. Deploy อัตโนมัติด้วย GitHub Actions (ไม่ต้องใช้ terminal)

ฐานข้อมูล D1 `classroom` สร้างและมีตารางครบแล้ว (`database_id` อยู่ใน `wrangler.jsonc`) — วิธีนี้แทนข้อ 0–7 ได้ทั้งหมด
เมื่อมีโค้ดเข้า branch `main` (หรือกด Run workflow) GitHub จะทดสอบ → migrate → deploy → ตั้งรหัสครูให้เอง

1. **สร้าง API token:** แดชบอร์ด Cloudflare → รูปโปรไฟล์ → **My Profile → API Tokens → Create Token**
   → เทมเพลต **Edit Cloudflare Workers** → เพิ่มสิทธิ์ **Account · D1 · Edit** → Continue → Create Token → คัดลอก token (เห็นครั้งเดียว)
2. **หา Account ID:** แดชบอร์ด → **Workers & Pages** → ด้านขวามี **Account ID** → คัดลอก
3. **ใส่ secret ใน GitHub:** repo → **Settings → Secrets and variables → Actions → New repository secret** เพิ่ม 4 ค่า:

   | ชื่อ | ค่า |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | token จากข้อ 1 |
   | `CLOUDFLARE_ACCOUNT_ID` | Account ID จากข้อ 2 |
   | `TEACHER_PASSWORD` | รหัสผ่านครูที่ต้องการ (อย่างน้อย 10 ตัวอักษร) — ระบบเก็บเป็น hash บน Cloudflare |
   | `SESSION_SECRET` | ข้อความสุ่มยาว ๆ อะไรก็ได้ (เช่น พิมพ์มั่ว ๆ 40 ตัว) — เปลี่ยนเมื่อไรทุกคนจะถูกออกจากระบบ |

4. **สั่ง deploy:** repo → แท็บ **Actions → Deploy to Cloudflare → Run workflow** (หรือ merge โค้ดเข้า `main`)
5. รอประมาณ 2–3 นาที เปิดขั้นตอน **Run npm run deploy** จะเห็น URL เช่น `https://classroom.<ชื่อบัญชี>.workers.dev` → ไปข้อ 8

ถ้าขั้น **Check secrets** แดง แปลว่ายังใส่ secret ไม่ครบ

## 11. (ตัวเลือก) ใช้โดเมนของตัวเอง

ถ้ามีโดเมนที่ย้ายมาอยู่ Cloudflare แล้ว: แดชบอร์ด → Workers & Pages → classroom → **Settings → Domains & Routes → Add → Custom domain** → ใส่ เช่น `class.example.com`

## 12. ทดลองในเครื่องตัวเองก่อน deploy

1. สร้างไฟล์ `.dev.vars` (ไฟล์นี้ไม่ถูก commit):
   ```bash
   echo "TEACHER_PASSWORD_HASH=\"$(node scripts/hash-password.mjs teacher-pass)\"" > .dev.vars
   echo 'SESSION_SECRET="dev"' >> .dev.vars
   ```
2. สร้างตารางในฐานข้อมูลจำลองในเครื่อง:
   ```bash
   npm run db:migrate:local
   ```
3. เปิดเซิร์ฟเวอร์:
   ```bash
   npm run dev
   ```
4. เปิด http://localhost:5173/teacher/login รหัสผ่าน `teacher-pass`

คำสั่งตรวจคุณภาพโค้ด: `npm test` (unit/integration), `npm run e2e` (ทดสอบผ่านเบราว์เซอร์ ต้องรัน `npx playwright install chromium` ครั้งแรก), `npm run typecheck`
