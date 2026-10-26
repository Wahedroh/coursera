import { z } from 'zod'

/** ตัวละครแต่งเองของนักเรียน — ภาพพิกเซล 12×19 ประกอบจากชิ้นส่วน (ตัว, ผม, ชุดอาชีพ, หมวก, แว่น) */
export const AVATAR_W = 12
export const AVATAR_H = 19

export const SKINS = ['#F2D3B3', '#E0AC86', '#C68863', '#8D5B3E', '#5A3825'] as const
export const HAIR_COLORS = ['#1E1B1B', '#4E3524', '#A8743A', '#E3C565', '#B8435A', '#4F6FD8', '#E58FB7', '#D9D9D9'] as const

export const HAIR_STYLES = ['short', 'long', 'spiky', 'ponytail', 'bob', 'curly', 'bun'] as const
export type HairStyle = (typeof HAIR_STYLES)[number]
export const HAIR_LABEL: Record<HairStyle, string> = { short: 'ทรงสั้น', long: 'ทรงยาว', spiky: 'ทรงตั้ง', ponytail: 'หางม้า', bob: 'บ็อบ', curly: 'ผมฟู', bun: 'มวยผม' }

type Px = [x: number, y: number, color: string]
type Job = { label: string; shirt: string; accent?: string; pants: string; belt?: string; shoes?: string; extras?: Px[]; hat?: Px[]; hidesHair?: boolean }

const row = (y: number, x0: number, x1: number, c: string): Px[] => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, c])
const col = (x: number, y0: number, y1: number, c: string): Px[] => Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i, c])

const WHITE = '#F7F7F7'
const NAVY = '#26335E'
const GOLD = '#F2C14E'

export const JOBS = {
  physicist: { label: 'นักฟิสิกส์', shirt: WHITE, accent: '#4F7FE8', pants: '#3B3A5E', belt: '#DDDDDD' },
  doctor: { label: 'แพทย์', shirt: WHITE, accent: '#5DBB9A', pants: '#4AA589', extras: [...col(4, 9, 11, '#555555'), [5, 11, '#888888']] },
  engineer: { label: 'วิศวกร', shirt: '#F28C28', accent: '#FFD23F', pants: '#2F5C9E', hat: [...row(1, 4, 7, '#FFD23F'), ...row(2, 3, 8, '#FFD23F'), ...row(3, 2, 9, '#E0B020')] },
  astronaut: {
    label: 'นักบินอวกาศ',
    shirt: '#E8E8E8',
    accent: '#E94F4F',
    pants: '#E8E8E8',
    belt: '#9AA3AD',
    shoes: '#9AA3AD',
    hidesHair: true,
    hat: [...row(1, 3, 8, '#9AA3AD'), ...row(2, 2, 9, '#9AA3AD'), ...col(2, 3, 7, '#9AA3AD'), ...col(9, 3, 7, '#9AA3AD'), ...row(3, 3, 8, '#BFE3F5')],
  },
  police: { label: 'ตำรวจ', shirt: NAVY, pants: '#1B2447', extras: [[7, 9, GOLD]], hat: [...row(1, 3, 8, NAVY), [5, 1, GOLD], [6, 1, GOLD], ...row(2, 2, 9, '#111111')] },
  chef: { label: 'เชฟ', shirt: WHITE, accent: '#DDDDDD', pants: '#4A4A4A', hat: [...row(0, 4, 7, '#FFFFFF'), ...row(1, 3, 8, '#FFFFFF'), ...row(2, 3, 8, '#EEEEEE')] },
  teacher: { label: 'ครู', shirt: '#8B5E3C', accent: WHITE, pants: '#3B3A5E' },
  firefighter: {
    label: 'นักดับเพลิง',
    shirt: '#C62828',
    pants: '#3A3A3A',
    extras: row(10, 2, 9, '#FFD23F'),
    hat: [...row(1, 4, 7, '#C62828'), ...row(2, 3, 8, '#C62828'), ...row(3, 2, 9, '#8E1C1C')],
  },
  pilot: { label: 'นักบิน', shirt: WHITE, accent: NAVY, pants: NAVY, extras: [[2, 8, GOLD], [9, 8, GOLD]], hat: [...row(1, 3, 8, NAVY), [5, 1, GOLD], [6, 1, GOLD], ...row(2, 2, 9, '#111111')] },
  programmer: { label: 'โปรแกรมเมอร์', shirt: '#4A4A6A', pants: '#2A5BA8', extras: [[5, 8, '#DDDDDD'], [6, 8, '#DDDDDD']] },
  athlete: { label: 'นักกีฬา', shirt: '#E53935', accent: WHITE, pants: '#1E1E1E', shoes: WHITE },
  artist: { label: 'ศิลปิน', shirt: GOLD, accent: '#E94F4F', pants: '#3B3A5E', hat: [...row(1, 4, 6, '#C0392B'), ...row(2, 3, 8, '#C0392B'), [7, 1, '#C0392B']] },
  student: { label: 'นักเรียน', shirt: WHITE, pants: NAVY, extras: [[4, 9, '#2B5BA8']] },
  musician: { label: 'นักดนตรี', shirt: '#222222', accent: '#E94F4F', pants: '#222222', extras: [...col(2, 4, 6, '#333333'), ...col(9, 4, 6, '#333333')], hat: row(2, 2, 9, '#333333') },
  farmer: { label: 'เกษตรกร', shirt: '#6A994E', accent: '#3E6B2F', pants: '#2F5C9E', hat: [...row(1, 4, 7, '#D9B26F'), ...row(2, 1, 10, '#C9A15B')] },
  scientist: { label: 'นักวิทยาศาสตร์', shirt: WHITE, accent: '#9B5DE5', pants: '#3B3A5E', extras: [[3, 5, '#222222'], [8, 5, '#222222']] },
} satisfies Record<string, Job>
export type JobId = keyof typeof JOBS
export const JOB_IDS = Object.keys(JOBS) as JobId[]

