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

export const MATERIAL_KINDS = ['blank', 'notes'] as const
export type MaterialKind = (typeof MATERIAL_KINDS)[number]
export const MATERIAL_KIND_LABEL: Record<MaterialKind, string> = { blank: 'เอกสารเปล่า', notes: 'เอกสารที่จดในห้อง' }

export const materialMetaSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    topic: z.string().trim().max(100),
    kind: z.enum(MATERIAL_KINDS).default('blank'),
    /** วันที่สอน (YYYY-MM-DD) ใช้กับเอกสารที่จดในห้อง; เอกสารเปล่าเว้นว่าง */
    lessonDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(''),
  })
  .transform((m) => ({ ...m, lessonDate: m.kind === 'notes' ? m.lessonDate : '' }))
export type MaterialMeta = z.infer<typeof materialMetaSchema>
export const materialPublishSchema = z.object({ published: z.boolean() })

export type TeacherMaterial = { id: string; title: string; topic: string; kind: MaterialKind; lessonDate: string; publishAt: number | null; fileKey: string; fileName: string; size: number; published: boolean; createdAt: number }
export type StudentMaterial = Omit<TeacherMaterial, 'published' | 'publishAt'>

/** แยกเอกสารเปล่า (เรียงตามที่เพิ่มล่าสุด) กับเอกสารที่จดในห้อง (เรียงตามวันที่สอน ใหม่สุดก่อน) */
export function splitMaterials<T extends { kind: MaterialKind; lessonDate: string; createdAt: number }>(items: T[]): { blank: T[]; notes: T[] } {
  const notes = items.filter((m) => m.kind === 'notes')
  notes.sort((a, b) => (b.lessonDate || '').localeCompare(a.lessonDate || '') || b.createdAt - a.createdAt)
  return { blank: items.filter((m) => m.kind !== 'notes'), notes }
}
