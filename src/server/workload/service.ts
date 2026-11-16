import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import {
  closureText,
  countTrips,
  navUrl,
  parsePlace,
  slotPeriods,
  type Appointment,
  type AppointmentInput,
  type Closure,
  type ClosureInput,
  type ClosureReason,
  type DayPlan,
  type SchoolPlace,
  type Stop,
  type WorkloadRange,
  type WorkloadTargets,
} from '../../shared/workload'
import { newId, type Db } from '../db/client'
import { announcements, classes, schoolClosures, schools, settings, teacherAppointments, timetableSlots } from '../db/schema'
import { apiError } from '../http'
import { createAnnouncements } from '../announcements/service'

const DAY = 86400_000
/** ตารางสอนหยุดชั่วคราว (ช่วงปิดเทอม) — อ่านตรงจาก settings เพื่อไม่ให้ import วนกับ timetable/service */
async function isPaused(db: Db): Promise<boolean> {
  const [r] = await db.select().from(settings).where(eq(settings.key, 'timetable_paused'))
  return r?.value === 'true'
}
const MAX_RANGE_DAYS = 200
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
/** 1 = จันทร์ … 7 = อาทิตย์ */
export const isoWeekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7
const thaiDate = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const dateText = (from: string, to: string) => (from === to ? thaiDate.format(Date.parse(from)) : `${thaiDate.format(Date.parse(from))} – ${thaiDate.format(Date.parse(to))}`)

type ClassRow = { id: string; name: string; schoolId: string; weeklyPeriods: number | null }
type SlotRow = { id: string; classId: string; weekday: number; start: string; end: string; periods: number | null }
type ClosureRow = typeof schoolClosures.$inferSelect
type SchoolRow = SchoolPlace & { countPeriods: boolean; countTrips: boolean }
type Ctx = { classes: Map<string, ClassRow>; schools: Map<string, SchoolRow>; slots: SlotRow[]; closures: ClosureRow[]; appts: Appointment[] }

async function activeClasses(db: Db): Promise<ClassRow[]> {
  return db.select({ id: classes.id, name: classes.name, schoolId: classes.schoolId, weeklyPeriods: classes.weeklyPeriods }).from(classes).where(eq(classes.archived, false)).orderBy(classes.name)
}
async function allSlots(db: Db): Promise<SlotRow[]> {
  return db
    .select({ id: timetableSlots.id, classId: timetableSlots.classId, weekday: timetableSlots.weekday, start: timetableSlots.start, end: timetableSlots.end, periods: timetableSlots.periods })
    .from(timetableSlots)
    .innerJoin(classes, eq(classes.id, timetableSlots.classId))
    .where(eq(classes.archived, false))
    .orderBy(timetableSlots.weekday, timetableSlots.start)
}
async function closuresBetween(db: Db, from: string, to: string): Promise<ClosureRow[]> {
  return db.select().from(schoolClosures).where(and(lte(schoolClosures.fromDate, to), gte(schoolClosures.toDate, from))).orderBy(asc(schoolClosures.fromDate))
}

async function loadCtx(db: Db, from: string, to: string, withSlots = true): Promise<Ctx> {
  const [cls, sch, slots, closures, appts] = await Promise.all([
    activeClasses(db),
    db.select({ id: schools.id, name: schools.name, mapUrl: schools.mapUrl, lat: schools.lat, lng: schools.lng, countPeriods: schools.countPeriods, countTrips: schools.countTrips }).from(schools),
    withSlots ? allSlots(db) : Promise.resolve([]),
    closuresBetween(db, from, to),
    db
      .select({ id: teacherAppointments.id, date: teacherAppointments.date, start: teacherAppointments.start, title: teacherAppointments.title, mapUrl: teacherAppointments.mapUrl, lat: teacherAppointments.lat, lng: teacherAppointments.lng })
      .from(teacherAppointments)
      .where(and(gte(teacherAppointments.date, from), lte(teacherAppointments.date, to)))
      .orderBy(teacherAppointments.date, teacherAppointments.start),
  ])
  const classMap = new Map(cls.map((c) => [c.id, c]))
  return { classes: classMap, schools: new Map(sch.map((s) => [s.id, s])), slots: slots.filter((s) => classMap.has(s.classId)), closures, appts }
}

const closureOf = (ctx: Pick<Ctx, 'closures'>, schoolId: string, date: string) =>
  ctx.closures.find((c) => c.fromDate <= date && date <= c.toDate && c.schoolId === schoolId) ?? ctx.closures.find((c) => c.fromDate <= date && date <= c.toDate && c.schoolId === null) ?? null

