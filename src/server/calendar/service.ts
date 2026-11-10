import { eq, sql } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import { EVENT_LABEL, monthRange, type CalendarItem, type EventInput } from '../../shared/calendar'
import { newId, type Db } from '../db/client'
import { calendarEvents, classes } from '../db/schema'
import { apiError } from '../http'

export const eventNotFound = () => apiError('event_not_found', 'ไม่พบรายการนี้ในปฏิทิน', 404)
const TZ = 7 * 3600_000
/** ช่วงเวลา (ms) ของวันแรก 00:00 ถึงวันสุดท้าย 24:00 เวลาไทย */
const msRange = (from: string, to: string) => ({ start: Date.parse(`${from}T00:00:00Z`) - TZ, end: Date.parse(`${to}T00:00:00Z`) - TZ + 86400_000 })

export async function createEvents(db: Db, classIds: string[], input: EventInput, t: number): Promise<string[]> {
  const unique = [...new Set(classIds)]
  for (const id of unique) {
    const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, id))
    if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  }
  const rows = unique.map((classId) => ({ id: newId(), classId, ...input, createdAt: t }))
  for (const r of rows) await db.insert(calendarEvents).values(r)
  return rows.map((r) => r.id)
}

export async function updateEvent(db: Db, id: string, input: EventInput): Promise<void> {
  const res = await db.update(calendarEvents).set(input).where(eq(calendarEvents.id, id)).returning({ id: calendarEvents.id })
  if (!res.length) throw eventNotFound()
}

export async function deleteEvent(db: Db, id: string): Promise<void> {
  const res = await db.delete(calendarEvents).where(eq(calendarEvents.id, id)).returning({ id: calendarEvents.id })
  if (!res.length) throw eventNotFound()
}

/** รายการในเดือน: กิจกรรมที่ครูเพิ่ม + กำหนดส่งงาน · classId = null คือทุกห้อง (ครู) · studentId = ใส่สถานะการส่งงาน */
export async function calendarMonth(db: Db, month: string, opts: { classId: string | null; studentId?: string }): Promise<CalendarItem[]> {
  const { from, to } = monthRange(month)
  const { start, end } = msRange(from, to)
  const byClass = opts.classId ? sql`AND c.id = ${opts.classId}` : sql``
  const events = await db.all<{ id: string; kind: 'exam' | 'activity' | 'holiday'; title: string; date: string; period: string; detail: string; classId: string; className: string }>(sql`
    SELECT e.id, e.kind, e.title, e.date, e.period, e.detail, c.id AS classId, c.name AS className
    FROM calendar_events e JOIN classes c ON c.id = e.class_id
    WHERE e.date >= ${from} AND e.date <= ${to} ${byClass} ORDER BY e.date, e.created_at`)
  const due = await db.all<{ id: string; title: string; dueAt: number; classId: string; className: string; status: string | null }>(sql`
    SELECT a.id, a.title, a.due_at AS dueAt, c.id AS classId, c.name AS className,
      ${opts.studentId ? sql`(SELECT s.status FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = ${opts.studentId})` : sql`NULL`} AS status
    FROM assignments a JOIN classes c ON c.id = a.class_id
    WHERE a.published = 1 AND a.due_at >= ${start} AND a.due_at < ${end} ${byClass} ORDER BY a.due_at`)
  const items: CalendarItem[] = [
    ...events.map((e) => ({ type: 'event' as const, ...e })),
    ...due.map((a) => ({
      type: 'due' as const,
      id: a.id,
      title: a.title,
      date: todayBangkok(a.dueAt),
      dueAt: a.dueAt,
      classId: a.classId,
      className: a.className,
      ...(opts.studentId ? { status: (a.status ?? 'missing') as Extract<CalendarItem, { type: 'due' }>['status'] } : {}),
    })),
  ]
  return items.sort((x, y) => x.date.localeCompare(y.date) || (x.type === 'due' ? 1 : 0) - (y.type === 'due' ? 1 : 0))
}

/** เย็นวันก่อน (ตั้งแต่ 16:00 เวลาไทย): แจ้ง "พรุ่งนี้…" ให้นักเรียนในห้อง · ครั้งเดียวต่อรายการต่อคน */
export async function enqueueEventReminders(db: Db, t: number): Promise<number> {
  const hour = new Date(t + TZ).getUTCHours()
  if (hour < 16) return 0
  const tomorrow = todayBangkok(t + 86400_000)
  const res = await db.run(sql`
    INSERT INTO notifications (id, student_id, title, body, url, dedupe_key, created_at)
    SELECT lower(hex(randomblob(13))), st.id,
      CASE e.kind WHEN 'exam' THEN '📝 พรุ่งนี้สอบ: ' WHEN 'holiday' THEN '🏖️ พรุ่งนี้วันหยุด: ' ELSE '📅 พรุ่งนี้: ' END || e.title,
      trim(e.period || ' ' || e.detail), '/me/calendar', 'ev:' || e.id || ':' || st.id, ${t}
    FROM calendar_events e JOIN students st ON st.class_id = e.class_id AND st.active = 1
    WHERE e.date = ${tomorrow}
    ON CONFLICT DO NOTHING`)
  return res.meta.changes ?? 0
}

export const eventNoticeTitle = (kind: keyof typeof EVENT_LABEL, title: string, date: string) =>
  `📅 ${EVENT_LABEL[kind]}: ${title} · ${new Date(`${date}T12:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`

