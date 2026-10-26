import { and, eq, gte, lte } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { EARNS_EXP, type AttendanceDay, type AttendanceRange, type AttendanceStatus } from '../../shared/attendance'
import { EXP_RULES } from '../../shared/points'
import { newId, now, type Db } from '../db/client'
import { attendanceDays, attendanceRecords, classes, pointEvents, students } from '../db/schema'
import { apiError } from '../http'

const CHUNK = 10 // ≤ 100 ตัวแปรต่อคำสั่งของ D1

function expStatements(db: Db, recordId: string, studentId: string, date: string, status: AttendanceStatus, t: number): BatchItem<'sqlite'> {
  return EARNS_EXP.includes(status)
    ? db
        .insert(pointEvents)
        .values({ id: newId(), studentId, delta: EXP_RULES.attendance, reason: `มาเรียน ${date}`, source: 'attendance', refId: recordId, createdAt: t })
        .onConflictDoNothing()
    : db.delete(pointEvents).where(and(eq(pointEvents.source, 'attendance'), eq(pointEvents.refId, recordId)))
}

async function runBatches(db: Db, stmts: BatchItem<'sqlite'>[]) {
  for (let i = 0; i < stmts.length; i += 50) {
    const part = stmts.slice(i, i + 50)
    if (part.length) await db.batch(part as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
}

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
  for (const r of missing) stmts.push(expStatements(db, r.id, r.studentId, date, 'present', t))
  await runBatches(db, stmts)
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
  await db
    .insert(attendanceRecords)
    .values({ id: newId(), dayId, studentId, status, source, updatedAt: t })
    .onConflictDoUpdate({ target: [attendanceRecords.dayId, attendanceRecords.studentId], set: { status, source, updatedAt: t } })
  const [rec] = await db
    .select({ id: attendanceRecords.id })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.dayId, dayId), eq(attendanceRecords.studentId, studentId)))
  await db.batch([expStatements(db, rec.id, studentId, day.date, status, t)])
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
