import { and, desc, eq, gte, lte, ne } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import { LEAVE_LABEL, leaveDatesOk, type LeaveInput, type LeaveItem, type TeacherLeaveItem, type TeacherLeaves } from '../../shared/leave'
import { setStatus } from '../attendance/service'
import { newId, type Db } from '../db/client'
import { attendanceDays, classes, leaveRequests, students } from '../db/schema'
import { apiError } from '../http'
import { enqueue } from '../push/service'
import { notifyTeacher } from '../teacherNotify/service'

const thaiDay = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const fmtDay = (d: string) => thaiDay.format(Date.parse(`${d}T00:00:00Z`))
export const leaveRange = (x: { from: string; to: string }) => (x.from === x.to ? fmtDay(x.from) : `${fmtDay(x.from)}–${fmtDay(x.to)}`)

const cols = {
  id: leaveRequests.id,
  kind: leaveRequests.kind,
  from: leaveRequests.fromDate,
  to: leaveRequests.toDate,
  reason: leaveRequests.reason,
  imageKey: leaveRequests.imageKey,
  status: leaveRequests.status,
  teacherNote: leaveRequests.teacherNote,
  createdAt: leaveRequests.createdAt,
  decidedAt: leaveRequests.decidedAt,
}

export async function createLeave(db: Db, p: { studentId: string; classId: string; input: LeaveInput; t: number }): Promise<LeaveItem> {
  const { input, studentId, classId, t } = p
  if (!leaveDatesOk(input, todayBangkok(t))) throw apiError('invalid_dates', 'ลาย้อนหลังได้ไม่เกิน 14 วัน และล่วงหน้าไม่เกิน 60 วัน', 400)
  // รูปต้องเป็นรูปที่นักเรียนคนนี้อัปโหลดเอง
  if (input.imageKey && !input.imageKey.startsWith(`sub/${studentId}/`)) throw apiError('invalid_image', 'รูปไม่ถูกต้อง', 400)
  const [st] = await db.select({ firstName: students.firstName, lastName: students.lastName }).from(students).where(eq(students.id, studentId))
  const id = newId()
  await db.insert(leaveRequests).values({ id, studentId, classId, kind: input.kind, fromDate: input.from, toDate: input.to, reason: input.reason, imageKey: input.imageKey, createdAt: t })
  await notifyTeacher(db, { kind: 'leave', title: `📝 ใบ${LEAVE_LABEL[input.kind]}: ${st?.firstName ?? ''} ${st?.lastName ?? ''} · ${leaveRange(input)}`, body: input.reason, url: '/teacher/leaves', dedupeKey: `leave:${id}` }, t)
  return { id, kind: input.kind, from: input.from, to: input.to, reason: input.reason, imageKey: input.imageKey, status: 'pending', teacherNote: '', createdAt: t, decidedAt: null }
}

export async function listStudentLeaves(db: Db, studentId: string): Promise<LeaveItem[]> {
  return db.select(cols).from(leaveRequests).where(eq(leaveRequests.studentId, studentId)).orderBy(desc(leaveRequests.createdAt)).limit(30)
}

/** นักเรียนยกเลิกใบลาที่ครูยังไม่ได้ตัดสิน */
export async function cancelLeave(db: Db, studentId: string, id: string): Promise<void> {
  const [row] = await db.select({ status: leaveRequests.status }).from(leaveRequests).where(and(eq(leaveRequests.id, id), eq(leaveRequests.studentId, studentId)))
  if (!row) throw apiError('leave_not_found', 'ไม่พบใบลา', 404)
  if (row.status !== 'pending') throw apiError('leave_decided', 'ครูพิจารณาแล้ว ยกเลิกไม่ได้', 409)
  await db.delete(leaveRequests).where(eq(leaveRequests.id, id))
}

const teacherCols = { ...cols, studentId: students.id, firstName: students.firstName, lastName: students.lastName, zipgradeId: students.zipgradeId, classId: classes.id, className: classes.name }
type TeacherRow = Omit<TeacherLeaveItem, 'studentName'> & { firstName: string; lastName: string }
const toTeacher = ({ firstName, lastName, ...r }: TeacherRow): TeacherLeaveItem => ({ ...r, studentName: `${firstName} ${lastName}`.trim() })

export async function teacherLeaves(db: Db): Promise<TeacherLeaves> {
  const base = () => db.select(teacherCols).from(leaveRequests).innerJoin(students, eq(students.id, leaveRequests.studentId)).innerJoin(classes, eq(classes.id, leaveRequests.classId))
  const pending = await base().where(eq(leaveRequests.status, 'pending')).orderBy(leaveRequests.fromDate, leaveRequests.createdAt)
  const recent = await base().where(ne(leaveRequests.status, 'pending')).orderBy(desc(leaveRequests.decidedAt)).limit(30)
  return { pending: pending.map(toTeacher), recent: recent.map(toTeacher) }
}

export async function pendingLeaveCount(db: Db): Promise<number> {
  return (await db.select({ id: leaveRequests.id }).from(leaveRequests).where(eq(leaveRequests.status, 'pending'))).length
}

/** ครูอนุมัติ/ไม่อนุมัติ · อนุมัติแล้วใส่สถานะป่วย/ลาให้วันที่เช็กชื่อแล้วในช่วงนั้น (วันที่ยังไม่เช็ก จะใส่ให้ตอนเปิดเช็กชื่อ) */
export async function decideLeave(db: Db, id: string, approve: boolean, note: string, t: number): Promise<{ applied: number }> {
  const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id))
  if (!row) throw apiError('leave_not_found', 'ไม่พบใบลา', 404)
  await db
    .update(leaveRequests)
    .set({ status: approve ? 'approved' : 'rejected', teacherNote: note, decidedAt: t })
    .where(eq(leaveRequests.id, id))
  let applied = 0
  if (approve) {
    const days = await db
      .select({ id: attendanceDays.id })
      .from(attendanceDays)
      .where(and(eq(attendanceDays.classId, row.classId), gte(attendanceDays.date, row.fromDate), lte(attendanceDays.date, row.toDate)))
    for (const d of days) {
      await setStatus(db, d.id, row.studentId, row.kind, 'teacher')
      applied++
    }
  }
  const what = `ใบ${LEAVE_LABEL[row.kind]} ${leaveRange({ from: row.fromDate, to: row.toDate })}`
  await enqueue(db, [{ studentId: row.studentId, title: approve ? `✅ ครูอนุมัติ${what}` : `❌ ครูไม่อนุมัติ${what}`, body: note, url: '/me/leave', dedupeKey: `leave:${id}:${approve ? 'ok' : 'no'}` }], t)
  return { applied }
}
