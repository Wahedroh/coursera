import { z } from 'zod'

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

/** ตั้งค่าแจ้งเตือนของครู (เก็บใน settings) */
export const teacherNotifySchema = z.object({
  beforeClass: z.object({ on: z.boolean(), minutes: z.number().int().min(1).max(60) }),
  /** ยืนยันการสอน (เซลฟี + พิกัด) ในเว็บของครูเอง ตอนเริ่มคาบ */
  selfie: z.object({ on: z.boolean(), url: z.string().trim().max(500).refine((u) => u === '' || /^https:\/\/[^\s]+$/.test(u), 'ลิงก์ต้องขึ้นต้นด้วย https://') }),
  missedAttendance: z.object({ on: z.boolean(), afterMinutes: z.number().int().min(5).max(180) }),
  toGrade: z.object({ on: z.boolean(), at: HHMM }),
  resubmitted: z.object({ on: z.boolean() }),
  overdue: z.object({ on: z.boolean() }),
  released: z.object({ on: z.boolean() }),
  quiet: z.object({ on: z.boolean(), from: HHMM, to: HHMM }),
})
export type TeacherNotifySettings = z.infer<typeof teacherNotifySchema>

export const DEFAULT_TEACHER_NOTIFY: TeacherNotifySettings = {
  beforeClass: { on: true, minutes: 10 },
  selfie: { on: true, url: 'https://change-classroom1.base44.app/' },
  missedAttendance: { on: true, afterMinutes: 15 },
  toGrade: { on: true, at: '17:00' },
  resubmitted: { on: true },
  overdue: { on: true },
  released: { on: false },
  quiet: { on: true, from: '21:00', to: '06:30' },
}

export type TeacherNotification = { id: string; kind: string; title: string; body: string; url: string; createdAt: number; read: boolean }
export type TeacherInbox = { unread: number; items: TeacherNotification[] }

/** อยู่ในช่วงห้ามรบกวนไหม (นาทีของวันตามเวลาไทย · ช่วงข้ามเที่ยงคืนได้) */
export function inQuietHours(q: TeacherNotifySettings['quiet'], minuteOfDay: number): boolean {
  if (!q.on) return false
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
  const from = m(q.from)
  const to = m(q.to)
  return from <= to ? minuteOfDay >= from && minuteOfDay < to : minuteOfDay >= from || minuteOfDay < to
}
