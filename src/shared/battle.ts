/** ศึกสอบ: ห้องที่สอบข้อสอบชุดเดียวกัน (ชื่อรายการ + คะแนนเต็มเท่ากัน) เทียบค่าเฉลี่ยรายห้อง — ไม่มีข้อมูลรายคน */
export const BATTLE_MIN_SCORED = 3
/** ผ่าน = ได้ตั้งแต่ครึ่งหนึ่งของคะแนนเต็ม */
export const BATTLE_PASS_PCT = 50

export type BattleRow = {
  classId: string
  className: string
  schoolName: string
  /** จำนวนคนที่มีคะแนน */
  n: number
  avgPct: number
  passPct: number
  /** เทียบกับสอบครั้งก่อนของห้องนี้ (จุด %) · null = ไม่มีครั้งก่อน */
  deltaPct: number | null
  rank: number
  mine?: boolean
}
export type ExamBattle = {
  key: string
  title: string
  maxScore: number
  /** วันสอบล่าสุดของกลุ่ม */
  takenOn: string
  rows: BattleRow[]
  /** ห้องที่พัฒนาขึ้นมากที่สุด (ต้องขึ้นจริง) */
  mostImproved: string | null
}
