/** แถวข้อสังเกตหน้าแรกครู: เรื่องที่ควรจัดการพร้อมตัวเลข (แตะแล้วไปหน้านั้น) */
export type TeacherInsights = {
  atRisk: { attendance: number; incomplete: number; zero: number }
  /** งานซ่อมที่นักเรียนส่งแล้วรอครูตรวจ */
  remedialToReview: number
  leavesPending: number
  /** ค่าเอกสารค้าง (ห้องที่ยังไม่เก็บถาวร) */
  fees: { students: number; baht: number }
}
