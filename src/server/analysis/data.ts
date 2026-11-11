import { sql } from 'drizzle-orm'
import { todayBangkok, type AttendanceStatus } from '../../shared/attendance'
import { OPEN_END, type TermWindow } from '../../shared/terms'
import type { Db } from '../db/client'
import { classGrades } from '../grades/service'
import { apiError } from '../http'

/** ข้อมูลทั้งเทอมของห้อง (ดึงทีละตาราง ไม่กี่คำสั่ง — เพดาน D1 50 คำสั่งต่อคำขอ) */
export async function loadClassTerm(db: Db, classId: string, w: TermWindow, t: number) {
  const [cls] = await db.all<{ id: string; name: string }>(sql`SELECT id, name FROM classes WHERE id = ${classId}`)
  if (!cls) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const { start, end } = w
  const from = todayBangkok(start)
  const to = todayBangkok(end === OPEN_END ? t : end - 1)
  const roster = await db.all<{ id: string; zipgradeId: string; title: string | null; firstName: string; lastName: string; avatar: string | null; nickname: string | null }>(sql`
    SELECT s.id, s.zipgrade_id AS zipgradeId, s.title, s.first_name AS firstName, s.last_name AS lastName, a.config AS avatar, a.nickname
    FROM students s LEFT JOIN student_avatars a ON a.student_id = s.id
    WHERE s.class_id = ${classId} AND s.active = 1 ORDER BY s.sort_order, s.zipgrade_id`)
  const assignments = await db.all<{ id: string; title: string; dueAt: number | null; maxScore: number; createdAt: number }>(sql`
    SELECT id, title, due_at AS dueAt, max_score AS maxScore, created_at AS createdAt FROM assignments
    WHERE class_id = ${classId} AND published = 1 AND created_at >= ${start} AND created_at < ${end} ORDER BY coalesce(due_at, created_at)`)
  const subs = await db.all<{ assignmentId: string; studentId: string; status: string; submittedAt: number; score: number | null; onPaper: number }>(sql`
    SELECT s.assignment_id AS assignmentId, s.student_id AS studentId, s.status, s.submitted_at AS submittedAt, s.score, s.on_paper AS onPaper
    FROM submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE a.class_id = ${classId} AND a.created_at >= ${start} AND a.created_at < ${end}`)
  const items = await db.all<{ id: string; title: string; maxScore: number; takenOn: string; published: number; category: string }>(sql`
    SELECT id, title, max_score AS maxScore, taken_on AS takenOn, published, category FROM score_items
    WHERE class_id = ${classId} AND created_at >= ${start} AND created_at < ${end} ORDER BY taken_on, created_at`)
  const scores = await db.all<{ itemId: string; studentId: string; score: number | null; absent: number }>(sql`
    SELECT sc.item_id AS itemId, sc.student_id AS studentId, sc.score, sc.absent FROM scores sc JOIN score_items i ON i.id = sc.item_id
    WHERE i.class_id = ${classId} AND i.created_at >= ${start} AND i.created_at < ${end}`)
  const attendance = await db.all<{ studentId: string; date: string; status: AttendanceStatus }>(sql`
    SELECT r.student_id AS studentId, d.date, r.status FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id
    WHERE d.class_id = ${classId} AND d.date >= ${from} AND d.date <= ${to}`)
  const events = await db.all<{ studentId: string; source: string; n: number; exp: number }>(sql`
    SELECT p.student_id AS studentId, p.source, count(*) AS n, sum(p.delta) AS exp FROM point_events p JOIN students s ON s.id = p.student_id
    WHERE s.class_id = ${classId} AND p.created_at >= ${start} AND p.created_at < ${end} GROUP BY p.student_id, p.source`)
  const [{ videos }] = await db.all<{ videos: number }>(sql`SELECT count(*) AS videos FROM videos WHERE class_id = ${classId} AND published = 1`)
  const cards = await db.all<{ studentId: string; answer: number; questions: string; qIndex: number }>(sql`
    SELECT a.student_id AS studentId, a.answer, g.questions, a.q_index AS qIndex FROM card_answers a JOIN card_games g ON g.id = a.game_id
    WHERE g.class_id = ${classId} AND g.created_at >= ${start} AND g.created_at < ${end}`)
  const notes = await db.all<{ studentId: string; note: string }>(sql`
    SELECT n.student_id AS studentId, n.note FROM student_notes n JOIN students s ON s.id = n.student_id WHERE s.class_id = ${classId} AND n.term_id = ${w.term.id}`)
  const grades = await classGrades(db, classId, w)
  return { cls, w, from, to, roster, assignments, subs, items, scores, attendance, events, videos, cards, notes, grades }
}
export type ClassTerm = Awaited<ReturnType<typeof loadClassTerm>>

