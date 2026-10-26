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

export const videoInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  url: z.string().max(500).refine((u) => parseYouTubeId(u) !== null),
})
export type VideoInput = z.infer<typeof videoInputSchema>
export const createVideosSchema = videoInputSchema.extend({ classIds: z.array(z.string()).min(1).max(50) })
export const videoPublishSchema = z.object({ published: z.boolean() })

export type TeacherVideo = { id: string; title: string; description: string; youtubeId: string; published: boolean; createdAt: number }
export type StudentVideo = { id: string; title: string; description: string; youtubeId: string; createdAt: number }
