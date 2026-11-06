# สำรองและกู้คืนข้อมูล

## สำรองอัตโนมัติ

- GitHub Actions `Backup database` (`.github/workflows/backup.yml`) export ฐานข้อมูล D1 `classroom` ทั้งหมดเป็น `.sql.gz`
  แล้วเก็บใน R2 bucket **`classroom-backups`** (ส่วนตัว ไม่เปิดสาธารณะ) ที่ `db/YYYY-MM-DD-HHMM.sql.gz`
- รัน **ทุกวันอาทิตย์ 02:00 น. เวลาไทย** · รันเองได้: GitHub → Actions → Backup database → Run workflow
- เก็บย้อนหลัง **180 วัน** (กฎ lifecycle ของ bucket ลบไฟล์เก่าให้เอง)
- ครูดูวันที่สำรองล่าสุดและดาวน์โหลดได้ที่เมนู **พื้นที่ไฟล์** (ถ้าเกิน 9 วันจะขึ้นสีแดง)
- **ไม่รวม** รูปงานและไฟล์เอกสารเรียนใน `classroom-files` (รูปงานถูกลบเป็นระยะอยู่แล้ว)
- ไม่ใช้ artifact ของ GitHub เพราะ repo เป็นสาธารณะ — ไฟล์สำรองมีข้อมูลนักเรียน
- token `CLOUDFLARE_API_TOKEN` ต้องมีสิทธิ์ D1 (Edit) และ R2 (Edit) — ถ้า workflow ล้มที่ขั้น Upload ให้เพิ่มสิทธิ์ R2 ให้ token

## กู้คืน

ข้อมูลผิดภายใน 7 วัน ใช้ D1 Time Travel ก่อน (ย้อนได้ถึงระดับนาที):

```bash
npx wrangler d1 time-travel info classroom
npx wrangler d1 time-travel restore classroom --timestamp=2026-11-06T09:00:00+07:00
```

เกิน 7 วัน ใช้ไฟล์สำรอง — **กู้ลงฐานข้อมูลใหม่ก่อนเสมอ** ตรวจแล้วค่อยสลับ:

```bash
gunzip classroom-2026-11-01-0200.sql.gz             # ได้ classroom-2026-11-01-0200.sql
npx wrangler d1 create classroom-restore            # จด database_id ที่ได้
npx wrangler d1 execute classroom-restore --remote --file classroom-2026-11-01-0200.sql
npx wrangler d1 execute classroom-restore --remote --command "SELECT count(*) FROM students"
```

- สลับทั้งระบบ: แก้ `database_id` ใน `wrangler.jsonc` เป็นของ `classroom-restore` → commit เข้า main (deploy อัตโนมัติ)
- กู้บางส่วน (เช่น คะแนนรายการเดียว): ดึงแถวจาก `classroom-restore` ด้วย `SELECT` แล้ว `INSERT` กลับเข้า `classroom`
