/** ภาพรวมทุกห้องของแต่ละเมนูครู (แยกโรงเรียน → ชั้น) */
export const OVERVIEW_KINDS = [
  'gradebook',
  'new-assignment',
  'attendance',
  'seating',
  'scores',
  'grades',
  'insights',
  'calendar',
  'card-game',
  'analysis',
  'report-cards',
  'videos',
  'announcements',
  'materials',
  'fees',
] as const
export type OverviewKind = (typeof OVERVIEW_KINDS)[number]
export const isOverviewKind = (k: string): k is OverviewKind => (OVERVIEW_KINDS as readonly string[]).includes(k)

export type OverviewItem = { title: string; meta: string; tone?: 'green' | 'amber' | 'red' | 'gray' | 'purple' | 'blue' }
export type OverviewClass = { classId: string; stat: string | null; items: OverviewItem[]; more: number }
export type Overview = { kind: OverviewKind; classes: OverviewClass[] }

/** รายการต่อห้องที่แสดงในหน้าภาพรวม (ที่เหลือบอกเป็น "อีก N รายการ") */
export const OVERVIEW_ITEMS_PER_CLASS = 8
