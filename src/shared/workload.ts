import { z } from 'zod'
import { dateSchema } from './attendance'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** ความยาวคาบมาตรฐาน (นาที) ใช้คิดจำนวนคาบจากช่วงเวลาในตารางสอน */
export const PERIOD_MINUTES = 50
/** จำนวนคาบของช่วงเวลา: ครูกำหนดเอง หรือคิดจากความยาว (ปัดเศษ อย่างน้อย 1) */
export function slotPeriods(s: { start: string; end: string; periods?: number | null }): number {
  if (s.periods) return s.periods
  return Math.max(1, Math.round((minutes(s.end) - minutes(s.start)) / PERIOD_MINUTES))
}

// ---------- ปิดโรงเรียน ----------
export const CLOSURE_REASONS = ['holiday', 'school-event', 'exam', 'disaster', 'leave', 'other'] as const
export type ClosureReason = (typeof CLOSURE_REASONS)[number]
export const CLOSURE_LABEL: Record<ClosureReason, string> = {
  holiday: 'วันหยุดราชการ',
  'school-event': 'กิจกรรมโรงเรียน',
  exam: 'สอบ',
  disaster: 'ภัยธรรมชาติ',
  leave: 'ครูลา',
  other: 'อื่น ๆ',
}
const MAX_CLOSURE_DAYS = 120
export const closureInputSchema = z
  .object({
    /** null = ปิดทุกโรงเรียน */
    schoolId: z.string().min(1).nullable(),
    from: dateSchema,
    to: dateSchema,
    reason: z.enum(CLOSURE_REASONS),
    note: z.string().trim().max(200).default(''),
    /** สร้างประกาศ "งดเรียน" ให้นักเรียนของโรงเรียนนั้น */
    notifyStudents: z.boolean().default(false),
  })
  .refine((x) => x.from <= x.to, { message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม' })
  .refine((x) => (Date.parse(x.to) - Date.parse(x.from)) / 86400_000 < MAX_CLOSURE_DAYS, { message: `ปิดได้ครั้งละไม่เกิน ${MAX_CLOSURE_DAYS} วัน` })
export type ClosureInput = z.infer<typeof closureInputSchema>
export type Closure = { id: string; schoolId: string | null; schoolName: string | null; from: string; to: string; reason: ClosureReason; note: string; createdAt: number }
export const closureText = (c: Pick<Closure, 'reason' | 'note'>) => (c.note ? `${CLOSURE_LABEL[c.reason]} · ${c.note}` : CLOSURE_LABEL[c.reason])

// ---------- สถานที่ ----------
export type LatLng = { lat: number; lng: number }
const valid = (lat: number, lng: number): LatLng | null => (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null)
const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)'

/** อ่านพิกัดจากลิงก์ Google Maps / Apple Maps หรือข้อความ "lat, lng" */
export function parsePlace(text: string): LatLng | null {
  let s = text.trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    // ใช้ข้อความเดิม
  }
  const tries = [
    new RegExp(`!3d${NUM}!4d${NUM}`), // หมุดสถานที่ของ Google (แม่นกว่า @)
    new RegExp(`[?&](?:q|query|ll|daddr|destination|sll|center)=${NUM},\\s*${NUM}`),
    new RegExp(`@${NUM},${NUM}`),
    new RegExp(`^${NUM}\\s*,\\s*${NUM}$`),
    new RegExp(`/(?:search|dir|place)/(?:[^/]*/)?${NUM},\\s*\\+?${NUM}`),
  ]
  for (const re of tries) {
    const m = re.exec(s)
    if (m) {
      const p = valid(Number(m[1]), Number(m[2]))
      if (p) return p
    }
  }
  return null
}

/** ลิงก์นำทางของ Apple Maps (เปิดแอปแผนที่) — ไม่มีพิกัดใช้ชื่อค้นหาแทน */
export function navUrl(place: { lat: number | null; lng: number | null; name: string }): string {
  const dest = place.lat !== null && place.lng !== null ? `${place.lat},${place.lng}` : encodeURIComponent(place.name)
  return `https://maps.apple.com/?daddr=${dest}&dirflg=d`
}

export const placeInputSchema = z.object({ mapUrl: z.string().trim().max(1000) })
export type SchoolPlace = { id: string; name: string; mapUrl: string | null; lat: number | null; lng: number | null }

// ---------- นัดพิเศษ ----------
export const appointmentInputSchema = z.object({
  date: dateSchema,
  start: z.string().regex(HHMM),
  title: z.string().trim().min(1).max(120),
  mapUrl: z.string().trim().max(1000).default(''),
})
export type AppointmentInput = z.infer<typeof appointmentInputSchema>

