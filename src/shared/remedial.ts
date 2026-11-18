import { z } from 'zod'

/** ติด 0 (เกรด 0) · ร (งานไม่ครบ) · มส (เวลาเรียนไม่ถึงเกณฑ์) */
export const RISK_REASONS = ['zero', 'incomplete', 'attendance'] as const
export type RiskReason = (typeof RISK_REASONS)[number]
export const RISK_LABEL: Record<RiskReason, string> = { zero: '0', incomplete: 'ร', attendance: 'มส' }
export const RISK_DESC: Record<RiskReason, string> = { zero: 'เกรด 0', incomplete: 'งานไม่ครบ', attendance: 'เวลาเรียนไม่ถึง 80%' }
/** เวลาเรียนขั้นต่ำ (%) — ป่วย/ลา (ที่ครูบันทึก/อนุมัติ) ไม่นับขาด */
export const MIN_ATTENDANCE_PCT = 80

/** % เวลาเรียน: ขาดเท่านั้นที่ลดเวลาเรียน (มา สาย ป่วย ลา = มีเวลาเรียน) · ยังไม่เคยเช็กชื่อ = null */
export const attendancePct = (days: number, absent: number): number | null => (days > 0 ? Math.round(((days - absent) / days) * 1000) / 10 : null)
/** ขาดติดกันได้อีกกี่ครั้งโดยยังไม่ต่ำกว่าเกณฑ์ (ถ้าไม่มาอีกเลย) */
export function absencesLeft(days: number, absent: number, minPct = MIN_ATTENDANCE_PCT): number {
  if (days === 0) return 0
  const attended = days - absent
  return Math.max(0, Math.floor((attended * 100) / minPct + 1e-9) - days)
}

export type RemedialStatus = 'assigned' | 'submitted' | 'returned' | 'passed'
export const REMEDIAL_STATUS_LABEL: Record<RemedialStatus, string> = { assigned: 'ยังไม่ส่ง', submitted: 'ส่งแล้ว รอตรวจ', returned: 'ครูส่งกลับให้แก้', passed: 'ผ่านแล้ว' }

export type RemedialItem = {
  id: string
  studentId: string
  reason: RiskReason
  title: string
  instructions: string
  dueAt: number | null
  status: RemedialStatus
  text: string
  imageKeys: string[]
  submittedAt: number | null
  comment: string
  resultGrade: string | null
  createdAt: number
}

export type AtRiskStudent = {
  id: string
  zipgradeId: string
  name: string
  flags: RiskReason[]
  grade: string | null
  attendance: { days: number; absent: number; pct: number | null }
  incomplete: { count: number; titles: string[] }
  remedials: RemedialItem[]
}
export type AtRisk = { class: { id: string; name: string }; total: number; students: AtRiskStudent[] }
export type AtRiskCounts = { zero: number; incomplete: number; attendance: number; remedialOpen: number; remedialPassed: number }

export const remedialInputSchema = z.object({
  classId: z.string().min(1),
  studentIds: z.array(z.string().min(1)).min(1).max(60),
  reason: z.enum(RISK_REASONS),
  title: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(3000).default(''),
  dueAt: z.number().int().positive().nullable().default(null),
})
export type RemedialInput = z.infer<typeof remedialInputSchema>

export const remedialDecisionSchema = z
  .object({
    pass: z.boolean(),
    /** ผลหลังซ่อม (ต้องมีเมื่อผ่าน) เช่น "1" */
    resultGrade: z.string().trim().max(5).nullable().default(null),
    comment: z.string().trim().max(1000).default(''),
  })
  .refine((x) => !x.pass || !!x.resultGrade, { message: 'กรุณาเลือกผลหลังซ่อม' })

export const remedialSubmitSchema = z.object({ text: z.string().max(5000), imageKeys: z.array(z.string()).max(10) })
