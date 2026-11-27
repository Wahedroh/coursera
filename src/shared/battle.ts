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
/** อันดับรายคนสูงสุดของศึกสอบ */
export const BATTLE_TOP = 10
/** ชื่อที่แสดงเมื่อนักเรียนยังไม่ตั้งชื่อเล่น (ไม่แสดงชื่อจริง) */
export const NO_NICKNAME = 'ยังไม่ตั้งชื่อเล่น'
/** ผู้เล่นในอันดับรายคน: แสดงเฉพาะชื่อเล่น (ชื่อในเกม) + โรงเรียน · ไม่มีชื่อจริง/ห้อง/รหัส */
export type BattlePlayer = {
  rank: number
  nickname: string
  schoolName: string
  score: number
  pct: number
  /** ตัวละคร (ไว้แสดงบนโพเดียม) */
  avatar: unknown
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
  /** อันดับรายคน 10 อันดับแรก (ทุกห้องรวมกัน) */
  top: BattlePlayer[]
  /** จำนวนคนที่มีคะแนนทั้งหมด */
  players: number
  /** อันดับของฉัน (มุมนักเรียน) */
  me: { rank: number; score: number; pct: number } | null
}
