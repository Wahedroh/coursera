/** ภารกิจประจำสัปดาห์ (จันทร์–อาทิตย์ เวลาไทย) — ทำครบกดรับ EXP โบนัสได้สัปดาห์ละครั้งต่อภารกิจ */
export const QUESTS = [
  { id: 'attend', icon: '🙋', title: 'มาเรียน 3 คาบ', need: 3, exp: 5 },
  { id: 'submit', icon: '📝', title: 'ส่งงานตรงเวลา 1 ชิ้น', need: 1, exp: 5 },
  { id: 'video', icon: '🎬', title: 'ทบทวนคลิป 1 คลิป', need: 1, exp: 5 },
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
