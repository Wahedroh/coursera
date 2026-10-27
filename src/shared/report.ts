import type { AttendanceStatus } from './attendance'
import type { StudentStatus } from './assignments'

export type ReportStudent = {
  id: string
  zipgradeId: string
  name: string
  attendance: Record<AttendanceStatus, number>
  assignments: { title: string; maxScore: number; dueAt: number | null; status: StudentStatus; score: number | null }[]
  exams: { title: string; takenOn: string; maxScore: number; score: number | null; absent: boolean }[]
  total: number
  grade: string | null
  rank: number | null
  feeOutstanding: number
}
export type ClassReport = { class: { id: string; name: string }; generatedAt: number; maxTotal: number; classSize: number; students: ReportStudent[] }