// ---------- สอนชดเชย ----------
export const MAKEUP_MODES = ['onsite', 'online'] as const
export type MakeupMode = (typeof MAKEUP_MODES)[number]
export const makeupInputSchema = z
  .object({
    closureId: z.string().min(1).nullable(),
    classIds: z.array(z.string().min(1)).min(1).max(20),
    date: dateSchema,
    start: z.string().regex(HHMM),
    end: z.string().regex(HHMM),
    mode: z.enum(MAKEUP_MODES),
    meetUrl: z
      .string()
      .trim()
      .max(500)
      .refine((u) => u === '' || /^https:\/\/[^\s]+$/.test(u), 'ลิงก์ต้องขึ้นต้นด้วย https://')
      .default(''),
    notifyStudents: z.boolean().default(false),
  })
  .refine((x) => x.start < x.end, { message: 'เวลาจบต้องหลังเวลาเริ่ม' })
export type MakeupInput = z.infer<typeof makeupInputSchema>
export type MakeupSummary = {
  closures: {
    id: string
    schoolName: string | null
    from: string
    to: string
    reason: ClosureReason
    note: string
    makeupNeeded: boolean
    classes: { id: string; name: string; closed: number; madeUp: number; online: number }[]
  }[]
  totals: { closed: number; madeUp: number; online: number; notNeeded: number; owed: number }
}
export type Appointment = { id: string; date: string; start: string; title: string; mapUrl: string | null; lat: number | null; lng: number | null }

// ---------- แผนรายวัน ----------
/** จุดแวะในวันหนึ่ง: คาบที่ติดกันในโรงเรียนเดียวกันรวมเป็นจุดเดียว · นัดพิเศษเป็นจุดของตัวเอง */
export type Stop = {
  kind: 'school' | 'appointment' | 'makeup'
  /** โรงเรียน = schoolId · นัด = appointment id */
  key: string
  name: string
  start: string
  end: string | null
  periods: number
  classes: { id: string; name: string; periods: number }[]
  closed: { reason: ClosureReason; note: string; closureId: string; allSchools: boolean; makeupNeeded: boolean } | null
  lat: number | null
  lng: number | null
  nav: string
  /** โรงเรียนนี้นับคาบ / นับการเดินทางไหม (ครูตั้งรายโรงเรียน) */
  countPeriods: boolean
  countTrips: boolean
  /** คาบสอนชดเชย */
  makeup?: { id: string; mode: MakeupMode; meetUrl: string | null; forDate: string | null; reason: ClosureReason | null; note: string }
}
export type DayPlan = { date: string; weekday: number; stops: Stop[]; periods: number; closedPeriods: number; trips: number }

/** นับการเดินทาง: จำนวนครั้งที่ย้ายไปอีกที่ (เช้า A + บ่าย B = 2 · A → B → A = 3) ไม่นับที่ที่ปิด
 *  ที่ที่ครูตั้ง "ไม่นับการเดินทาง": ไม่นับเที่ยวที่ไปที่นั้น แต่เที่ยวที่ออกจากที่นั้นไปที่อื่นยังนับ (A → B(ไม่นับ) → A = 2) */
export function countTrips(stops: (Pick<Stop, 'key' | 'closed'> & { countTrips?: boolean })[]): number {
  let n = 0
  let prev: string | null = null
  for (const s of stops) {
    if (s.closed) continue
    if (s.key !== prev && s.countTrips !== false) n++
    prev = s.key
  }
  return n
}
export const schoolCountingSchema = z.object({ countPeriods: z.boolean(), countTrips: z.boolean() })

export type WorkloadTargets = {
  schools: { id: string; name: string; countPeriods: boolean; countTrips: boolean; classes: { id: string; name: string; target: number | null; scheduled: number; slots: { id: string; weekday: number; start: string; end: string; periods: number; custom: boolean }[] }[]; target: number; scheduled: number }[]
  target: number
  scheduled: number
}
export type WorkloadRange = {
  from: string
  to: string
  today: string
  days: DayPlan[]
  /** รวมถึงวันนี้ (สอนจริง) และทั้งช่วง (ตามแผน) */
  done: { periods: number; trips: number; closedPeriods: number; makeupPeriods: number; onlinePeriods: number }
  planned: { periods: number; trips: number; closedPeriods: number; makeupPeriods: number; onlinePeriods: number }
  bySchool: { id: string; name: string; periods: number; trips: number; closedPeriods: number }[]
}
export const weeklyPeriodsSchema = z.object({ weeklyPeriods: z.number().int().min(0).max(60).nullable() })
export const slotPeriodsSchema = z.object({ periods: z.number().int().min(1).max(12).nullable() })
