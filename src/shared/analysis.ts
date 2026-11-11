/** วิเคราะห์นักเรียนรายคน (คำนวณจากข้อมูลในระบบด้วยเกณฑ์ตายตัว ไม่ส่งข้อมูลออกนอกระบบ) */
export type RiskLevel = 'urgent' | 'watch' | 'good'
export const RISK_LABEL: Record<RiskLevel, string> = { urgent: 'ต้องดูแลด่วน', watch: 'เฝ้าระวัง', good: 'ดี' }

/** เกณฑ์ (ครูอ่านได้ในหน้า) */
export const RULES = {
  urgent: { attendancePct: 80, missing: 5, examPct: 50, grade: 1 },
  watch: { attendancePct: 90, late: 3, missing: 2, declining: 3 },
  excellent: { examPct: 85 },
} as const

export type StudentAnalysis = {
  id: string
  zipgradeId: string
  name: string
  level: RiskLevel
  attendancePct: number | null
  absent: number
  late: number
  done: number
  due: number
  missing: number
  examAvg: number | null
  classExamAvg: number | null
  trend: 'up' | 'down' | 'flat' | null
  grade: string | null
  rank: number | null
  headline: string
  issues: string[]
  focus: string[]
  strengths: string[]
  exams: { title: string; pct: number | null; classAvg: number | null; absent: boolean }[]
  videos: { watched: number; total: number }
  cardsPct: number | null
  note: string
}
export type ClassAnalysis = { class: { id: string; name: string }; term: { id: string; name: string }; students: StudentAnalysis[]; counts: Record<RiskLevel, number> }
