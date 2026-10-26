import { and, eq, gte, lte } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { type AttendanceDay, type AttendanceRange, type AttendanceStatus } from '../../shared/attendance'
import { EXP_RULES } from '../../shared/points'
import { newId, now, type Db } from '../db/client'
import { attendanceDays, attendanceRecords, classes, students } from '../db/schema'
import { hmacSha256Hex } from '../auth/crypto'
import { apiError } from '../http'

const CHUNK = 10 // ≤ 100 ตัวแปรต่อคำสั่งของ D1

/** ให้/ถอน EXP มาเรียนจากสถานะที่บันทึกจริงในฐานข้อมูล (ไม่ใช้ id ที่สร้างฝั่งแอป) — ทนต่อคำขอซ้อนกัน */
function syncExp(db: Db, dayId: string, date: string, t: number, studentId?: string): D1PreparedStatement[] {
  const d1 = db.$client
  const who = studentId ?? '%'
  return [
    d1
      .prepare(
        `INSERT INTO point_events (id, student_id, delta, reason, source, ref_id, created_at)
         SELECT lower(hex(randomblob(13))), r.student_id, ?, ?, 'attendance', r.id, ?
         FROM attendance_records r WHERE r.day_id = ? AND r.student_id LIKE ? AND r.status IN ('present', 'late')
         ON CONFLICT DO NOTHING`,
      )
      .bind(EXP_RULES.attendance, `มาเรียน ${date}`, t, dayId, who),
    d1
      .prepare(
        `DELETE FROM point_events WHERE source = 'attendance' AND ref_id IN (
           SELECT r.id FROM attendance_records r WHERE r.day_id = ? AND r.student_id LIKE ? AND r.status NOT IN ('present', 'late'))`,
      )
      .bind(dayId, who),
  ]
}

async function runBatches(db: Db, stmts: BatchItem<'sqlite'>[]) {
  for (let i = 0; i < stmts.length; i += 50) {
    const part = stmts.slice(i, i + 50)
    if (part.length) await db.batch(part as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
}

export async function getDayByDate(db: Db, classId: string, date: string): Promise<AttendanceDay> {
  const [day] = await db.select({ id: attendanceDays.id }).from(attendanceDays).where(and(eq(attendanceDays.classId, classId), eq(attendanceDays.date, date)))
  return day ? getDay(db, day.id) : { day: null, records: [] }
}

/** เริ่มเช็กชื่อวันหนึ่ง (สร้างวัน + ทุกคนเป็น present) — ทำซ้ำได้ */
export async function openDay(db: Db, classId: string, date: string): Promise<AttendanceDay> {
  const [cls] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, classId))
  if (!cls) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const t = now()
  await db.insert(attendanceDays).values({ id: newId(), classId, date, createdAt: t }).onConflictDoNothing()
  const [day] = await db.select().from(attendanceDays).where(and(eq(attendanceDays.classId, classId), eq(attendanceDays.date, date)))
  const roster = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
  const existing = new Set(
    (await db.select({ studentId: attendanceRecords.studentId }).from(attendanceRecords).where(eq(attendanceRecords.dayId, day.id))).map((r) => r.studentId),
  )
  const missing = roster.filter((s) => !existing.has(s.id)).map((s) => ({ id: newId(), dayId: day.id, studentId: s.id, status: 'present' as const, source: 'teacher' as const, updatedAt: t }))
  const stmts: BatchItem<'sqlite'>[] = []
  for (let i = 0; i < missing.length; i += CHUNK) stmts.push(db.insert(attendanceRecords).values(missing.slice(i, i + CHUNK)).onConflictDoNothing())
  await runBatches(db, stmts)
  await db.$client.batch(syncExp(db, day.id, date, t))
  return getDay(db, day.id)
}

export async function getDay(db: Db, dayId: string): Promise<AttendanceDay> {
  const [day] = await db.select().from(attendanceDays).where(eq(attendanceDays.id, dayId))
  if (!day) throw apiError('day_not_found', 'ไม่พบวันเช็กชื่อ', 404)
  const records = await db
    .select({
      studentId: students.id,
      zipgradeId: students.zipgradeId,
      title: students.title,
      firstName: students.firstName,
      lastName: students.lastName,
      status: attendanceRecords.status,
      source: attendanceRecords.source,
    })
    .from(attendanceRecords)
    .innerJoin(students, eq(attendanceRecords.studentId, students.id))
    .where(and(eq(attendanceRecords.dayId, dayId), eq(students.classId, day.classId), eq(students.active, true)))
    .orderBy(students.sortOrder, students.zipgradeId)
  return { day: { id: day.id, date: day.date, selfCheckinOpen: day.selfCheckinOpen }, records }
}

