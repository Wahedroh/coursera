import { z } from 'zod'
import { dateSchema } from './attendance'
import { SCORE_CATEGORIES } from './scores'

export const EVENT_KINDS = ['exam', 'activity', 'holiday'] as const
export type EventKind = (typeof EVENT_KINDS)[number]
export const EVENT_LABEL: Record<EventKind, string> = { exam: 'สอบ', activity: 'กิจกรรม', holiday: 'วันหยุด' }
/** สีบนปฏิทิน: กำหนดส่งงาน = ส้ม · สอบ = แดง · กิจกรรม = น้ำเงิน · วันหยุด = เทา */
export const CAL_COLOR = { due: '#D98E1C', exam: '#E53935', activity: '#2F5C9E', holiday: '#8D8D8D' } as const

export const eventInputSchema = z.object({
  kind: z.enum(EVENT_KINDS),
  title: z.string().trim().min(1).max(120),
  date: dateSchema,
  period: z.string().trim().max(60).default(''),
  detail: z.string().trim().max(500).default(''),
})
export type EventInput = z.infer<typeof eventInputSchema>
export const createEventsSchema = eventInputSchema.extend({
  classIds: z.array(z.string()).min(1).max(50),
  /** วันสอบ: สร้างรายการคะแนนสอบคู่กัน (ครูกรอก/นำเข้าคะแนนทีหลัง) */
  scoreItem: z.object({ category: z.enum(SCORE_CATEGORIES), maxScore: z.number().positive().max(1000) }).nullable().default(null),
})
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

export type CalendarItem =
  | { type: 'event'; id: string; kind: EventKind; title: string; date: string; period: string; detail: string; classId: string; className: string }
  | { type: 'due'; id: string; title: string; date: string; dueAt: number; classId: string; className: string; status?: 'missing' | 'submitted' | 'late' | 'graded' | 'returned' }

/** วันแรกและวันสุดท้ายของเดือน YYYY-MM */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}
