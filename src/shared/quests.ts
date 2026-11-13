/** ภารกิจประจำสัปดาห์ (จันทร์–อาทิตย์ เวลาไทย) — ทำครบกดรับ EXP โบนัสได้สัปดาห์ละครั้งต่อภารกิจ */
export const QUESTS = [
  /** need จริง = จำนวนคาบที่ครูเปิดเช็กชื่อในสัปดาห์นั้น (ไม่นับวันที่ป่วย/ลา) — ห้องที่เรียนสัปดาห์ละคาบก็ทำได้ */
  { id: 'attend', icon: '🙋', title: 'มาเรียนครบทุกคาบของสัปดาห์', need: 1, exp: 3 },
  { id: 'submit', icon: '📝', title: 'ส่งงานตรงเวลา 1 ชิ้น', need: 1, exp: 3 },
  { id: 'video', icon: '🎬', title: 'ทบทวนคลิป 1 คลิป', need: 1, exp: 3 },
] as const
export type QuestId = (typeof QUESTS)[number]['id']
export type StudentQuest = { id: QuestId; icon: string; title: string; need: number; exp: number; progress: number; claimed: boolean }
export type WeeklyQuests = { week: string; endsAt: number; quests: StudentQuest[] }

const DAY = 86400_000
const TZ = 7 * 3600_000
/** เวลาเริ่มสัปดาห์ (จันทร์ 00:00 เวลาไทย) ของเวลา t */
export function weekStartBangkok(t: number): number {
  const local = t + TZ
  const dow = new Date(local).getUTCDay() // 0 = อาทิตย์
  return Math.floor(local / DAY) * DAY - ((dow + 6) % 7) * DAY - TZ
}

/** สตรีคมาเรียน: รางวัลเมื่อมาเรียนต่อเนื่องครบ (ครั้งเดียวต่อเทอมต่อขั้น) */
export const STREAK_REWARDS = [
  { at: 5, exp: 5 },
  { at: 10, exp: 8 },
  { at: 20, exp: 12 },
  { at: 40, exp: 15 },
] as const
/** โล่กันสตรีค: ขาดได้กี่ครั้งต่อเทอมโดยสตรีคไม่ขาด */
export const STREAK_SHIELDS = 1
export type Streak = { current: number; best: number; shieldsLeft: number; next: { at: number; exp: number } | null; rewards: { at: number; exp: number; got: boolean }[] }

/** วงล้อนำโชค: ทำภารกิจสัปดาห์ครบทุกข้อ = หมุนได้ 1 ครั้ง/สัปดาห์ · รางวัลเป็น EXP (สุ่มที่เซิร์ฟเวอร์) */
export const WHEEL = [2, 3, 4, 5, 3, 6, 4, 10] as const
export type WheelState = { canSpin: boolean; spun: { index: number; exp: number } | null; week: string }

/*  งบ EXP ต่อเทอม (18 สัปดาห์) — ปรับให้รวมใกล้เดิม:
 *  ภารกิจ 3×3 = 9/สัปดาห์ (เดิม 15) · วงล้อเฉลี่ย ~4.6/สัปดาห์ · สตรีคสูงสุด 40/เทอม
 *  ≈ (9 + 4.6) × 18 + 40 ≈ 285  (เดิม 15 × 18 = 270) */