export async function setStatus(db: Db, dayId: string, studentId: string, status: AttendanceStatus, source: 'teacher' | 'self'): Promise<void> {
  const [day] = await db.select().from(attendanceDays).where(eq(attendanceDays.id, dayId))
  if (!day) throw apiError('day_not_found', 'ไม่พบวันเช็กชื่อ', 404)
  const [st] = await db.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), eq(students.classId, day.classId)))
  if (!st) throw apiError('student_not_found', 'ไม่พบนักเรียน', 404)
  const t = now()
  // upsert + ปรับ EXP ในคำสั่งชุดเดียว (atomic)
  await db.$client.batch([
    db.$client
      .prepare(
        `INSERT INTO attendance_records (id, day_id, student_id, status, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(day_id, student_id) DO UPDATE SET status = excluded.status, source = excluded.source, updated_at = excluded.updated_at`,
      )
      .bind(newId(), dayId, studentId, status, source, t),
    ...syncExp(db, dayId, day.date, t, studentId),
  ])
}

export async function attendanceRange(db: Db, classId: string, from: string, to: string): Promise<AttendanceRange> {
  const roster = await db
    .select({ id: students.id, zipgradeId: students.zipgradeId, title: students.title, firstName: students.firstName, lastName: students.lastName })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(students.sortOrder, students.zipgradeId)
  const rows = await db
    .select({ date: attendanceDays.date, studentId: attendanceRecords.studentId, status: attendanceRecords.status })
    .from(attendanceRecords)
    .innerJoin(attendanceDays, eq(attendanceRecords.dayId, attendanceDays.id))
    .where(and(eq(attendanceDays.classId, classId), gte(attendanceDays.date, from), lte(attendanceDays.date, to)))
  const days = [...new Set(rows.map((r) => r.date))].sort()
  const cells: AttendanceRange['cells'] = {}
  const totals: AttendanceRange['totals'] = {}
  for (const s of roster) {
    cells[s.id] = {}
    totals[s.id] = { present: 0, late: 0, sick: 0, leave: 0, absent: 0 }
  }
  for (const r of rows) {
    if (!cells[r.studentId]) continue
    cells[r.studentId][r.date] = r.status
    totals[r.studentId][r.status]++
  }
  return { days, students: roster, cells, totals }
}

export const CHECKIN_WINDOW_MS = 30_000

export async function checkinToken(secret: string, dayId: string, window: number): Promise<string> {
  return (await hmacSha256Hex(secret, `checkin:${dayId}:${window}`)).slice(0, 16)
}

export async function currentQr(db: Db, secret: string, dayId: string) {
  const [day] = await db.select({ id: attendanceDays.id }).from(attendanceDays).where(eq(attendanceDays.id, dayId))
  if (!day) throw apiError('day_not_found', 'ไม่พบวันเช็กชื่อ', 404)
  const window = Math.floor(now() / CHECKIN_WINDOW_MS)
  const token = await checkinToken(secret, dayId, window)
  const expiresAt = (window + 1) * CHECKIN_WINDOW_MS
  // ttlMs ให้เครื่องฉายตั้งเวลาเองโดยไม่ต้องพึ่งนาฬิกาของเครื่อง
  return { url: `/checkin?d=${encodeURIComponent(dayId)}&t=${token}`, expiresAt, ttlMs: Math.max(1, expiresAt - now()) }
}

export async function setSelfCheckin(db: Db, dayId: string, open: boolean): Promise<void> {
  const res = await db.update(attendanceDays).set({ selfCheckinOpen: open }).where(eq(attendanceDays.id, dayId)).returning({ id: attendanceDays.id })
  if (!res.length) throw apiError('day_not_found', 'ไม่พบวันเช็กชื่อ', 404)
}

export async function studentCheckin(db: Db, secret: string, p: { dayId: string; token: string; studentId: string; classId: string }) {
  const invalid = () => apiError('invalid_checkin', 'QR หมดอายุหรือไม่ถูกต้อง ให้สแกนใหม่จากจอหน้าห้อง', 400)
  const [day] = await db
    .select({ id: attendanceDays.id, date: attendanceDays.date, open: attendanceDays.selfCheckinOpen, className: classes.name })
    .from(attendanceDays)
    .innerJoin(classes, eq(attendanceDays.classId, classes.id))
    .where(and(eq(attendanceDays.id, p.dayId), eq(attendanceDays.classId, p.classId)))
  if (!day || !day.open) throw invalid()
  const w = Math.floor(now() / CHECKIN_WINDOW_MS)
  const valid = [await checkinToken(secret, day.id, w), await checkinToken(secret, day.id, w - 1)]
  if (!valid.includes(p.token)) throw invalid()
  await setStatus(db, day.id, p.studentId, 'present', 'self')
  return { status: 'present' as const, className: day.className, date: day.date }
}