/** ตรวจว่าห้องนี้งดสอนวันนี้ไหม (ใช้กับแจ้งเตือน/การ์ดกำลังสอน) */
export async function closedChecker(db: Db, from: string, to: string): Promise<(classId: string, date: string) => { reason: ClosureReason; note: string } | null> {
  const [closures, cls] = await Promise.all([closuresBetween(db, from, to), db.select({ id: classes.id, schoolId: classes.schoolId }).from(classes)])
  if (!closures.length) return () => null
  const school = new Map(cls.map((c) => [c.id, c.schoolId]))
  return (classId, date) => {
    const sid = school.get(classId)
    const c = sid ? closureOf({ closures }, sid, date) : null
    return c ? { reason: c.reason as ClosureReason, note: c.note } : null
  }
}

function planDay(ctx: Ctx, date: string, paused: boolean): DayPlan {
  const weekday = isoWeekday(date)
  type Entry = { start: string; end: string | null; slot?: SlotRow; appt?: Appointment }
  const entries: Entry[] = [
    ...(paused ? [] : ctx.slots.filter((s) => s.weekday === weekday).map((s) => ({ start: s.start, end: s.end, slot: s }))),
    ...ctx.appts.filter((a) => a.date === date).map((a) => ({ start: a.start, end: null, appt: a })),
  ].sort((a, b) => a.start.localeCompare(b.start))
  const stops: Stop[] = []
  for (const e of entries) {
    if (e.appt) {
      const a = e.appt
      stops.push({ kind: 'appointment', key: `appt:${a.id}`, name: a.title, start: a.start, end: null, periods: 0, classes: [], closed: null, lat: a.lat, lng: a.lng, nav: navUrl({ lat: a.lat, lng: a.lng, name: a.title }), countPeriods: false, countTrips: true })
      continue
    }
    const s = e.slot!
    const c = ctx.classes.get(s.classId)!
    const periods = slotPeriods(s)
    const last = stops.at(-1)
    if (last && last.kind === 'school' && last.key === c.schoolId) {
      last.end = s.end
      last.periods += periods
      const same = last.classes.find((x) => x.id === c.id)
      if (same) same.periods += periods
      else last.classes.push({ id: c.id, name: c.name, periods })
      continue
    }
    const sch = ctx.schools.get(c.schoolId)
    const cl = closureOf(ctx, c.schoolId, date)
    stops.push({
      kind: 'school',
      key: c.schoolId,
      name: sch?.name ?? '',
      start: s.start,
      end: s.end,
      periods,
      classes: [{ id: c.id, name: c.name, periods }],
      closed: cl ? { reason: cl.reason as ClosureReason, note: cl.note, closureId: cl.id, allSchools: cl.schoolId === null } : null,
      lat: sch?.lat ?? null,
      lng: sch?.lng ?? null,
      nav: navUrl({ lat: sch?.lat ?? null, lng: sch?.lng ?? null, name: sch?.name ?? '' }),
      countPeriods: sch?.countPeriods ?? true,
      countTrips: sch?.countTrips ?? true,
    })
  }
  const counted = stops.filter((s) => s.countPeriods)
  return {
    date,
    weekday,
    stops,
    periods: counted.filter((s) => !s.closed).reduce((n, s) => n + s.periods, 0),
    closedPeriods: counted.filter((s) => s.closed).reduce((n, s) => n + s.periods, 0),
    trips: countTrips(stops),
  }
}

export async function dayPlan(db: Db, date: string): Promise<DayPlan> {
  return planDay(await loadCtx(db, date, date), date, await isPaused(db))
}

