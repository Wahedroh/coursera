/** สรุปวันนี้ของครู (ทุกห้อง เทอมปัจจุบัน) */
export type TeacherToday = {
  date: string
  term: string
  /** งานที่นักเรียนส่งแล้วรอตรวจ — ลิงก์ไปงานที่ส่งชิ้นแรกที่ยังไม่ตรวจ */
  toGrade: { assignmentId: string; title: string; classId: string; className: string; waiting: number; firstSubmissionId: string }[]
  /** ขาดเรียนวันนี้ (ห้องที่เช็กชื่อแล้ว) */
  absent: { classId: string; className: string; names: string[] }[]
  /** งานที่ครบกำหนดภายใน 3 วัน และจำนวนคนที่ยังไม่ส่ง */
  dueSoon: { assignmentId: string; title: string; classId: string; className: string; dueAt: number; missing: number }[]
}
export const DUE_SOON_DAYS = 3
