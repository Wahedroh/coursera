import { z } from 'zod'

const ID_RE = /^[A-Za-z0-9_-]{11}$/
const HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']

/** ลิงก์ YouTube ทุกรูปแบบที่พบบ่อย (หรือรหัส 11 ตัว) → รหัสคลิป; ไม่ใช่ YouTube = null */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim()
  if (ID_RE.test(s)) return s
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
  if (!HOSTS.includes(url.hostname.toLowerCase())) return null
  const parts = url.pathname.split('/').filter(Boolean)
  let id: string | null | undefined
  if (url.hostname.toLowerCase() === 'youtu.be') id = parts[0]
  else if (parts[0] === 'watch') id = url.searchParams.get('v')
  else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1]
  return id && ID_RE.test(id) ? id : null
}

/** คำถามท้ายคลิป: ตัวเลือก 2–4 ข้อ · answer = ลำดับตัวเลือกที่ถูก (เริ่ม 0)
 *  โจทย์เป็นข้อความ รูป หรือทั้งสองอย่าง · มีรูปแล้วเว้นตัวเลือกว่างได้ (นักเรียนเห็นเป็น ก ข ค ง) */
export const videoQuestionSchema = z
  .object({
    q: z.string().trim().max(300),
    image: z.string().regex(/^quiz\/[A-Za-z0-9]+\.(jpg|png|webp)$/).optional(),
    choices: z.array(z.string().trim().max(150)).min(2).max(4),
    answer: z.number().int().min(0).max(3),
  })
  .refine((x) => x.answer < x.choices.length)
  .refine((x) => x.q.length > 0 || !!x.image, { message: 'ต้องมีคำถามเป็นข้อความหรือรูป' })
  .refine((x) => !!x.image || x.choices.every((c) => c.length > 0), { message: 'กรอกตัวเลือกให้ครบ (หรือใส่รูปโจทย์ที่มีตัวเลือกในรูป)' })
export type VideoQuestion = z.infer<typeof videoQuestionSchema>
export const MAX_VIDEO_QUESTIONS = 3

export const videoInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  url: z.string().max(500).refine((u) => parseYouTubeId(u) !== null),
  questions: z.array(videoQuestionSchema).max(MAX_VIDEO_QUESTIONS).default([]),
})
export type VideoInput = z.infer<typeof videoInputSchema>
export const createVideosSchema = videoInputSchema.extend({ classIds: z.array(z.string()).min(1).max(50) })
export const videoPublishSchema = z.object({ published: z.boolean() })

export type TeacherVideo = { id: string; title: string; description: string; youtubeId: string; published: boolean; createdAt: number; questions: VideoQuestion[] }
/** นักเรียนเห็นคำถามแต่ไม่เห็นเฉลย */
export type StudentVideo = { id: string; title: string; description: string; youtubeId: string; createdAt: number; rewarded: boolean; quiz: { q: string; image?: string; choices: string[] }[] }
/** ดูคลิปแล้ว: วินาทีที่ดูจริง (ไม่นับซ้ำ) และความยาวคลิป · answers = คำตอบคำถามท้ายคลิป (ถ้ามี) */
export const videoWatchSchema = z.object({
  watchedSeconds: z.number().min(0).max(86400),
  durationSeconds: z.number().positive().max(86400),
  answers: z.array(z.number().int().min(0).max(3)).max(MAX_VIDEO_QUESTIONS).default([]),
})
export type VideoWatchResult = { awarded: boolean; exp: number; correct?: number; total?: number }
