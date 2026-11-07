import { sql } from 'drizzle-orm'
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '../../shared/attendance'
import { EXP_PER_LEVEL, levelOf } from '../../shared/points'
import type { StudentStats } from '../../shared/stats'
import { listForStudent } from '../assignments/service'
import type { Db } from '../db/client'
import { scoresForStudent } from '../scores/service'
import { studentExp } from './service'

export async function expSummary(db: Db, studentId: string) {
  const exp = await studentExp(db, studentId)
  const level = levelOf(exp)
  return { exp, level, nextLevelAt: (level + 1) * EXP_PER_LEVEL }
}

/** มาเรียน · ส่งงาน · คะแนนสอบที่เผยแพร่แล้ว (เป็น %) — ใช้ข้อมูลที่มีอยู่ ไม่มีของเพื่อน */
export async function studentStats(db: Db, studentId: string, classId: string, t: number): Promise<StudentStats> {
  const rows = await db.all<{ status: AttendanceStatus; n: number }>(sql`
    SELECT r.status AS status, count(*) AS n FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id
    WHERE r.student_id = ${studentId} AND d.class_id = ${classId} GROUP BY r.status`)
  const attendance = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, 0])) as Record<AttendanceStatus, number>
  for (const r of rows) attendance[r.status] = r.n
  const asg = await listForStudent(db, studentId, classId)
  const a = { total: asg.length, onTime: 0, late: 0, missing: 0, notDue: 0 }
  for (const x of asg) {
    if (x.status === 'missing' || x.status === 'returned' || !x.submission) {
      if (x.dueAt !== null && x.dueAt < t) a.missing++
      else a.notDue++
    } else if (x.dueAt !== null && x.submission.submittedAt > x.dueAt) a.late++
    else a.onTime++
  }
  const exams = (await scoresForStudent(db, studentId, classId)).map((s) => ({
    title: s.title,
    takenOn: s.takenOn,
    absent: s.absent,
    pct: s.score === null ? null : Math.round((s.score / s.maxScore) * 100),
  }))
  return { ...(await expSummary(db, studentId)), attendance, assignments: a, exams }
}
