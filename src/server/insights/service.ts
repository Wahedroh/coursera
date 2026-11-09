import { sql } from 'drizzle-orm'
import { todayBangkok, type AttendanceStatus } from '../../shared/attendance'
import type { ClassCompare, ClassInsights } from '../../shared/insights'
import { weekStartBangkok } from '../../shared/quests'
import { OPEN_END } from '../../shared/terms'
import type { Db } from '../db/client'
import { apiError } from '../http'
import { termWindow } from '../terms/service'

const pct = (x: number, of: number) => (of > 0 ? Math.round((x / of) * 1000) / 10 : null)
const dateRange = (start: number, end: number, t: number) => ({ from: todayBangkok(start), to: todayBangkok(end === OPEN_END ? t : end - 1) })
const mondayOf = (date: string) => todayBangkok(weekStartBangkok(Date.parse(`${date}T12:00:00+07:00`)))

export async function classInsights(db: Db, classId: string, t: number, termId?: string): Promise<ClassInsights> {
  const [cls] = await db.all<{ id: string; name: string }>(sql`SELECT id, name FROM classes WHERE id = ${classId}`)
  if (!cls) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const { term, start, end } = await termWindow(db, termId)
  const { from, to } = dateRange(start, end, t)
  const [{ n: students }] = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM students WHERE class_id = ${classId} AND active = 1`)

  const att = await db.all<{ date: string; status: AttendanceStatus; n: number }>(sql`
    SELECT d.date AS date, r.status AS status, count(*) AS n FROM attendance_records r
    JOIN attendance_days d ON d.id = r.day_id JOIN students st ON st.id = r.student_id
    WHERE d.class_id = ${classId} AND st.active = 1 AND d.date >= ${from} AND d.date <= ${to}
    GROUP BY d.date, r.status`)
  const weeks = new Map<string, ClassInsights['attendanceWeeks'][number]>()
  for (const r of att) {
    const w = mondayOf(r.date)
    const row = weeks.get(w) ?? weeks.set(w, { week: w, present: 0, late: 0, sick: 0, leave: 0, absent: 0 }).get(w)!
    row[r.status] += r.n
  }

  const asg = await db.all<{ id: string; title: string; dueAt: number | null; maxScore: number; onTime: number; late: number; done: number; avgScore: number | null }>(sql`
    SELECT a.id, a.title, a.due_at AS dueAt, a.max_score AS maxScore,
      count(s.id) FILTER (WHERE s.status != 'returned' AND (a.due_at IS NULL OR s.submitted_at <= a.due_at)) AS onTime,
      count(s.id) FILTER (WHERE s.status != 'returned' AND a.due_at IS NOT NULL AND s.submitted_at > a.due_at) AS late,
      count(s.id) FILTER (WHERE s.status != 'returned') AS done,
      avg(s.score) FILTER (WHERE s.status = 'graded') AS avgScore
    FROM assignments a
    LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id IN (SELECT id FROM students WHERE class_id = ${classId} AND active = 1)
    WHERE a.class_id = ${classId} AND a.created_at >= ${start} AND a.created_at < ${end}
    GROUP BY a.id ORDER BY coalesce(a.due_at, a.created_at)`)

  const items = await db.all<{ id: string; title: string; takenOn: string; maxScore: number }>(sql`
    SELECT id, title, taken_on AS takenOn, max_score AS maxScore FROM score_items
    WHERE class_id = ${classId} AND created_at >= ${start} AND created_at < ${end} ORDER BY taken_on, created_at`)
  const raw = items.length
    ? await db.all<{ itemId: string; score: number }>(sql`
        SELECT sc.item_id AS itemId, sc.score AS score FROM scores sc
        JOIN score_items i ON i.id = sc.item_id JOIN students st ON st.id = sc.student_id
        WHERE i.class_id = ${classId} AND i.created_at >= ${start} AND i.created_at < ${end} AND st.active = 1 AND sc.score IS NOT NULL`)
    : []
  const exams = items.map((i) => {
    const ps = raw.filter((r) => r.itemId === i.id).map((r) => (i.maxScore > 0 ? (r.score / i.maxScore) * 100 : 0))
    const buckets = Array(10).fill(0) as number[]
    for (const p of ps) buckets[Math.min(9, Math.max(0, Math.floor(p / 10)))]++
    const round = (x: number) => Math.round(x * 10) / 10
    return {
      id: i.id,
      title: i.title,
      takenOn: i.takenOn,
      n: ps.length,
      avgPct: ps.length ? round(ps.reduce((a, b) => a + b, 0) / ps.length) : null,
      minPct: ps.length ? round(Math.min(...ps)) : null,
      maxPct: ps.length ? round(Math.max(...ps)) : null,
      buckets,
    }
  })

  return {
    class: cls,
    term: term.name,
    students,
    attendanceWeeks: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    assignments: asg.map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      onTime: a.onTime,
      late: a.late,
      missing: Math.max(0, students - a.done),
      avgPct: a.avgScore === null || !a.maxScore ? null : Math.round((a.avgScore / a.maxScore) * 1000) / 10,
    })),
    exams,
  }
}

/** เทียบทุกห้องในเทอมปัจจุบัน: % มาเรียน · % ส่งงาน (งานที่เลยกำหนดแล้ว) · คะแนนสอบเฉลี่ย % */
export async function compareClasses(db: Db, t: number): Promise<ClassCompare> {
  const { term, start, end } = await termWindow(db)
  const { from } = dateRange(start, end, t)
  const rows = await db.all<{ id: string; name: string; students: number; present: number; records: number; done: number; expected: number; examSum: number | null; examN: number }>(sql`
    SELECT c.id, c.name,
      (SELECT count(*) FROM students st WHERE st.class_id = c.id AND st.active = 1) AS students,
      (SELECT count(*) FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id JOIN students st ON st.id = r.student_id
        WHERE d.class_id = c.id AND st.active = 1 AND d.date >= ${from} AND r.status IN ('present', 'late')) AS present,
      (SELECT count(*) FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id JOIN students st ON st.id = r.student_id
        WHERE d.class_id = c.id AND st.active = 1 AND d.date >= ${from}) AS records,
      (SELECT count(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN students st ON st.id = s.student_id
        WHERE a.class_id = c.id AND st.active = 1 AND st.class_id = c.id AND a.created_at >= ${start} AND a.due_at IS NOT NULL AND a.due_at < ${t} AND s.status != 'returned') AS done,
      (SELECT count(*) FROM assignments a JOIN students st ON st.class_id = a.class_id AND st.active = 1
        WHERE a.class_id = c.id AND a.created_at >= ${start} AND a.due_at IS NOT NULL AND a.due_at < ${t}) AS expected,
      (SELECT sum(sc.score * 100.0 / i.max_score) FROM scores sc JOIN score_items i ON i.id = sc.item_id JOIN students st ON st.id = sc.student_id
        WHERE i.class_id = c.id AND st.active = 1 AND i.created_at >= ${start} AND sc.score IS NOT NULL AND i.max_score > 0) AS examSum,
      (SELECT count(*) FROM scores sc JOIN score_items i ON i.id = sc.item_id JOIN students st ON st.id = sc.student_id
        WHERE i.class_id = c.id AND st.active = 1 AND i.created_at >= ${start} AND sc.score IS NOT NULL AND i.max_score > 0) AS examN
    FROM classes c WHERE c.archived = 0 ORDER BY c.name`)
  return {
    term: term.name,
    classes: rows
      .filter((r) => r.students > 0)
      .map((r) => ({
        id: r.id,
        name: r.name,
        students: r.students,
        attendancePct: pct(r.present, r.records),
        submitPct: pct(r.done, r.expected),
        examPct: r.examN ? Math.round(((r.examSum ?? 0) / r.examN) * 10) / 10 : null,
      })),
  }
}
