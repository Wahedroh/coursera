import { and, eq, sql } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import { absencesLeft, attendancePct, MIN_ATTENDANCE_PCT } from '../../shared/remedial'
import { pointsForBands, type StudentHomeCards } from '../../shared/studentHome'
import { slotActiveOn } from '../../shared/timetable'
import { addDays } from '../../shared/leave'
import type { Db } from '../db/client'
import { remedials, timetableSlots } from '../db/schema'
import { classGrades, getGrading } from '../grades/service'
import { isPaused } from '../timetable/service'
import { termWindow } from '../terms/service'
import { closedChecker } from '../workload/service'

const LOOKAHEAD_DAYS = 14
const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+07:00`)
const weekdayOf = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1

/** คาบถัดไปของห้อง (ตามตารางสอนที่ใช้ในวันนั้น ข้ามวันที่โรงเรียนปิด รวมคาบสอนชดเชย) */
async function nextClass(db: Db, classId: string, t: number) {
  if (await isPaused(db)) return null
  const today = todayBangkok(t)
  const last = addDays(today, LOOKAHEAD_DAYS)
  const slots = await db.select().from(timetableSlots).where(eq(timetableSlots.classId, classId))
  const makeups = await db.all<{ date: string; start: string; end: string; mode: string; meetUrl: string | null; note: string }>(sql`
    SELECT date, start, "end", mode, meet_url AS meetUrl, note FROM makeup_classes WHERE class_id = ${classId} AND date >= ${today} AND date <= ${last}`)
  if (!slots.length && !makeups.length) return null
  const closed = await closedChecker(db, today, last)
  for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
    const d = addDays(today, i)
    const found: { start: number; end: number; online: boolean; meetUrl: string | null; note: string }[] = []
    if (!closed(classId, d))
      for (const s of slots) if (s.weekday === weekdayOf(d) && slotActiveOn(s, d)) found.push({ start: at(d, s.start), end: at(d, s.end), online: false, meetUrl: null, note: '' })
    for (const m of makeups) if (m.date === d) found.push({ start: at(d, m.start), end: at(d, m.end), online: m.mode === 'online', meetUrl: m.meetUrl, note: m.note })
    const left = found.filter((x) => x.end > t).sort((a, b) => a.start - b.start)
    if (left.length) return left[0]
  }
  return null
}

export async function studentHomeCards(db: Db, studentId: string, classId: string, t: number): Promise<StudentHomeCards> {
  const { start } = await termWindow(db)
  const from = todayBangkok(start)
  const nx = await nextClass(db, classId, t)
  const due = nx
    ? await db.all<{ id: string; title: string; dueAt: number }>(sql`
        SELECT a.id, a.title, a.due_at AS dueAt FROM assignments a
        LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ${studentId}
        WHERE a.class_id = ${classId} AND a.published = 1 AND a.due_at > ${t} AND a.due_at <= ${nx.end} AND (s.id IS NULL OR s.status = 'returned')
          AND NOT EXISTS (SELECT 1 FROM assignment_closed x WHERE x.assignment_id = a.id AND x.student_id = ${studentId})
        ORDER BY a.due_at`)
    : []

  const [att] = await db.all<{ days: number; present: number; late: number; sick: number; leave: number; absent: number }>(sql`
    SELECT count(*) AS days, coalesce(sum(r.status = 'present'), 0) AS present, coalesce(sum(r.status = 'late'), 0) AS late, coalesce(sum(r.status = 'sick'), 0) AS sick,
      coalesce(sum(r.status = 'leave'), 0) AS leave, coalesce(sum(r.status = 'absent'), 0) AS absent
    FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id WHERE r.student_id = ${studentId} AND d.class_id = ${classId} AND d.date >= ${from}`)

  let target: StudentHomeCards['target'] = null
  if ((await getGrading(db, classId)).visible) {
    const g = await classGrades(db, classId)
    const me = g.students.find((s) => s.id === studentId)
    if (me && g.maxTotal > 0) {
      const pending = await db.all<{ id: string; title: string; maxScore: number; dueAt: number | null }>(sql`
        SELECT a.id, a.title, a.max_score AS maxScore, a.due_at AS dueAt FROM assignments a
        LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ${studentId}
        WHERE a.class_id = ${classId} AND a.published = 1 AND a.created_at >= ${start} AND (s.id IS NULL OR s.status = 'returned')
          AND NOT EXISTS (SELECT 1 FROM assignment_closed x WHERE x.assignment_id = a.id AND x.student_id = ${studentId})
        ORDER BY a.due_at IS NULL, a.due_at LIMIT 8`)
      target = {
        grade: me.grade,
        bands: pointsForBands(
          me.total,
          g.students.filter((s) => s.id !== studentId).map((s) => s.total),
          g.settings.bands,
        ).map((b) => ({ grade: b.grade, gap: b.gap, pct: b.need > 0 ? Math.min(100, Math.round((me.total / b.need) * 100)) : 100 })),
        pending,
      }
    }
  }

  const feedback = await db.all<StudentHomeCards['feedback'][number]>(sql`
    SELECT a.id AS assignmentId, a.title, s.status, s.score, a.max_score AS maxScore, s.comment, coalesce(s.graded_at, s.updated_at) AS at
    FROM submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE s.student_id = ${studentId} AND a.class_id = ${classId} AND s.status IN ('graded', 'returned') AND s.on_paper = 0 AND a.created_at >= ${start}
    ORDER BY at DESC LIMIT 3`)

  const rem = await db
    .select({ id: remedials.id, title: remedials.title, status: remedials.status, dueAt: remedials.dueAt, decidedAt: remedials.decidedAt })
    .from(remedials)
    .where(and(eq(remedials.studentId, studentId), eq(remedials.classId, classId)))
  // งานซ่อมที่ผ่านแล้วแสดงต่ออีก 7 วัน
  const remedialsShown = rem.filter((r) => r.status !== 'passed' || (r.decidedAt ?? 0) > t - 7 * 86400_000).map(({ decidedAt: _, ...r }) => r)

  return {
    next: nx ? { ...nx, now: nx.start <= t, due } : null,
    attendance: { ...att, pct: attendancePct(att.days, att.absent), left: absencesLeft(att.days, att.absent), min: MIN_ATTENDANCE_PCT },
    target,
    feedback,
    remedials: remedialsShown,
  }
}
