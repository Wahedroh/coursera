import { eq, sql } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import { weekStartBangkok } from '../../shared/quests'
import { bangkokClock, currentSlot, nextClassStart, slotTimes, upcomingSlots, type PublishInput, type Slot, type SlotInput } from '../../shared/timetable'
import { newId, type Db } from '../db/client'
import { classes, settings, timetableSlots } from '../db/schema'
import { apiError } from '../http'

const PAUSE_KEY = 'timetable_paused'

export async function listSlots(db: Db): Promise<Slot[]> {
  return db
    .select({ id: timetableSlots.id, classId: timetableSlots.classId, weekday: timetableSlots.weekday, start: timetableSlots.start, end: timetableSlots.end })
    .from(timetableSlots)
    .innerJoin(classes, eq(classes.id, timetableSlots.classId))
    .where(eq(classes.archived, false))
    .orderBy(timetableSlots.weekday, timetableSlots.start)
}

export async function addSlot(db: Db, input: SlotInput, t: number): Promise<string> {
  const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, input.classId))
  if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const clash = (await listSlots(db)).find((s) => s.weekday === input.weekday && s.start < input.end && input.start < s.end)
  if (clash) throw apiError('slot_overlap', 'เวลานี้ซ้อนกับคาบอื่นในวันเดียวกัน', 409)
  const id = newId()
  await db.insert(timetableSlots).values({ id, ...input, createdAt: t })
  return id
}

export async function deleteSlot(db: Db, id: string): Promise<void> {
  const r = await db.delete(timetableSlots).where(eq(timetableSlots.id, id)).returning({ id: timetableSlots.id })
  if (!r.length) throw apiError('slot_not_found', 'ไม่พบคาบนี้', 404)
}

export async function isPaused(db: Db): Promise<boolean> {
  const [r] = await db.select().from(settings).where(eq(settings.key, PAUSE_KEY))
  return r?.value === 'true'
}
export async function setPaused(db: Db, paused: boolean): Promise<void> {
  const value = paused ? 'true' : 'false'
  await db.insert(settings).values({ key: PAUSE_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

export type TimetableNow = {
  paused: boolean
  hasSlots: boolean
  current: (Slot & { startAt: number; endAt: number }) | null
  upcoming: (Slot & { startAt: number; endAt: number })[]
  /** คาบที่ผ่านไปแล้วในสัปดาห์นี้แต่ยังไม่ได้เช็กชื่อ */
  missingAttendance: { classId: string; date: string; weekday: number }[]
  /** คาบนี้: วันนี้เปิดเช็กชื่อแล้วหรือยัง */
  currentDayId: string | null
}

export async function timetableNow(db: Db, t: number): Promise<TimetableNow> {
  const slots = await listSlots(db)
  const paused = await isPaused(db)
  if (!slots.length || paused) return { paused, hasSlots: slots.length > 0, current: null, upcoming: [], missingAttendance: [], currentDayId: null }
  const current = currentSlot(slots, t)
  const upcoming = upcomingSlots(slots, t, 6).filter((s) => !current || s.id !== current.id || s.startAt !== current.startAt)
  // คาบในสัปดาห์นี้ที่จบแล้ว (หรือกำลังสอน) แต่ยังไม่มีวันเช็กชื่อ
  const mon = weekStartBangkok(t)
  const days = await db.all<{ classId: string; date: string; id: string }>(sql`
    SELECT class_id AS classId, date, id FROM attendance_days WHERE date >= ${todayBangkok(mon)} AND date <= ${todayBangkok(t)}`)
  const has = new Map(days.map((d) => [`${d.classId}|${d.date}`, d.id]))
  const { weekday } = bangkokClock(t)
  const missingAttendance: TimetableNow['missingAttendance'] = []
  for (const s of slots) {
    if (s.weekday > weekday) continue
    const dayStart = mon + (s.weekday - 1) * 86400_000
    if (slotTimes(s, dayStart).end > t) continue
    const date = todayBangkok(dayStart + 12 * 3600_000)
    if (!has.has(`${s.classId}|${date}`)) missingAttendance.push({ classId: s.classId, date, weekday: s.weekday })
  }
  const currentDayId = current ? (has.get(`${current.classId}|${todayBangkok(t)}`) ?? null) : null
  return { paused, hasSlots: true, current, upcoming, missingAttendance, currentDayId }
}

/**
 * เวลาเผยแพร่ของแต่ละห้องตามที่ครูเลือก
 * คืน published (เผยแพร่เลยไหม) และ publishAt (ตั้งเวลา) · ห้องที่ไม่มีตารางสอน + "คาบถัดไป" = เผยแพร่ทันที
 */
export async function resolvePublish(db: Db, classIds: string[], p: PublishInput | undefined, t: number): Promise<Map<string, { published: boolean; publishAt: number | null }>> {
  const out = new Map<string, { published: boolean; publishAt: number | null }>()
  const mode = p?.publishMode ?? 'now'
  const slots = mode === 'next-period' ? await listSlots(db) : []
  for (const id of classIds) {
    if (mode === 'draft') out.set(id, { published: false, publishAt: null })
    else if (mode === 'at') {
      if (!p?.publishAt) throw apiError('invalid_request', 'กรุณาเลือกวันเวลาที่จะเผยแพร่', 400)
      out.set(id, p.publishAt <= t ? { published: true, publishAt: null } : { published: false, publishAt: p.publishAt })
    } else if (mode === 'next-period') {
      const at = nextClassStart(slots, id, t)
      out.set(id, at === null ? { published: true, publishAt: null } : { published: false, publishAt: at })
    } else out.set(id, { published: true, publishAt: null })
  }
  return out
}

/** กำหนดส่งตามที่ครูเลือกตอนคัดลอก: เท่าเดิม · คาบถัดไปของห้องนั้น (หลังเวลาเผยแพร่) · ไม่มี */
export async function nextStartFor(db: Db, classId: string, after: number): Promise<number | null> {
  return nextClassStart(await listSlots(db), classId, after)
}

