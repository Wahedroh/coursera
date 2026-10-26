import { z } from 'zod'

/** เอกสารเรียน: PDF, Word, PowerPoint และรูป — ขนาดไม่เกิน 25MB ต่อไฟล์ */
export const MAX_MATERIAL_BYTES = 25 * 1024 * 1024

export const MATERIAL_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const
export type MaterialExt = keyof typeof MATERIAL_TYPES
export const MATERIAL_ACCEPT = Object.keys(MATERIAL_TYPES).map((e) => `.${e}`).join(',')

export const materialExt = (fileName: string): MaterialExt | null => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return ext in MATERIAL_TYPES ? (ext as MaterialExt) : null
}

export const materialMetaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  topic: z.string().trim().max(100),
})
export type MaterialMeta = z.infer<typeof materialMetaSchema>
export const materialPublishSchema = z.object({ published: z.boolean() })

export type TeacherMaterial = { id: string; title: string; topic: string; fileKey: string; fileName: string; size: number; published: boolean; createdAt: number }
export type StudentMaterial = Omit<TeacherMaterial, 'published'>
