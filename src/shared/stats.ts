import { z } from 'zod'
import type { AttendanceStatus } from './attendance'

/** สถิติของนักเรียนคนเดียว (เห็นเฉพาะของตัวเอง) */
export type StudentStats = {
  exp: number
  level: number
  nextLevelAt: number
  attendance: Record<AttendanceStatus, number>
  assignments: { total: number; onTime: number; late: number; missing: number; notDue: number }
  exams: { title: string; takenOn: string; pct: number | null; absent: boolean }[]
}

export const changePinSchema = z.object({ currentPin: z.string().max(32), newPin: z.string().max(32) })
