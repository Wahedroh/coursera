import { z } from 'zod'
import { dateSchema } from './attendance'

export const SCORE_CATEGORIES = ['quiz', 'midterm', 'final', 'other'] as const
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number]
export const CATEGORY_LABEL: Record<ScoreCategory, string> = { quiz: 'สอบย่อย', midterm: 'กลางภาค', final: 'ปลายภาค', other: 'อื่น ๆ' }

/** ทศนิยมไม่เกิน 2 ตำแหน่ง (เผื่อ error ของ floating point) */
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6

export const scoreItemInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum(SCORE_CATEGORIES),
  maxScore: z.number().positive().max(1000).refine(twoDecimals),
  takenOn: dateSchema,
})
export type ScoreItemInput = z.infer<typeof scoreItemInputSchema>

export const createScoreItemsSchema = scoreItemInputSchema.extend({ classIds: z.array(z.string()).min(1).max(50) })
export const publishInputSchema = z.object({ published: z.boolean() })

export const scoreInputSchema = z.object({
  score: z.number().nullable(),
  absent: z.boolean(),
  note: z.string().max(500),
})
export type ScoreInput = z.infer<typeof scoreInputSchema>

export function validScore(v: number, max: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= max && twoDecimals(v)
}

/** แปลงข้อความในช่องกรอก: ว่าง = ยังไม่กรอก; รับคอมมาเป็นจุดทศนิยม */
export function parseScore(text: string, max: number): { ok: true; value: number | null } | { ok: false } {
  const t = text.trim().replace(',', '.')
  if (t === '') return { ok: true, value: null }
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false }
  const v = Number(t)
  return validScore(v, max) ? { ok: true, value: v } : { ok: false }
}

/** ข้อความที่วางจาก Excel/Google Sheets → ค่าต่อบรรทัด (คอลัมน์แรก) เรียงตามลำดับรายชื่อ */
export function parsePastedColumn(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines.map((l) => l.split('\t')[0].trim())
}

export function scoreStats(values: (number | null)[]): { filled: number; avg: number | null; max: number | null; min: number | null } {
  const v = values.filter((x): x is number => x !== null)
  if (v.length === 0) return { filled: 0, avg: null, max: null, min: null }
  return { filled: v.length, avg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100, max: Math.max(...v), min: Math.min(...v) }
}

export type ScoreItemSummary = {
  id: string
  title: string
  category: ScoreCategory
  maxScore: number
  takenOn: string
  published: boolean
  filled: number
  total: number
}

export type ScoreRow = {
  id: string
  zipgradeId: string
  title: string | null
  firstName: string
  lastName: string
  score: number | null
  absent: boolean
  note: string
}

export type ScoreSheet = {
  item: { id: string; classId: string; title: string; category: ScoreCategory; maxScore: number; takenOn: string; published: boolean }
  class: { id: string; name: string }
  students: ScoreRow[]
}

export type StudentScore = { id: string; title: string; category: ScoreCategory; maxScore: number; takenOn: string; score: number | null; absent: boolean; note: string }

export type ScoreBook = {
  items: { id: string; title: string; maxScore: number }[]
  cells: Record<string, Record<string, { score: number | null; absent: boolean }>>
}
