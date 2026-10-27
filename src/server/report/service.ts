import { eq } from 'drizzle-orm'
import { ATTENDANCE_STATUSES, todayBangkok, type AttendanceStatus } from '../../shared/attendance'
import { outstanding } from '../../shared/fees'
import type { ClassReport } from '../../shared/report'
import type { Db } from '../db/client'
import { feeCharges, feeItems } from '../db/schema'
import { gradebook } from '../assignments/service'
import { attendanceRange } from '../attendance/service'
import { classGrades } from '../grades/service'
import { scoreBook } from '../scores/service'

/** รายงานรายบุคคลทั้งห้อง: เช็กชื่อทั้งเทอม · งาน · คะแนนสอบ · คะแนนสะสม/เกรดคาดการณ์ · ค่าเอกสารค้าง */
export async function classReport(db: Db, classId: string, t: number): Promise<ClassReport> {
  const gb = await gradebook(db, classId)
  const book = await scoreBook(db, classId)
  const grades = await classGrades(db, classId)
  const att = await attendanceRange(db, classId, '2000-01-01', todayBangkok(t))
  const fees = await db
    .select({ studentId: feeCharges.studentId, amount: feeCharges.amount, paid: feeCharges.paid })
    .from(feeCharges)
    .innerJoin(feeItems, eq(feeCharges.itemId, feeItems.id))
    .where(eq(feeItems.classId, classId))
  const owed = new Map<string, number>()
  for (const f of fees) owed.set(f.studentId, Math.round(((owed.get(f.studentId) ?? 0) + outstanding(f)) * 100) / 100)
  const g = new Map(grades.students.map((s) => [s.id, s]))
  const zero = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, 0])) as Record<AttendanceStatus, number>
  return {
    class: gb.class,
    generatedAt: t,
    maxTotal: grades.maxTotal,
    classSize: gb.students.length,
    students: gb.students.map((s) => ({
      id: s.id,
      zipgradeId: s.zipgradeId,
      name: `${s.title ?? ''}${s.firstName} ${s.lastName}`.trim(),
      attendance: { ...zero, ...att.totals[s.id] },
      assignments: gb.assignments.map((a) => ({ title: a.title, maxScore: a.maxScore, dueAt: a.dueAt, status: s.cells[a.id].status, score: s.cells[a.id].score })),
      exams: book.items.map((i) => ({ title: i.title, takenOn: i.takenOn, maxScore: i.maxScore, score: book.cells[s.id]?.[i.id]?.score ?? null, absent: book.cells[s.id]?.[i.id]?.absent ?? false })),
      total: g.get(s.id)?.total ?? 0,
      grade: g.get(s.id)?.grade ?? null,
      rank: g.get(s.id)?.rank ?? null,
      feeOutstanding: owed.get(s.id) ?? 0,
    })),
  }
}
