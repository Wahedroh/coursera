# ผู้ช่วยครู — ระบบจัดการชั้นเรียน

เว็บแอปสำหรับครู 1 คนที่สอนหลายโรงเรียน: นำเข้ารายชื่อจาก ZipGrade, นักเรียนเข้าระบบด้วย ZipGrade ID + PIN,
มอบหมาย/ส่ง/ตรวจงาน, เช็กชื่อ + แต้ม/EXP, บันทึกคะแนนสอบ และกิจกรรมไลฟ์หน้าห้อง
ทำงานบน Cloudflare (Workers + D1 + R2) แพ็กเกจฟรี

**สถานะ:** M0 ฐานระบบ — ล็อกอินครู, นำเข้ารายชื่อ, ล็อกอินนักเรียน, จัดการ PIN

## เอกสาร
- สเปก: [docs/superpowers/specs/2026-10-25-classroom-assistant-design.md](docs/superpowers/specs/2026-10-25-classroom-assistant-design.md)
- แผน M0: [docs/superpowers/plans/2026-10-25-m0-foundation.md](docs/superpowers/plans/2026-10-25-m0-foundation.md)
- **คู่มือ deploy ขึ้น Cloudflare (ภาษาไทย):** [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md)

## คำสั่งที่ใช้บ่อย
```bash
npm ci                    # ติดตั้ง
npm run db:migrate:local  # สร้างตารางในฐานข้อมูลจำลอง
npm run dev               # เปิดในเครื่อง http://localhost:5173 (ต้องมี .dev.vars ดูคู่มือข้อ 12)
npm test                  # unit + integration
npm run e2e               # ทดสอบผ่านเบราว์เซอร์
npm run deploy            # build + deploy
```

> ไฟล์ CSV รายชื่อนักเรียนเป็นข้อมูลส่วนบุคคล ห้าม commit ลง git (`.gitignore` กันไว้แล้ว)
