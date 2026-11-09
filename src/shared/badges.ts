/** เหรียญตราความสำเร็จ — นับจากข้อมูลทุกเทอม (ได้แล้วอยู่ตลอด) */
export const BADGES = [
  { id: 'attend20', icon: '🙋', title: 'ขาประจำ', desc: 'มาเรียน 20 คาบ', need: 20 },
  { id: 'fullMonth', icon: '📅', title: 'มาครบทั้งเดือน', desc: 'เดือนที่เช็กชื่อ ≥ 4 คาบ และมาเรียนทุกคาบ', need: 1 },
  { id: 'onTime10', icon: '📝', title: 'ตรงเวลาเสมอ', desc: 'ส่งงานตรงเวลา 10 ชิ้น', need: 10 },
  { id: 'perfect3', icon: '💯', title: 'เต็มร้อย', desc: 'ได้คะแนนเต็มงาน 3 ชิ้น', need: 3 },
  { id: 'exam80', icon: '⭐', title: 'สอบเก่ง', desc: 'สอบได้ 80% ขึ้นไป 3 ครั้ง', need: 3 },
  { id: 'video10', icon: '🎬', title: 'นักทบทวน', desc: 'ทบทวนคลิป 10 คลิป', need: 10 },
  { id: 'quest4', icon: '🎯', title: 'นักล่าภารกิจ', desc: 'ทำภารกิจครบ 3 ข้อ 4 สัปดาห์', need: 4 },
  { id: 'collect8', icon: '🥚', title: 'นักสะสม', desc: 'มีตัวละคร 8 ตัว', need: 8 },
  { id: 'fullSet', icon: '🏆', title: 'ครบชุด', desc: 'สะสมตัวละครครบ 1 ซีซัน (16 ตัว)', need: 1 },
] as const
export type BadgeId = (typeof BADGES)[number]['id']
export type StudentBadge = { id: BadgeId; icon: string; title: string; desc: string; need: number; progress: number; earned: boolean }
