import { z } from 'zod'

/** ช่วงเกรดแบบอิงกลุ่ม: ได้ grade เมื่อเปอร์เซ็นไทล์ ≥ min (เรียงจากเกรดสูงไปต่ำ ช่วงสุดท้าย min = 0) */
export type GradeBand = { grade: string; min: number }

export const DEFAULT_BANDS: GradeBand[] = [
  { grade: '4', min: 76 },
  { grade: '3.5', min: 66 },
  { grade: '3', min: 56 },
  { grade: '2.5', min: 46 },
  { grade: '2', min: 36 },
  { grade: '1.5', min: 26 },
  { grade: '1', min: 16 },
  { grade: '0', min: 0 },
]
export const FIVE_LEVEL_BANDS: GradeBand[] = [
  { grade: '4', min: 76 },
  { grade: '3', min: 51 },
  { grade: '2', min: 26 },
  { grade: '1', min: 11 },
  { grade: '0', min: 0 },
]

export const gradingSchema = z.object({
  bands: z
    .array(z.object({ grade: z.string().trim().min(1).max(5), min: z.number().int().min(0).max(100) }))
    .min(2)
    .max(10)
    .refine((bs) => bs.every((b, i) => i === 0 || b.min < bs[i - 1].min), 'ต้องเรียงจากมากไปน้อย')
    .refine((bs) => bs[bs.length - 1].min === 0, 'ช่วงสุดท้ายต้องเริ่มที่ 0')
    .refine((bs) => new Set(bs.map((b) => b.grade)).size === bs.length, 'เกรดซ้ำ'),
  visible: z.boolean(),
})
export type GradingSettings = z.infer<typeof gradingSchema>
export const DEFAULT_GRADING: GradingSettings = { bands: DEFAULT_BANDS, visible: false }

export type GradeResult = { percentile: number; rank: number; grade: string }

/**
 * เปอร์เซ็นไทล์ = % ของคนในกลุ่มที่คะแนน ≤ คะแนนเรา (คนที่สูงสุดได้ 100)
 * คะแนนเท่ากันได้เปอร์เซ็นไทล์/อันดับ/เกรดเท่ากัน · อันดับแบบ 1, 1, 3
 */
export function assignGrades(students: { id: string; total: number }[], bands: GradeBand[]): Map<string, GradeResult> {
  const n = students.length
  const out = new Map<string, GradeResult>()
  if (n === 0) return out
  const sorted = students.map((s) => s.total).sort((a, b) => a - b)
  const atMost = (t: number) => {
    // จำนวนคนที่คะแนน ≤ t (binary search บน sorted จากน้อยไปมาก)
    let lo = 0
    let hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] <= t + 1e-9) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  for (const s of students) {
    const le = atMost(s.total)
    const percentile = Math.round((le / n) * 10000) / 100
    const above = students.filter((x) => x.total > s.total + 1e-9).length
    const band = bands.find((b) => percentile >= b.min) ?? bands[bands.length - 1]
    out.set(s.id, { percentile, rank: above + 1, grade: band.grade })
  }
  return out
}

/** ข้อความช่วงของแต่ละเกรด เช่น "76–100" */
export function bandRanges(bands: GradeBand[]): string[] {
  return bands.map((b, i) => `${b.min}–${i === 0 ? 100 : bands[i - 1].min - 1}`)
}

export type ClassGrades = {
  settings: GradingSettings
  maxTotal: number
  itemCounts: { assignments: number; exams: number }
  students: {
    id: string
    zipgradeId: string
    title: string | null
    firstName: string
    lastName: string
    assignmentTotal: number
    examTotal: number
    total: number
    percentile: number | null
    rank: number | null
    grade: string | null
  }[]
}

export type StudentGrade = { visible: false } | { visible: true; total: number; maxTotal: number; grade: string | null }
