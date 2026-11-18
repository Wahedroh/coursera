import { HAND_ITEMS, JOBS, OFFHAND_ITEMS, SPECIAL_JOBS, type HandItem, type OffhandItem, type SpecialJob } from './avatar'
import { SECRET_CHARACTERS, type Rarity } from './characters'

/** ของแถมจากการเปิดไข่ (นอกจากสัตว์วิเศษ) */
export type ItemKind = 'hand' | 'offhand' | 'outfit' | 'secret'
export const ITEM_KIND_LABEL: Record<ItemKind, string> = { hand: 'อุปกรณ์ (มือขวา)', offhand: 'อุปกรณ์ (มือซ้าย)', outfit: 'ชุดพิเศษ', secret: 'ตัวละครลึกลับ' }
export type EggItem = { id: string; kind: ItemKind; name: string; rarity: Rarity }

/** นักเรียนทดสอบของครู (ZipGrade ID) — มีของแถมครบทุกอย่างเสมอ ไว้ลองแต่งตัว/ดูหน้าตา */
export const TEST_ZIPGRADE_IDS = ['99999']

/** โอกาสได้ของแถมต่อไข่ 1 ใบ */
export const BONUS_CHANCE = 0.75

const HAND_RARITY: Record<HandItem, Rarity> = { pencil: 'common', umbrella: 'common', balloon: 'common', flag: 'common', staff: 'common', wand: 'rare', sword: 'rare', bow: 'epic', laser: 'epic' }
const OFFHAND_RARITY: Record<OffhandItem, Rarity> = { book: 'rare', shield: 'epic' }
const OUTFIT_RARITY: Record<SpecialJob, Rarity> = { ninja: 'rare', wizard: 'rare', hero: 'epic', knight: 'epic', royal: 'legendary' }

/** id ของแถม: hand:sword · offhand:shield · outfit:ninja · secret:<characterId> */
export const EGG_ITEMS: EggItem[] = [
  ...(Object.keys(HAND_RARITY) as HandItem[]).map((k) => ({ id: `hand:${k}`, kind: 'hand' as const, name: HAND_ITEMS[k].label, rarity: HAND_RARITY[k] })),
  ...(Object.keys(OFFHAND_RARITY) as OffhandItem[]).map((k) => ({ id: `offhand:${k}`, kind: 'offhand' as const, name: OFFHAND_ITEMS[k].label, rarity: OFFHAND_RARITY[k] })),
  ...SPECIAL_JOBS.map((k) => ({ id: `outfit:${k}`, kind: 'outfit' as const, name: JOBS[k].label, rarity: OUTFIT_RARITY[k] })),
  ...SECRET_CHARACTERS.map((c) => ({ id: `secret:${c.id}`, kind: 'secret' as const, name: c.name, rarity: c.rarity })),
]
export const eggItemById = (id: string) => EGG_ITEMS.find((x) => x.id === id)
/** ส่วนหลัง ':' ของ id (เช่น sword, ninja, secret-shadow-dragon) */
export const itemKey = (id: string) => id.slice(id.indexOf(':') + 1)

/** ของที่ตัวละครใส่อยู่ต้องมีจริง (ชุดพิเศษ/อุปกรณ์) — คืนชื่อของที่ยังไม่มี */
export function missingItems(cfg: { job: string; hand?: string; offhand?: string }, owned: ReadonlySet<string>): string[] {
  const need = [
    (SPECIAL_JOBS as readonly string[]).includes(cfg.job) ? `outfit:${cfg.job}` : null,
    cfg.hand && cfg.hand !== 'none' ? `hand:${cfg.hand}` : null,
    cfg.offhand && cfg.offhand !== 'none' ? `offhand:${cfg.offhand}` : null,
  ].filter((x): x is string => !!x)
  return need.filter((id) => !owned.has(id)).map((id) => eggItemById(id)?.name ?? id)
}
