import { z } from 'zod'
import { dateSchema } from './attendance'

export const announcementInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(3000),
  pinned: z.boolean(),
  /** แสดงถึงวันนี้ (รวมวันนี้ตามเวลาไทย) · null = แสดงจนกว่าครูจะลบ */
  expiresOn: dateSchema.nullable(),
})
export type AnnouncementInput = z.infer<typeof announcementInputSchema>
export const createAnnouncementsSchema = announcementInputSchema.extend({ classIds: z.array(z.string()).min(1).max(50) })

export type TeacherAnnouncement = AnnouncementInput & { id: string; createdAt: number; readCount: number; total: number; unread: string[]; expired: boolean }
export type StudentAnnouncement = { id: string; title: string; body: string; pinned: boolean; createdAt: number; read: boolean }