export const avatarConfigSchema = z.object({
  gender: z.enum(['m', 'f']),
  skin: z.number().int().min(0).max(SKINS.length - 1),
  hair: z.enum(HAIR_STYLES),
  hairColor: z.number().int().min(0).max(HAIR_COLORS.length - 1),
  job: z.enum(JOB_IDS as [JobId, ...JobId[]]),
  glasses: z.boolean(),
})
export type AvatarConfig = z.infer<typeof avatarConfigSchema>
export const avatarInputSchema = z.object({ nickname: z.string().trim().max(20), config: avatarConfigSchema })

export const DEFAULT_AVATAR: AvatarConfig = { gender: 'm', skin: 0, hair: 'short', hairColor: 1, job: 'student', glasses: false }

function hairPixels(style: HairStyle, c: string): Px[] {
  const top = [...row(2, 3, 8, c), ...row(3, 3, 8, c)]
  const sideburns: Px[] = [[3, 4, c], [8, 4, c]]
  switch (style) {
    case 'short':
      return [...top, ...sideburns]
    case 'long':
      return [...top, ...col(2, 3, 9, c), ...col(9, 3, 9, c), ...col(3, 4, 5, c), ...col(8, 4, 5, c)]
    case 'spiky':
      return [[3, 1, c], [5, 1, c], [7, 1, c], [8, 1, c], ...top, ...sideburns]
    case 'ponytail':
      return [...top, ...sideburns, ...col(9, 3, 5, c), ...col(10, 4, 7, c)]
    case 'bob':
      return [...top, ...col(2, 3, 6, c), ...col(9, 3, 6, c), ...col(3, 4, 6, c), ...col(8, 4, 6, c)]
    case 'curly':
      return [...row(1, 3, 8, c), ...row(2, 2, 9, c), ...row(3, 2, 9, c), ...col(2, 4, 5, c), ...col(9, 4, 5, c)]
    case 'bun':
      return [...row(0, 5, 6, c), ...row(1, 5, 6, c), ...top, ...sideburns]
  }
}

/** พิกเซลทั้งหมดของตัวละคร (วาดตามลำดับ: ตัว → ชุด → ผม → หน้า → หมวก) — ช่องที่วาดทีหลังทับช่องเดิม */
export function avatarPixels(cfg: AvatarConfig): Px[] {
  const skin = SKINS[cfg.skin]
  const hair = HAIR_COLORS[cfg.hairColor]
  const job: Job = JOBS[cfg.job]
  const shoes = job.shoes ?? '#1E1B2E'
  const px: Px[] = []
  // ใบหน้า + มือ
  for (let y = 3; y <= 7; y++) px.push(...row(y, 3, 8, skin))
  // เสื้อ + แขนเสื้อ + มือ
  for (let y = 8; y <= 12; y++) px.push(...row(y, 3, 8, job.shirt))
  px.push(...col(2, 8, 11, job.shirt), ...col(9, 8, 11, job.shirt), [2, 12, skin], [9, 12, skin])
  if (job.accent) px.push(...col(5, 8, 12, job.accent), ...col(6, 8, 12, job.accent))
  if (cfg.gender === 'f') {
    // กระโปรง + ขา
    px.push(...row(13, 3, 8, job.pants), ...row(14, 2, 9, job.pants), ...col(4, 15, 17, skin), ...col(7, 15, 17, skin), ...row(18, 3, 4, shoes), ...row(18, 7, 8, shoes))
  } else {
    px.push(...row(13, 3, 8, job.belt ?? job.pants))
    for (let y = 14; y <= 17; y++) px.push(...row(y, 3, 4, job.pants), ...row(y, 7, 8, job.pants))
    px.push(...row(18, 3, 4, shoes), ...row(18, 7, 8, shoes))
  }
  px.push(...(job.extras ?? []))
  if (!job.hidesHair) px.push(...hairPixels(cfg.hair, hair))
  // ตา ปาก (+ แก้มแดงสำหรับผู้หญิง)
  px.push([4, 5, '#1E1B2E'], [7, 5, '#1E1B2E'], [5, 7, '#A0523D'], [6, 7, '#A0523D'])
  if (cfg.gender === 'f') px.push([3, 6, '#F09A9A'], [8, 6, '#F09A9A'])
  if (cfg.glasses) px.push([4, 4, '#333333'], [7, 4, '#333333'], [5, 5, '#333333'], [6, 5, '#333333'], [3, 5, '#333333'], [8, 5, '#333333'])
  px.push(...(job.hat ?? []))
  // ช่องเดียวกันเอาสีที่วาดทีหลังสุด
  const m = new Map<string, Px>()
  for (const p of px) if (p[0] >= 0 && p[0] < AVATAR_W && p[1] >= 0 && p[1] < AVATAR_H) m.set(`${p[0]},${p[1]}`, p)
  return [...m.values()]
}
