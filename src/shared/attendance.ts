import { z } from 'zod'

export const ATTENDANCE_STATUSES = ['present', 'late', 'sick', 'leave', 'absent'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]
export const STATUS_LABEL: Record<AttendanceStatus, string> = { present: 'มา', late: 'สาย', sick: 'ป่วย', leave: 'ลา', absent: 'ขาด' }
export const EARNS_EXP: AttendanceStatus[] = ['present', 'late']

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const statusInputSchema = z.object({ status: z.enum(ATTENDANCE_STATUSES) })

export type AttendanceRecordRow = {
  studentId: string
  zipgradeId: string
  title: string | null
  firstName: string
  lastName: string
  status: AttendanceStatus
  source: 'teacher' | 'self'
}
export type AttendanceDay = { day: { id: string; date: string; selfCheckinOpen: boolean }; records: AttendanceRecordRow[] }

export type AttendanceRange = {
  days: string[]
  students: { id: string; zipgradeId: string; title: string | null; firstName: string; lastName: string }[]
  cells: Record<string, Record<string, AttendanceStatus>>
  totals: Record<string, Record<AttendanceStatus, number>>
}

/** วันนี้ตามเวลาไทย YYYY-MM-DD */
export const todayBangkok = (t = Date.now()) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10)
