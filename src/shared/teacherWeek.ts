import { z } from 'zod'
import { dateSchema } from './attendance'

/** รายการในปฏิทินรายสัปดาห์ของครู */
export type WeekItem = {
  kind: 'exam' | 'activity' | 'holiday' | 'due' | 'makeup' | 'todo'
  id: string
  title: string
  date: string
  /** เวลา/คาบ (ถ้ามี) */
  time: string
  className: string
  classId: string | null
  /** ลิงก์ไปหน้าที่เกี่ยวข้อง */
  url: string | null
  /** เฉพาะ todo */
  done: boolean
}
export type TeacherWeek = { from: string; to: string; days: { date: string; items: WeekItem[] }[] }

export const WEEK_KIND_LABEL: Record<WeekItem['kind'], string> = { exam: 'สอบ', activity: 'กิจกรรม', holiday: 'วันหยุด', due: 'กำหนดส่ง', makeup: 'สอบย้อนหลัง', todo: 'ต้องทำ' }
/** ปุ่มลัดเพิ่มสิ่งที่ต้องทำ */
export const TODO_PRESETS = ['🖨️ ปริ้นเอกสาร', '📝 เตรียมข้อสอบ', '✅ ตรวจงาน', '📊 กรอกคะแนน'] as const

export const todoInputSchema = z.object({
  title: z.string().trim().min(1, 'พิมพ์สิ่งที่ต้องทำ').max(120),
  date: dateSchema,
  classId: z.string().min(1).nullable().default(null),
})
export const todoUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  date: dateSchema.optional(),
  done: z.boolean().optional(),
})
