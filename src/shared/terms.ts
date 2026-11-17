import { z } from 'zod'

export type Term = { id: string; name: string; startedAt: number; season: number }
/** ช่วงเวลาของเทอม [start, end) — end ของเทอมปัจจุบัน = ไม่มีที่สิ้นสุด */
export type TermWindow = { term: Term; start: number; end: number }
export const OPEN_END = Number.MAX_SAFE_INTEGER

/** เปิดเทอมใหม่: เลือกเทอม (1/2) + ปีการศึกษา → ชื่อ "1/2570" · ซีซันสัตว์วิเศษ = เลขเทอม
 *  from = วันเปิดเทอม (ตารางสอนเทอมเดิมเลิกใช้ตั้งแต่วันนี้) · copyTimetable = คัดลอกคาบเดิมมาใช้ต่อ */
export const newTermSchema = z.object({
  semester: z.union([z.literal(1), z.literal(2)]),
  year: z.number().int().min(2500).max(2700),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  copyTimetable: z.boolean().default(false),
})
export type NewTermInput = z.infer<typeof newTermSchema>
export const termName = (semester: number, year: number) => `${semester}/${year}`
/** "2/2569" → { semester: 2, year: 2569 } */
export function parseTermName(name: string): { semester: 1 | 2; year: number } | null {
  const m = /^([12])\/(\d{4})$/.exec(name.trim())
  return m ? { semester: Number(m[1]) as 1 | 2, year: Number(m[2]) } : null
}
/** เทอมถัดไป: 1/2569 → 2/2569 · 2/2569 → 1/2570 */
export function nextTerm(name: string): { semester: 1 | 2; year: number } | null {
  const p = parseTermName(name)
  if (!p) return null
  return p.semester === 1 ? { semester: 2, year: p.year } : { semester: 1, year: p.year + 1 }
}
/** ซีซันสัตว์วิเศษของเทอม: เทอม 1 = ซีซัน 1 · เทอม 2 = ซีซัน 2 */
export const seasonOfSemester = (semester: number) => (semester === 2 ? 2 : 1)
