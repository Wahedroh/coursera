import { z } from 'zod'

export const teacherLoginSchema = z.object({ password: z.string().min(1).max(200) })

export const MAX_CSV_CHARS = 1_000_000
export const rosterPreviewSchema = z.object({ csv: z.string() })
export const rosterApplySchema = z.object({ csv: z.string(), deactivateMissing: z.boolean() })

export const PIN_RE = /^\d{4}$/
export const studentLookupSchema = z.object({ zipgradeId: z.string().max(32) })
export const studentPinSchema = z.object({ zipgradeId: z.string().max(32), pin: z.string().max(32) })

export const STUDENT_TITLES = ['เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว', 'นาง'] as const
/** ครูเพิ่มนักเรียนทีละคน (เช่น ย้ายเข้ากลางเทอม) */
export const addStudentSchema = z.object({
  zipgradeId: z.string().trim().min(1).max(20).regex(/^[0-9A-Za-z_-]+$/),
  title: z.enum(STUDENT_TITLES).nullable(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100),
})
export type AddStudentInput = z.infer<typeof addStudentSchema>
