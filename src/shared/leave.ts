import { z } from 'zod'
import { dateSchema } from './attendance'

export const LEAVE_KINDS = ['sick', 'leave'] as const
export type LeaveKind = (typeof LEAVE_KINDS)[number]
export const LEAVE_LABEL: Record<LeaveKind, string> = { sick: 'ลาป่วย', leave: 'ลากิจ' }
export type LeaveStatus = 'pending' | 'approved' | 'rejected'
export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = { pending: 'รอครูอนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ' }

/** ลาย้อนหลังได้ไม่เกิน 14 วัน · ล่วงหน้าไม่เกิน 60 วัน · ครั้งละไม่เกิน 14 วัน */
export const LEAVE_BACK_DAYS = 14
export const LEAVE_AHEAD_DAYS = 60
export const LEAVE_MAX_DAYS = 14

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000)
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)

export const leaveInputSchema = z
  .object({
    kind: z.enum(LEAVE_KINDS),
    from: dateSchema,
    to: dateSchema,
    reason: z.string().trim().min(1, 'กรุณาเขียนเหตุผล').max(300),
    imageKey: z.string().max(200).nullable().default(null),
  })
  .refine((x) => x.from <= x.to, { message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม' })
  .refine((x) => dayDiff(x.from, x.to) < LEAVE_MAX_DAYS, { message: `ลาได้ครั้งละไม่เกิน ${LEAVE_MAX_DAYS} วัน` })
export type LeaveInput = z.infer<typeof leaveInputSchema>

/** ช่วงวันที่ลาได้ เทียบกับวันนี้ (ตรวจฝั่งเซิร์ฟเวอร์) */
export function leaveDatesOk(x: Pick<LeaveInput, 'from' | 'to'>, today: string): boolean {
  return x.from >= addDays(today, -LEAVE_BACK_DAYS) && x.to <= addDays(today, LEAVE_AHEAD_DAYS)
}

export const leaveDecisionSchema = z.object({ approve: z.boolean(), note: z.string().trim().max(200).default('') })

export type LeaveItem = {
  id: string
  kind: LeaveKind
  from: string
  to: string
  reason: string
  imageKey: string | null
  status: LeaveStatus
  teacherNote: string
  createdAt: number
  decidedAt: number | null
}
export type TeacherLeaveItem = LeaveItem & { studentId: string; studentName: string; zipgradeId: string; classId: string; className: string }
export type TeacherLeaves = { pending: TeacherLeaveItem[]; recent: TeacherLeaveItem[] }

const dayFmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
/** "พ. 19 พ.ย." หรือ "พ. 19 พ.ย. – ศ. 21 พ.ย." */
export const leaveDays = (x: { from: string; to: string }) => {
  const f = (d: string) => dayFmt.format(Date.parse(`${d}T00:00:00Z`))
  return x.from === x.to ? f(x.from) : `${f(x.from)} – ${f(x.to)}`
}
