import { z } from 'zod'

const TZ = 7 * 3600_000
const DAY = 86400_000
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export const WEEKDAY_LABEL = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์'] as const
export const WEEKDAY_SHORT = ['', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'] as const

export const slotInputSchema = z
  .object({
    classId: z.string().min(1),
    weekday: z.number().int().min(1).max(7),
    start: z.string().regex(HHMM),
    end: z.string().regex(HHMM),
  })
  .refine((x) => x.start < x.end, { message: 'เวลาจบต้องหลังเวลาเริ่ม' })
export type SlotInput = z.infer<typeof slotInputSchema>
export type Slot = SlotInput & { id: string }

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** วันในสัปดาห์ (1 = จันทร์ … 7 = อาทิตย์) และนาทีของวัน ตามเวลาไทย */
export function bangkokClock(t: number): { weekday: number; minute: number; dayStart: number } {
  const local = t + TZ
  const dow = new Date(local).getUTCDay()
  const dayStart = Math.floor(local / DAY) * DAY - TZ
  return { weekday: dow === 0 ? 7 : dow, minute: Math.floor((local % DAY) / 60000), dayStart }
}

/** เวลาเริ่ม/จบของคาบ (epoch ms) ในวันที่ dayStart (เที่ยงคืนเวลาไทย) */
export const slotTimes = (s: Pick<Slot, 'start' | 'end'>, dayStart: number) => ({ start: dayStart + minutes(s.start) * 60000, end: dayStart + minutes(s.end) * 60000 })

/** ครั้งถัดไปของคาบนี้ที่เริ่มหลังเวลา t (ภายใน 7 วัน) */
export function nextOccurrence(s: Slot, t: number): { start: number; end: number } {
  const { weekday, dayStart } = bangkokClock(t)
  for (let d = 0; d <= 7; d++) {
    if (((weekday - 1 + d) % 7) + 1 !== s.weekday) continue
    const occ = slotTimes(s, dayStart + d * DAY)
    if (occ.start > t) return occ
  }
  return slotTimes(s, dayStart + 7 * DAY)
}

/** คาบที่กำลังสอนตอนนี้ (เริ่ม ≤ t < จบ) */
export function currentSlot<S extends Slot>(slots: S[], t: number): (S & { startAt: number; endAt: number }) | null {
  const { weekday, dayStart } = bangkokClock(t)
  for (const s of slots) {
    if (s.weekday !== weekday) continue
    const occ = slotTimes(s, dayStart)
    if (occ.start <= t && t < occ.end) return { ...s, startAt: occ.start, endAt: occ.end }
  }
  return null
}

/** คาบถัดไป (เรียงตามเวลาเริ่ม) */
export function upcomingSlots<S extends Slot>(slots: S[], t: number, limit = 10): (S & { startAt: number; endAt: number })[] {
  return slots
    .map((s) => {
      const o = nextOccurrence(s, t)
      return { ...s, startAt: o.start, endAt: o.end }
    })
    .sort((a, b) => a.startAt - b.startAt)
    .slice(0, limit)
}

/** เวลาเริ่มคาบถัดไปของห้องนี้หลังเวลา t (ไม่มีตารางสอน = null) */
export function nextClassStart(slots: Slot[], classId: string, t: number): number | null {
  const mine = slots.filter((s) => s.classId === classId)
  if (!mine.length) return null
  return Math.min(...mine.map((s) => nextOccurrence(s, t).start))
}

/** การเผยแพร่: ทันที · ตั้งเวลา · ตอนเริ่มคาบถัดไปของแต่ละห้อง · เก็บเป็นร่าง */
export const PUBLISH_MODES = ['now', 'at', 'next-period', 'draft'] as const
export type PublishMode = (typeof PUBLISH_MODES)[number]
export const publishSchema = z.object({
  publishMode: z.enum(PUBLISH_MODES).default('now'),
  publishAt: z.number().int().nullable().optional(),
})
export type PublishInput = z.infer<typeof publishSchema>
