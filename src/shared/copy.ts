import { z } from 'zod'
import { publishSchema } from './timetable'

export const COPY_TYPES = ['assignment', 'score-item', 'video', 'material', 'announcement'] as const
export type CopyType = (typeof COPY_TYPES)[number]
export const COPY_TYPE_LABEL: Record<CopyType, string> = { assignment: 'งาน', 'score-item': 'สอบ', video: 'คลิป', material: 'เอกสาร', announcement: 'ประกาศ' }

/** กำหนดส่งของงานที่คัดลอก: เท่าเดิม · คาบถัดไปของห้องนั้น (หลังเวลาเผยแพร่) · ไม่มีกำหนดส่ง */
export const COPY_DUE = ['same', 'next-period', 'none'] as const

export const copySchema = z
  .object({
    type: z.enum(COPY_TYPES),
    ids: z.array(z.string()).min(1).max(30),
    classIds: z.array(z.string()).min(1).max(50),
    due: z.enum(COPY_DUE).default('same'),
  })
  .extend(publishSchema.shape)
export type CopyInput = z.infer<typeof copySchema>

/** คลังของครู: ของที่เคยสร้าง จัดกลุ่มตามชื่อ (ใช้ชิ้นล่าสุดเป็นต้นแบบ) */
export type LibraryItem = { title: string; latestId: string; classCount: number; lastUsed: number; detail: string }
