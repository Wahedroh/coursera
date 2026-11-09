import type { AttendanceStatus } from './attendance'

/** กราฟภาพรวมของห้อง (เทอมที่เลือก) */
export type ClassInsights = {
  class: { id: string; name: string }
  term: string
  students: number
  /** เช็กชื่อรายสัปดาห์ (สัปดาห์เริ่มวันจันทร์) */
  attendanceWeeks: ({ week: string } & Record<AttendanceStatus, number>)[]
  /** งานแต่ละชิ้น: ส่งตรงเวลา / ส่งช้า / ยังไม่ส่ง (เฉพาะนักเรียนที่ใช้งานอยู่) */
  assignments: { id: string; title: string; dueAt: number | null; onTime: number; late: number; missing: number; avgPct: number | null }[]
  /** คะแนนสอบแต่ละรายการ (เป็น %) · buckets = จำนวนคนในช่วง 0–9, 10–19, …, 90–100% */
  exams: { id: string; title: string; takenOn: string; n: number; avgPct: number | null; minPct: number | null; maxPct: number | null; buckets: number[] }[]
}

/** เทียบทุกห้อง (เทอมปัจจุบัน) */
export type ClassCompare = {
  term: string
  classes: { id: string; name: string; students: number; attendancePct: number | null; submitPct: number | null; examPct: number | null }[]
}
