import { and, asc, eq, gte, inArray, isNotNull, lte, or } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import {
  closureText,
  countTrips,
  navUrl,
  parsePlace,
  slotPeriods,
  type Appointment,
  type AppointmentInput,
  type MakeupInput,
  type MakeupItem,
  type MakeupMode,
  type MakeupSummary,
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
import { announcements, classes, makeupClasses, schoolClosures, schools, settings, teacherAppointments, timetableSlots } from '../db/schema'
import { slotActiveOn } from '../../shared/timetable'
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

type ClassRow = { id: string; name: string; schoolId: string; weeklyPeriods: number | null; archivedOn?: string | null }
type SlotRow = { id: string; classId: string; weekday: number; start: string; end: string; periods: number | null; validFrom: string | null; validTo: string | null }
type MakeupRow = typeof makeupClasses.$inferSelect
type ClosureRow = typeof schoolClosures.$inferSelect
type SchoolRow = SchoolPlace & { countPeriods: boolean; countTrips: boolean }
type Ctx = { classes: Map<string, ClassRow>; schools: Map<string, SchoolRow>; slots: SlotRow[]; closures: ClosureRow[]; appts: Appointment[]; makeups: MakeupRow[]; makeupFor: Map<string, ClosureRow> }

async function activeClasses(db: Db): Promise<ClassRow[]> {
  return db.select({ id: classes.id, name: classes.name, schoolId: classes.schoolId, weeklyPeriods: classes.weeklyPeriods }).from(classes).where(eq(classes.archived, false)).orderBy(classes.name)
}
/** ห้องทั้งหมดที่ยังนับย้อนหลังได้: ห้องปัจจุบัน + ห้องที่เก็บถาวรแล้ว (นับเฉพาะวันก่อนเก็บถาวร) */
async function historyClasses(db: Db): Promise<ClassRow[]> {
  return db
    .select({ id: classes.id, name: classes.name, schoolId: classes.schoolId, weeklyPeriods: classes.weeklyPeriods, archivedOn: classes.archivedOn })
    .from(classes)
    .where(or(eq(classes.archived, false), isNotNull(classes.archivedOn)))
    .orderBy(classes.name)
}
/** ห้องนี้ยังสอนอยู่ในวันที่ date ไหม (ห้องที่เก็บถาวรแล้วนับถึงวันก่อนเก็บ) */
const classOn = (c: ClassRow | undefined, date: string) => !!c && (!c.archivedOn || date < c.archivedOn)
async function historySlots(db: Db): Promise<SlotRow[]> {
  return db
    .select({ id: timetableSlots.id, classId: timetableSlots.classId, weekday: timetableSlots.weekday, start: timetableSlots.start, end: timetableSlots.end, periods: timetableSlots.periods, validFrom: timetableSlots.validFrom, validTo: timetableSlots.validTo })
    .from(timetableSlots)
    .innerJoin(classes, eq(classes.id, timetableSlots.classId))
    .where(or(eq(classes.archived, false), isNotNull(classes.archivedOn)))
    .orderBy(timetableSlots.weekday, timetableSlots.start)
}
async function allSlots(db: Db): Promise<SlotRow[]> {
  return db
    .select({ id: timetableSlots.id, classId: timetableSlots.classId, weekday: timetableSlots.weekday, start: timetableSlots.start, end: timetableSlots.end, periods: timetableSlots.periods, validFrom: timetableSlots.validFrom, validTo: timetableSlots.validTo })
    .from(timetableSlots)
    .innerJoin(classes, eq(classes.id, timetableSlots.classId))
    .where(eq(classes.archived, false))
    .orderBy(timetableSlots.weekday, timetableSlots.start)
}
async function closuresBetween(db: Db, from: string, to: string): Promise<ClosureRow[]> {
  return db.select().from(schoolClosures).where(and(lte(schoolClosures.fromDate, to), gte(schoolClosures.toDate, from))).orderBy(asc(schoolClosures.fromDate))
}

async function loadCtx(db: Db, from: string, to: string, withSlots = true): Promise<Ctx> {
  const [cls, sch, slots, closures, appts, makeups] = await Promise.all([
    historyClasses(db),
    db.select({ id: schools.id, name: schools.name, mapUrl: schools.mapUrl, lat: schools.lat, lng: schools.lng, countPeriods: schools.countPeriods, countTrips: schools.countTrips }).from(schools),
    withSlots ? historySlots(db) : Promise.resolve([]),
    closuresBetween(db, from, to),
    db
      .select({ id: teacherAppointments.id, date: teacherAppointments.date, start: teacherAppointments.start, title: teacherAppointments.title, mapUrl: teacherAppointments.mapUrl, lat: teacherAppointments.lat, lng: teacherAppointments.lng })
      .from(teacherAppointments)
      .where(and(gte(teacherAppointments.date, from), lte(teacherAppointments.date, to)))
      .orderBy(teacherAppointments.date, teacherAppointments.start),
    db.select().from(makeupClasses).where(and(gte(makeupClasses.date, from), lte(makeupClasses.date, to))).orderBy(makeupClasses.date, makeupClasses.start),
  ])
  const classMap = new Map(cls.map((c) => [c.id, c]))
  const linked = [...new Set(makeups.map((m) => m.closureId).filter((x): x is string => !!x))]
  const linkedRows = linked.length ? await db.select().from(schoolClosures).where(inArray(schoolClosures.id, linked)) : []
  return {
    classes: classMap,
    schools: new Map(sch.map((s) => [s.id, s])),
    slots: slots.filter((s) => classMap.has(s.classId)),
    closures,
    appts,
    makeups: makeups.filter((m) => classMap.has(m.classId)),
    makeupFor: new Map(linkedRows.map((c) => [c.id, c])),
  }
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
  type Entry = { start: string; end: string | null; slot?: SlotRow; appt?: Appointment; makeup?: MakeupRow }
  const entries: Entry[] = [
    ...(paused ? [] : ctx.slots.filter((s) => s.weekday === weekday && slotActiveOn(s, date) && classOn(ctx.classes.get(s.classId), date)).map((s) => ({ start: s.start, end: s.end, slot: s }))),
    ...ctx.appts.filter((a) => a.date === date).map((a) => ({ start: a.start, end: null, appt: a })),
    ...ctx.makeups.filter((m) => m.date === date && classOn(ctx.classes.get(m.classId), date)).map((m) => ({ start: m.start, end: m.end, makeup: m })),
  ].sort((a, b) => a.start.localeCompare(b.start))
  const stops: Stop[] = []
  for (const e of entries) {
    if (e.makeup) {
      const m = e.makeup
      const c = ctx.classes.get(m.classId)!
      const sch = ctx.schools.get(c.schoolId)
      const periods = slotPeriods(m)
      const cl = m.closureId ? ctx.makeupFor.get(m.closureId) : undefined
      const online = m.mode === 'online'
      stops.push({
        kind: 'makeup',
        key: online ? `online:${m.id}` : c.schoolId,
        name: sch?.name ?? '',
        start: m.start,
        end: m.end,
        periods,
        classes: [{ id: c.id, name: c.name, periods }],
        closed: null,
        lat: online ? null : (sch?.lat ?? null),
        lng: online ? null : (sch?.lng ?? null),
        nav: online ? (m.meetUrl ?? '') : navUrl({ lat: sch?.lat ?? null, lng: sch?.lng ?? null, name: sch?.name ?? '' }),
        countPeriods: sch?.countPeriods ?? true,
        countTrips: online ? false : (sch?.countTrips ?? true),
        makeup: { id: m.id, mode: m.mode as MakeupMode, meetUrl: m.meetUrl, forDate: m.forDate ?? (cl ? cl.fromDate : null), reason: cl ? (cl.reason as ClosureReason) : null, note: m.note || (cl?.note ?? '') },
      })
      continue
    }
    if (e.appt) {
      const a = e.appt
      stops.push({ kind: 'appointment', key: `appt:${a.id}`, name: a.title, start: a.start, end: null, periods: 0, classes: [], closed: null, lat: a.lat, lng: a.lng, nav: navUrl({ lat: a.lat, lng: a.lng, name: a.title }), countPeriods: false, countTrips: true })
      continue
    }
    const s = e.slot!
    const c = ctx.classes.get(s.classId)!
    const periods = slotPeriods(s)
    const last = stops.at(-1)
    if (last && last.kind === 'school' && last.key === c.schoolId && !last.closed === !closureOf(ctx, c.schoolId, date)) {
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
      closed: cl ? { reason: cl.reason as ClosureReason, note: cl.note, closureId: cl.id, allSchools: cl.schoolId === null, makeupNeeded: cl.makeupNeeded } : null,
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
  const mk = (d: DayPlan, online: boolean) => d.stops.filter((s) => s.kind === 'makeup' && s.countPeriods && (!online || s.makeup?.mode === 'online')).reduce((n, s) => n + s.periods, 0)
  const sum = (xs: DayPlan[]) => ({
    periods: xs.reduce((n, d) => n + d.periods, 0),
    trips: xs.reduce((n, d) => n + d.trips, 0),
    closedPeriods: xs.reduce((n, d) => n + d.closedPeriods, 0),
    makeupPeriods: xs.reduce((n, d) => n + mk(d, false), 0),
    onlinePeriods: xs.reduce((n, d) => n + mk(d, true), 0),
  })
  const bySchool = new Map<string, { id: string; name: string; periods: number; trips: number; closedPeriods: number }>()
  for (const d of days.filter((x) => x.date <= today)) {
    let prev: string | null = null
    for (const s of d.stops) {
      if (s.kind === 'appointment' || (s.kind === 'makeup' && s.makeup?.mode === 'online')) {
        prev = s.key
        if (s.kind === 'makeup' && s.countPeriods) {
          const row = bySchool.get(s.classes[0] ? (ctx.classes.get(s.classes[0].id)?.schoolId ?? s.key) : s.key)
          if (row) row.periods += s.periods
        }
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
export async function workloadTargets(db: Db, today = todayBangkok(Date.now())): Promise<WorkloadTargets> {
  const [cls, sch, slots] = await Promise.all([activeClasses(db), db.select({ id: schools.id, name: schools.name, countPeriods: schools.countPeriods, countTrips: schools.countTrips }).from(schools), allSlots(db)])
  const out: WorkloadTargets['schools'] = []
  for (const s of sch.sort((a, b) => a.name.localeCompare(b.name, 'th'))) {
    const rows = cls
      .filter((c) => c.schoolId === s.id)
      .map((c) => {
        const mine = slots.filter((x) => x.classId === c.id && slotActiveOn(x, today))
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
  await db.insert(schoolClosures).values({ id, schoolId: input.schoolId, fromDate: input.from, toDate: input.to, reason: input.reason, note: input.note, announcementIds, makeupNeeded: input.reason !== 'holiday', createdAt: t })
  return id
}

export async function deleteClosure(db: Db, id: string): Promise<void> {
  // คาบชดเชยที่ผูกไว้ยังอยู่ (นับเป็นคาบสอนปกติ) แค่ไม่ผูกกับการปิดนี้แล้ว
  await db.update(makeupClasses).set({ closureId: null }).where(eq(makeupClasses.closureId, id))
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

// ---------- สอนชดเชย ----------
const thaiDay = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

export async function createMakeups(db: Db, input: MakeupInput, t: number): Promise<string[]> {
  if (input.mode === 'online' && input.meetUrl && !/^https:\/\//.test(input.meetUrl)) throw apiError('invalid_request', 'ลิงก์ต้องขึ้นต้นด้วย https://', 400)
  if (input.closureId) {
    const [c] = await db.select({ id: schoolClosures.id }).from(schoolClosures).where(eq(schoolClosures.id, input.closureId))
    if (!c) throw apiError('closure_not_found', 'ไม่พบรายการปิดนี้', 404)
  }
  const ids = [...new Set(input.classIds)]
  const cls = await db.select({ id: classes.id }).from(classes).where(and(inArray(classes.id, ids), eq(classes.archived, false)))
  if (cls.length !== ids.length) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  let annIds: string[] = []
  if (input.notifyStudents) {
    const where = input.mode === 'online' ? `ออนไลน์ทาง Google Meet${input.meetUrl ? `\n${input.meetUrl}` : ' (ครูจะส่งลิงก์ให้)'}` : 'ที่โรงเรียน (เรียนในห้องตามปกติ)'
    annIds = await createAnnouncements(db, ids, { title: `สอนชดเชย ${thaiDay.format(Date.parse(input.date))} ${input.start}–${input.end}`, body: where, pinned: true, expiresOn: input.date }, t)
  }
  const out: string[] = []
  for (const [i, classId] of ids.entries()) {
    const id = newId()
    await db.insert(makeupClasses).values({
      id,
      closureId: input.closureId,
      classId,
      date: input.date,
      start: input.start,
      end: input.end,
      mode: input.mode,
      meetUrl: input.mode === 'online' ? input.meetUrl || null : null,
      forDate: input.forDate,
      note: input.note,
      periods: input.periods,
      announcementId: annIds[i] ?? null,
      createdAt: t,
    })
    out.push(id)
  }
  return out
}

/** คาบสอนชดเชยตั้งแต่วันที่ from (ย้อนหลังและล่วงหน้า) */
export async function listMakeups(db: Db, from: string): Promise<MakeupItem[]> {
  const rows = await db
    .select({ m: makeupClasses, className: classes.name, schoolName: schools.name, cReason: schoolClosures.reason, cNote: schoolClosures.note })
    .from(makeupClasses)
    .innerJoin(classes, eq(classes.id, makeupClasses.classId))
    .innerJoin(schools, eq(schools.id, classes.schoolId))
    .leftJoin(schoolClosures, eq(schoolClosures.id, makeupClasses.closureId))
    .where(and(gte(makeupClasses.date, from), eq(classes.archived, false)))
    .orderBy(makeupClasses.date, makeupClasses.start)
  return rows.map(({ m, className, schoolName, cReason, cNote }) => ({
    id: m.id,
    classId: m.classId,
    className,
    schoolName,
    date: m.date,
    start: m.start,
    end: m.end,
    periods: slotPeriods(m),
    mode: m.mode as MakeupMode,
    meetUrl: m.meetUrl,
    forDate: m.forDate,
    note: m.note,
    closure: cReason ? { reason: cReason as ClosureReason, note: cNote ?? '' } : null,
  }))
}

export async function deleteMakeup(db: Db, id: string): Promise<void> {
  const [m] = await db.delete(makeupClasses).where(eq(makeupClasses.id, id)).returning()
  if (!m) throw apiError('makeup_not_found', 'ไม่พบคาบชดเชยนี้', 404)
  if (m.announcementId) await db.delete(announcements).where(eq(announcements.id, m.announcementId))
}

export async function setMakeupNeeded(db: Db, closureId: string, needed: boolean): Promise<void> {
  const r = await db.update(schoolClosures).set({ makeupNeeded: needed }).where(eq(schoolClosures.id, closureId)).returning({ id: schoolClosures.id })
  if (!r.length) throw apiError('closure_not_found', 'ไม่พบรายการปิดนี้', 404)
}

/** คาบชดเชยคงค้าง: การปิดที่ทับช่วงวันที่ → คาบที่งดของแต่ละห้อง (ตามตารางที่ใช้ในวันนั้น) เทียบกับคาบชดเชยที่ผูกไว้ */
export async function makeupSummary(db: Db, from: string, to: string): Promise<MakeupSummary> {
  const closures = await closuresBetween(db, from, to)
  const [cls, sch, slots] = await Promise.all([activeClasses(db), db.select({ id: schools.id, name: schools.name, countPeriods: schools.countPeriods }).from(schools), allSlots(db)])
  const made = closures.length ? await db.select().from(makeupClasses).where(inArray(makeupClasses.closureId, closures.map((c) => c.id))) : []
  const school = new Map(sch.map((s) => [s.id, s]))
  const out: MakeupSummary['closures'] = []
  for (const c of closures) {
    const rows = new Map<string, { id: string; name: string; closed: number; madeUp: number; online: number }>()
    for (let d = c.fromDate; d <= c.toDate; d = addDays(d, 1)) {
      const wd = isoWeekday(d)
      for (const sl of slots) {
        if (sl.weekday !== wd || !slotActiveOn(sl, d)) continue
        const k = cls.find((x) => x.id === sl.classId)
        if (!k || (c.schoolId && k.schoolId !== c.schoolId) || school.get(k.schoolId)?.countPeriods === false) continue
        const row = rows.get(k.id) ?? { id: k.id, name: k.name, closed: 0, madeUp: 0, online: 0 }
        row.closed += slotPeriods(sl)
        rows.set(k.id, row)
      }
    }
    for (const m of made.filter((x) => x.closureId === c.id)) {
      const k = cls.find((x) => x.id === m.classId)
      if (!k) continue
      const row = rows.get(k.id) ?? { id: k.id, name: k.name, closed: 0, madeUp: 0, online: 0 }
      row.madeUp += slotPeriods(m)
      if (m.mode === 'online') row.online += slotPeriods(m)
      rows.set(k.id, row)
    }
    if (!rows.size) continue
    out.push({
      id: c.id,
      schoolName: c.schoolId ? (school.get(c.schoolId)?.name ?? null) : null,
      from: c.fromDate,
      to: c.toDate,
      reason: c.reason as ClosureReason,
      note: c.note,
      makeupNeeded: c.makeupNeeded,
      classes: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'th')),
    })
  }
  const all = out.flatMap((c) => c.classes.map((r) => ({ ...r, needed: c.makeupNeeded })))
  return {
    closures: out,
    totals: {
      closed: all.reduce((n, r) => n + r.closed, 0),
      madeUp: all.reduce((n, r) => n + r.madeUp, 0),
      online: all.reduce((n, r) => n + r.online, 0),
      notNeeded: all.filter((r) => !r.needed).reduce((n, r) => n + r.closed, 0),
      owed: all.filter((r) => r.needed).reduce((n, r) => n + Math.max(0, r.closed - r.madeUp), 0),
    },
  }
}

/** คาบชดเชยของวันนี้ (ใช้กับแจ้งเตือนครู) */
export async function makeupsOn(db: Db, date: string) {
  return db
    .select({ id: makeupClasses.id, classId: makeupClasses.classId, start: makeupClasses.start, end: makeupClasses.end, mode: makeupClasses.mode })
    .from(makeupClasses)
    .innerJoin(classes, eq(classes.id, makeupClasses.classId))
    .where(and(eq(makeupClasses.date, date), eq(classes.archived, false)))
}