/** นับคาบและการเดินทางในช่วงวันที่ (คาบตามตารางสอนปัจจุบัน หักวันที่ปิด) */
export async function workloadRange(db: Db, from: string, to: string, t: number): Promise<WorkloadRange> {
  if (from > to) throw apiError('invalid_range', 'วันเริ่มต้องไม่หลังวันสิ้นสุด', 400)
  if ((Date.parse(to) - Date.parse(from)) / DAY >= MAX_RANGE_DAYS) throw apiError('invalid_range', `ดูได้ครั้งละไม่เกิน ${MAX_RANGE_DAYS} วัน`, 400)
  const ctx = await loadCtx(db, from, to)
  const today = todayBangkok(t)
  const days: DayPlan[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(planDay(ctx, d, false))
  const sum = (xs: DayPlan[]) => ({ periods: xs.reduce((n, d) => n + d.periods, 0), trips: xs.reduce((n, d) => n + d.trips, 0), closedPeriods: xs.reduce((n, d) => n + d.closedPeriods, 0) })
  const bySchool = new Map<string, { id: string; name: string; periods: number; trips: number; closedPeriods: number }>()
  for (const d of days.filter((x) => x.date <= today)) {
    let prev: string | null = null
    for (const s of d.stops) {
      if (s.kind !== 'school') {
        if (!s.closed) prev = s.key
        continue
      }
      if (!s.countPeriods && !s.countTrips) {
        if (!s.closed) prev = s.key
        continue
      }
      const row = bySchool.get(s.key) ?? { id: s.key, name: s.name, periods: 0, trips: 0, closedPeriods: 0 }
      if (s.closed) row.closedPeriods += s.countPeriods ? s.periods : 0
      else {
        if (s.countPeriods) row.periods += s.periods
        if (s.key !== prev && s.countTrips) row.trips++
        prev = s.key
      }
      bySchool.set(s.key, row)
    }
  }
  return { from, to, today, days, done: sum(days.filter((d) => d.date <= today)), planned: sum(days), bySchool: [...bySchool.values()].sort((a, b) => a.name.localeCompare(b.name, 'th')) }
}

/** เป้าคาบต่อสัปดาห์ เทียบกับคาบในตารางสอน */
export async function workloadTargets(db: Db): Promise<WorkloadTargets> {
  const [cls, sch, slots] = await Promise.all([activeClasses(db), db.select({ id: schools.id, name: schools.name, countPeriods: schools.countPeriods, countTrips: schools.countTrips }).from(schools), allSlots(db)])
  const out: WorkloadTargets['schools'] = []
  for (const s of sch.sort((a, b) => a.name.localeCompare(b.name, 'th'))) {
    const rows = cls
      .filter((c) => c.schoolId === s.id)
      .map((c) => {
        const mine = slots.filter((x) => x.classId === c.id)
        return { id: c.id, name: c.name, target: c.weeklyPeriods, scheduled: mine.reduce((n, x) => n + slotPeriods(x), 0), slots: mine.map((x) => ({ id: x.id, weekday: x.weekday, start: x.start, end: x.end, periods: slotPeriods(x), custom: x.periods !== null })) }
      })
    if (!rows.length) continue
    out.push({ id: s.id, name: s.name, countPeriods: s.countPeriods, countTrips: s.countTrips, classes: rows, target: rows.reduce((n, r) => n + (r.target ?? 0), 0), scheduled: rows.reduce((n, r) => n + r.scheduled, 0) })
  }
  const counted = out.filter((s) => s.countPeriods)
  return { schools: out, target: counted.reduce((n, s) => n + s.target, 0), scheduled: counted.reduce((n, s) => n + s.scheduled, 0) }
}

/** ตั้งรายโรงเรียน: นับคาบ / นับการเดินทาง */
export async function setSchoolCounting(db: Db, schoolId: string, v: { countPeriods: boolean; countTrips: boolean }): Promise<void> {
  const r = await db.update(schools).set(v).where(eq(schools.id, schoolId)).returning({ id: schools.id })
  if (!r.length) throw apiError('school_not_found', 'ไม่พบโรงเรียนนี้', 404)
}

export async function setWeeklyPeriods(db: Db, classId: string, weeklyPeriods: number | null): Promise<void> {
  const r = await db.update(classes).set({ weeklyPeriods }).where(eq(classes.id, classId)).returning({ id: classes.id })
  if (!r.length) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
}
export async function setSlotPeriods(db: Db, slotId: string, periods: number | null): Promise<void> {
  const r = await db.update(timetableSlots).set({ periods }).where(eq(timetableSlots.id, slotId)).returning({ id: timetableSlots.id })
  if (!r.length) throw apiError('slot_not_found', 'ไม่พบคาบนี้', 404)
}

// ---------- ปิดโรงเรียน ----------
export async function listClosures(db: Db, from: string): Promise<Closure[]> {
  const rows = await db
    .select({ c: schoolClosures, schoolName: schools.name })
    .from(schoolClosures)
    .leftJoin(schools, eq(schools.id, schoolClosures.schoolId))
    .where(gte(schoolClosures.toDate, from))
    .orderBy(asc(schoolClosures.fromDate))
  return rows.map(({ c, schoolName }) => ({ id: c.id, schoolId: c.schoolId, schoolName: schoolName ?? null, from: c.fromDate, to: c.toDate, reason: c.reason as ClosureReason, note: c.note, createdAt: c.createdAt }))
}

export async function createClosure(db: Db, input: ClosureInput, t: number): Promise<string> {
  let schoolName: string | null = null
  if (input.schoolId) {
    const [s] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, input.schoolId))
    if (!s) throw apiError('school_not_found', 'ไม่พบโรงเรียนนี้', 404)
    schoolName = s.name
  }
  const id = newId()
  let announcementIds: string[] = []
  if (input.notifyStudents) {
    const cls = (await activeClasses(db)).filter((c) => !input.schoolId || c.schoolId === input.schoolId)
    if (cls.length)
      announcementIds = await createAnnouncements(
        db,
        cls.map((c) => c.id),
        { title: `งดเรียน ${dateText(input.from, input.to)}`, body: `${schoolName ?? 'ทุกโรงเรียน'}: ${closureText(input)}`, pinned: true, expiresOn: input.to },
        t,
      )
  }
  await db.insert(schoolClosures).values({ id, schoolId: input.schoolId, fromDate: input.from, toDate: input.to, reason: input.reason, note: input.note, announcementIds, createdAt: t })
  return id
}