const pct = (x: number, of: number) => (of > 0 ? Math.round((x / of) * 1000) / 10 : null)

/** ตัวชี้วัดของนักเรียน 1 คนจากข้อมูลทั้งห้อง */
export function studentMetrics(d: ClassTerm, studentId: string, t: number) {
  const att = d.attendance.filter((a) => a.studentId === studentId)
  const cnt: Record<AttendanceStatus, number> = { present: 0, late: 0, sick: 0, leave: 0, absent: 0 }
  for (const a of att) cnt[a.status]++
  const absentDates = att.filter((a) => a.status === 'absent').map((a) => a.date).sort()
  const mySubs = new Map(d.subs.filter((s) => s.studentId === studentId).map((s) => [s.assignmentId, s]))
  const asg = d.assignments.map((a) => {
    const s = mySubs.get(a.id)
    const submitted = !!s && s.status !== 'returned'
    const late = submitted && a.dueAt !== null && s!.submittedAt > a.dueAt
    const due = a.dueAt !== null && a.dueAt < t
    const status = submitted ? (s!.status === 'graded' ? 'graded' : late ? 'late' : 'submitted') : s?.status === 'returned' ? 'returned' : due ? 'missing' : 'pending'
    return { id: a.id, title: a.title, dueAt: a.dueAt, maxScore: a.maxScore, status, late, score: s?.status === 'graded' ? s.score : null }
  })
  const graded = asg.filter((a) => a.score !== null && a.maxScore > 0)
  const exams = d.items.map((i) => {
    const s = d.scores.find((x) => x.itemId === i.id && x.studentId === studentId)
    const all = d.scores.filter((x) => x.itemId === i.id && x.score !== null && i.maxScore > 0).map((x) => (x.score! / i.maxScore) * 100)
    return {
      id: i.id,
      title: i.title,
      takenOn: i.takenOn,
      maxScore: i.maxScore,
      published: !!i.published,
      score: s?.score ?? null,
      absent: !!s?.absent,
      pct: s?.score != null && i.maxScore > 0 ? Math.round((s.score / i.maxScore) * 1000) / 10 : null,
      classAvg: all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : null,
    }
  })
  const examPcts = exams.filter((e) => e.pct !== null).map((e) => e.pct!)
  const ev = (src: string) => d.events.find((e) => e.studentId === studentId && e.source === src)
  const exp = d.events.filter((e) => e.studentId === studentId).reduce((n, e) => n + e.exp, 0)
  const cardRows = d.cards.filter((c) => c.studentId === studentId)
  const cardCorrect = cardRows.filter((c) => (JSON.parse(c.questions) as { answer: number }[])[c.qIndex]?.answer === c.answer).length
  const g = d.grades.students.find((s) => s.id === studentId)
  const records = att.length
  return {
    attendance: { ...cnt, records, pct: pct(cnt.present + cnt.late, records), absentDates },
    assignments: {
      list: asg,
      due: asg.filter((a) => a.status !== 'pending').length,
      done: asg.filter((a) => ['graded', 'submitted', 'late'].includes(a.status)).length,
      missing: asg.filter((a) => a.status === 'missing' || a.status === 'returned'),
      late: asg.filter((a) => a.late).length,
      avgPct: graded.length ? Math.round((graded.reduce((n, a) => n + a.score! / a.maxScore, 0) / graded.length) * 1000) / 10 : null,
    },
    exams: { list: exams, avgPct: examPcts.length ? Math.round((examPcts.reduce((a, b) => a + b, 0) / examPcts.length) * 10) / 10 : null, absent: exams.filter((e) => e.absent).length },
    videos: { watched: ev('video')?.n ?? 0, total: d.videos },
    quests: ev('quest')?.n ?? 0,
    cards: { answered: cardRows.length, correct: cardCorrect, pct: pct(cardCorrect, cardRows.length) },
    exp,
    grade: g ? { total: g.total, maxTotal: d.grades.maxTotal, grade: g.grade, rank: g.rank } : null,
    note: d.notes.find((n) => n.studentId === studentId)?.note ?? '',
  }
}
export type StudentMetrics = ReturnType<typeof studentMetrics>
