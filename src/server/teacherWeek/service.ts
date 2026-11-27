import { eq, sql } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import type { TeacherWeek, WeekItem } from '../../shared/teacherWeek'
import { weekOf } from '../../shared/workload'
import { newId, type Db } from '../db/client'
import { classes, teacherTodos } from '../db/schema'
import { apiError } from '../http'

const TZ = 7 * 3600_000
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`) - TZ
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const hhmm = (t: number) => new Date(t + TZ).toISOString().slice(11, 16)

/** ทุกอย่างของครูในช่วงวันที่ (รวมวันแรกและวันสุดท้าย) */
export async function teacherItems(db: Db, from: string, to: string): Promise<WeekItem[]> {
  const start = dayMs(from)
  const end = dayMs(to) + 86400_000
  const live = sql`c.archived = 0`
  const events = await db.all<{ id: string; kind: 'exam' | 'activity' | 'holiday'; title: string; date: string; period: string; classId: string; className: string }>(sql`
    SELECT e.id, e.kind, e.title, e.date, e.period, c.id AS classId, c.name AS className
    FROM calendar_events e JOIN classes c ON c.id = e.class_id WHERE e.date >= ${from} AND e.date <= ${to} AND ${live}`)
  // รายการสอบที่สร้างเอง (ไม่ได้ผ่านปฏิทิน) · ข้ามถ้ามีวันสอบชื่อเดียวกันในปฏิทินแล้ว
  const items = await db.all<{ id: string; title: string; date: string; classId: string; className: string }>(sql`
    SELECT i.id, i.title, i.taken_on AS date, c.id AS classId, c.name AS className
    FROM score_items i JOIN classes c ON c.id = i.class_id
    WHERE i.taken_on >= ${from} AND i.taken_on <= ${to} AND ${live} AND i.category != 'other'
      AND NOT EXISTS (SELECT 1 FROM calendar_events e WHERE e.class_id = i.class_id AND e.date = i.taken_on AND e.kind = 'exam' AND e.title = i.title)`)
  const due = await db.all<{ id: string; title: string; dueAt: number; classId: string; className: string }>(sql`
    SELECT a.id, a.title, a.due_at AS dueAt, c.id AS classId, c.name AS className
    FROM assignments a JOIN classes c ON c.id = a.class_id WHERE a.due_at >= ${start} AND a.due_at < ${end} AND ${live}`)
  const makeups = await db.all<{ id: string; mode: string; opensAt: number; name: string; title: string; classId: string; className: string }>(sql`
    SELECT m.id, m.mode, m.opens_at AS opensAt, st.first_name || ' ' || st.last_name AS name, i.title, c.id AS classId, c.name AS className
    FROM makeup_exams m JOIN score_items i ON i.id = m.score_item_id JOIN students st ON st.id = m.student_id JOIN classes c ON c.id = i.class_id
    WHERE m.status = 'approved' AND m.opens_at >= ${start} AND m.opens_at < ${end}`)
  const todos = await db.all<{ id: string; title: string; date: string; classId: string | null; className: string | null; doneAt: number | null }>(sql`
    SELECT t.id, t.title, t.date, t.class_id AS classId, c.name AS className, t.done_at AS doneAt
    FROM teacher_todos t LEFT JOIN classes c ON c.id = t.class_id WHERE t.date >= ${from} AND t.date <= ${to}`)
  const base = { done: false, time: '', url: null as string | null }
  return [
    ...events.map((e) => ({ ...base, kind: e.kind, id: e.id, title: e.title, date: e.date, time: e.period, className: e.className, classId: e.classId, url: '/teacher/calendar' })),
    ...items.map((i) => ({ ...base, kind: 'exam' as const, id: i.id, title: i.title, date: i.date, className: i.className, classId: i.classId, url: `/teacher/score-items/${i.id}` })),
    ...due.map((a) => ({ ...base, kind: 'due' as const, id: a.id, title: a.title, date: todayBangkok(a.dueAt), time: hhmm(a.dueAt), className: a.className, classId: a.classId, url: `/teacher/classes/${a.classId}/gradebook` })),
    ...makeups.map((m) => ({ ...base, kind: 'makeup' as const, id: m.id, title: `${m.title} · ${m.name}${m.mode === 'paper' ? ' (ออนไซต์ — เตรียมข้อสอบกระดาษ)' : ' (ออนไลน์)'}`, date: todayBangkok(m.opensAt), time: hhmm(m.opensAt), className: m.className, classId: m.classId, url: `/teacher/makeup-exams/${m.id}` })),
    ...todos.map((t) => ({ ...base, kind: 'todo' as const, id: t.id, title: t.title, date: t.date, className: t.className ?? '', classId: t.classId, done: t.doneAt !== null })),
  ]
}

const ORDER: Record<WeekItem['kind'], number> = { holiday: 0, exam: 1, makeup: 2, todo: 3, activity: 4, due: 5 }

/** ปฏิทินรายสัปดาห์ (เสาร์–ศุกร์) ของสัปดาห์ที่มีวันที่ date */
export async function teacherWeek(db: Db, date: string, today: string = todayBangkok(Date.now())): Promise<TeacherWeek> {
  const { from, to } = weekOf(date)
  const all = await teacherItems(db, from, to)
  // สัปดาห์นี้: สิ่งที่ต้องทำที่ยังค้างจากสัปดาห์ก่อน ๆ ย้ายมาแสดงที่วันนี้ (ไม่ลืม)
  if (today >= from && today <= to) {
    const old = await db.all<{ id: string; title: string; date: string; classId: string | null; className: string | null }>(sql`
      SELECT t.id, t.title, t.date, t.class_id AS classId, c.name AS className FROM teacher_todos t LEFT JOIN classes c ON c.id = t.class_id
      WHERE t.done_at IS NULL AND t.date < ${from} ORDER BY t.date LIMIT 50`)
    const th = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' })
    all.push(...old.map((t) => ({ kind: 'todo' as const, id: t.id, title: t.title, date: today, time: `ค้างจาก ${th.format(Date.parse(`${t.date}T00:00:00Z`))}`, className: t.className ?? '', classId: t.classId, url: null, done: false })))
  }
  const days = Array.from({ length: 7 }, (_, i) => addDay(from, i)).map((d) => ({
    date: d,
    items: all.filter((x) => x.date === d).sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || Number(a.done) - Number(b.done) || a.time.localeCompare(b.time)),
  }))
  return { from, to, days }
}

export async function createTodo(db: Db, p: { title: string; date: string; classId: string | null }, t: number): Promise<string> {
  if (p.classId) {
    const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, p.classId))
    if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  }
  const id = newId()
  await db.insert(teacherTodos).values({ id, title: p.title, date: p.date, classId: p.classId, createdAt: t })
  return id
}
export async function updateTodo(db: Db, id: string, p: { title?: string; date?: string; done?: boolean }, t: number): Promise<void> {
  const res = await db
    .update(teacherTodos)
    .set({ ...(p.title !== undefined ? { title: p.title } : {}), ...(p.date !== undefined ? { date: p.date } : {}), ...(p.done !== undefined ? { doneAt: p.done ? t : null } : {}) })
    .where(eq(teacherTodos.id, id))
    .returning({ id: teacherTodos.id })
  if (!res.length) throw apiError('todo_not_found', 'ไม่พบรายการนี้', 404)
}
export async function deleteTodo(db: Db, id: string): Promise<void> {
  await db.delete(teacherTodos).where(eq(teacherTodos.id, id))
}

/** ข้อความแจ้งเตือนครู: สอบ/สอบย้อนหลังออนไซต์/สิ่งที่ยังไม่ได้ทำ ของวันที่ date (ไม่มี = null) */
export async function planSummary(db: Db, date: string): Promise<{ count: number; body: string } | null> {
  const items = (await teacherItems(db, date, date)).filter((x) => (x.kind === 'todo' && !x.done) || x.kind === 'exam' || (x.kind === 'makeup' && x.title.includes('ออนไซต์')))
  if (!items.length) return null
  const label = (x: WeekItem) => (x.kind === 'exam' ? `สอบ ${x.title} (${x.className})` : x.kind === 'makeup' ? `สอบย้อนหลัง ${x.title.split(' (')[0]}` : x.title)
  return { count: items.length, body: items.slice(0, 4).map(label).join(' · ') + (items.length > 4 ? ` · และอีก ${items.length - 4}` : '') }
}
