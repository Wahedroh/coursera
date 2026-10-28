import type { Gradebook } from './assignments'
import type { AttendanceRange } from './attendance'
import type { ClassGrades } from './grades'
import type { ScoreBook } from './scores'

export const EXPORT_KINDS = ['scores', 'attendance', 'grades', 'fees'] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]
export const EXPORT_LABEL: Record<ExportKind, string> = { scores: 'คะแนน', attendance: 'เช็กชื่อ', grades: 'เกรด', fees: 'ค่าเอกสาร' }

export type ClassFees = {
  items: { id: string; title: string; amount: number }[]
  charges: { itemId: string; studentId: string; amount: number; paid: number }[]
}
/** ข้อมูลทั้งหมดของห้องสำหรับส่งออก (ดึงทีละห้อง ไม่ให้เกินเพดานคำสั่งต่อคำขอของ D1) */
export type ClassExport = { gradebook: Gradebook; scoreBook: ScoreBook; grades: ClassGrades; attendance: AttendanceRange; fees: ClassFees; from: string; to: string }
