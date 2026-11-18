import type { GradeBand } from './grades'

/** การ์ดหน้าแรกนักเรียน: คาบถัดไป · เวลาเรียน · เป้าหมายเกรด · ครูตอบงาน · งานซ่อม */
export type StudentHomeCards = {
  next: {
    start: number
    end: number
    /** กำลังเรียนอยู่ตอนนี้ */
    now: boolean
    online: boolean
    meetUrl: string | null
    note: string
    /** งานที่ยังไม่ส่งและครบกำหนดก่อนคาบนี้จบ */
    due: { id: string; title: string; dueAt: number }[]
  } | null
  attendance: { days: number; present: number; late: number; sick: number; leave: number; absent: number; pct: number | null; left: number; min: number }
  /** null = ครูยังไม่เปิดให้ดูเกรด */
  target: {
    grade: string | null
    /** ต่อเกรด: ต้องได้คะแนนเพิ่มอีกเท่าไร และความคืบหน้า (%) — ไม่ส่งคะแนนรวมจริง (รวมคะแนนสอบที่ครูยังไม่เผยแพร่ และเผยคะแนนเพื่อน) */
    bands: { grade: string; gap: number; pct: number }[]
    /** งานที่ยังไม่ส่ง (ส่งแล้วจะได้คะแนนเพิ่ม) */
    pending: { id: string; title: string; maxScore: number; dueAt: number | null }[]
  } | null
  feedback: { assignmentId: string; title: string; status: 'graded' | 'returned'; score: number | null; maxScore: number; comment: string; at: number }[]
  remedials: { id: string; title: string; status: 'assigned' | 'submitted' | 'returned' | 'passed'; dueAt: number | null }[]
}

/**
 * คะแนนรวมขั้นต่ำที่ต้องมีเพื่อให้เปอร์เซ็นไทล์ถึงเกณฑ์ของแต่ละเกรด (เกรดอิงกลุ่ม)
 * เปอร์เซ็นไทล์ = % ของคนในห้อง (รวมเรา) ที่คะแนน ≤ เรา · คนอื่นคะแนนเท่าเดิม
 */
export function pointsForBands(mine: number, others: number[], bands: GradeBand[]): { grade: string; need: number; gap: number }[] {
  const n = others.length + 1
  const pct = (t: number) => ((others.filter((o) => o <= t + 1e-9).length + 1) / n) * 100
  const candidates = [mine, ...others.filter((o) => o > mine)].sort((a, b) => a - b)
  return bands
    .filter((b) => b.min > 0)
    .map((b) => {
      const need = candidates.find((t) => pct(t) >= b.min - 1e-9) ?? Math.max(mine, ...others)
      return { grade: b.grade, need: Math.round(need * 100) / 100, gap: Math.round(Math.max(0, need - mine) * 100) / 100 }
    })
}