export async function deleteClosure(db: Db, id: string): Promise<void> {
  const [c] = await db.delete(schoolClosures).where(eq(schoolClosures.id, id)).returning()
  if (!c) throw apiError('closure_not_found', 'ไม่พบรายการปิดนี้', 404)
  if (c.announcementIds.length) await db.delete(announcements).where(inArray(announcements.id, c.announcementIds))
}

// ---------- สถานที่ ----------
/** ลิงก์ย่อ (maps.app.goo.gl ฯลฯ) ไม่มีพิกัดในตัว → ตามลิงก์ไปหาปลายทาง (ไม่เกิน 4 ครั้ง) */
async function resolvePlace(mapUrl: string): Promise<{ lat: number; lng: number } | null> {
  const direct = parsePlace(mapUrl)
  if (direct || !/^https:\/\//.test(mapUrl)) return direct
  let url = mapUrl
  try {
    for (let i = 0; i < 4; i++) {
      const host = new URL(url).hostname
      if (!/(^|\.)(goo\.gl|google\.[a-z.]+|g\.co|apple\.com)$/.test(host)) return null
      const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0' } })
      const next = res.headers.get('location')
      if (!next) {
        const body = res.status === 200 ? (await res.text()).slice(0, 200_000) : ''
        return parsePlace(body.match(/https:\/\/www\.google\.[^"'\s]*\/maps[^"'\s]*/)?.[0] ?? '') ?? parsePlace(body.match(/!3d-?\d+\.\d+!4d-?\d+\.\d+/)?.[0] ?? '')
      }
      url = new URL(next, url).toString()
      const p = parsePlace(url)
      if (p) return p
    }
  } catch {
    return null
  }
  return null
}

export async function listPlaces(db: Db): Promise<SchoolPlace[]> {
  const used = new Set((await activeClasses(db)).map((c) => c.schoolId))
  const rows = await db.select({ id: schools.id, name: schools.name, mapUrl: schools.mapUrl, lat: schools.lat, lng: schools.lng }).from(schools).orderBy(schools.name)
  return rows.filter((r) => used.has(r.id))
}

export async function setSchoolPlace(db: Db, schoolId: string, mapUrl: string): Promise<SchoolPlace> {
  const p = mapUrl ? await resolvePlace(mapUrl) : null
  const [r] = await db
    .update(schools)
    .set({ mapUrl: mapUrl || null, lat: p?.lat ?? null, lng: p?.lng ?? null })
    .where(eq(schools.id, schoolId))
    .returning({ id: schools.id, name: schools.name, mapUrl: schools.mapUrl, lat: schools.lat, lng: schools.lng })
  if (!r) throw apiError('school_not_found', 'ไม่พบโรงเรียนนี้', 404)
  return r
}

// ---------- นัดพิเศษ ----------
export async function listAppointments(db: Db, from: string): Promise<Appointment[]> {
  return db
    .select({ id: teacherAppointments.id, date: teacherAppointments.date, start: teacherAppointments.start, title: teacherAppointments.title, mapUrl: teacherAppointments.mapUrl, lat: teacherAppointments.lat, lng: teacherAppointments.lng })
    .from(teacherAppointments)
    .where(gte(teacherAppointments.date, from))
    .orderBy(teacherAppointments.date, teacherAppointments.start)
}
export async function createAppointment(db: Db, input: AppointmentInput, t: number): Promise<string> {
  const p = input.mapUrl ? await resolvePlace(input.mapUrl) : null
  const id = newId()
  await db.insert(teacherAppointments).values({ id, date: input.date, start: input.start, title: input.title, mapUrl: input.mapUrl || null, lat: p?.lat ?? null, lng: p?.lng ?? null, createdAt: t })
  return id
}
export async function deleteAppointment(db: Db, id: string): Promise<void> {
  const r = await db.delete(teacherAppointments).where(eq(teacherAppointments.id, id)).returning({ id: teacherAppointments.id })
  if (!r.length) throw apiError('appointment_not_found', 'ไม่พบนัดนี้', 404)
}
