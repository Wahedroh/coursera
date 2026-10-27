import { z } from 'zod'

export const watchlistQuerySchema = z.object({
  missing: z.coerce.number().int().min(1).max(50).default(3),
  absent: z.coerce.number().int().min(1).max(50).default(3),
  days: z.coerce.number().int().min(1).max(365).default(30),
  grade: z.coerce.number().min(0).max(4).default(1),
})
export type WatchlistQuery = z.infer<typeof watchlistQuerySchema>

export type WatchReason = 'missing' | 'absent' | 'grade' | 'no_pin'
export const REASON_LABEL: Record<WatchReason, string> = { missing: 'ค้างงาน', absent: 'ขาดเรียน', grade: 'เกรดต่ำ', no_pin: 'ยังไม่ตั้ง PIN' }

export type WatchStudent = {
  id: string
  zipgradeId: string
  name: string
  reasons: WatchReason[]
  missing: number
  missingTitles: string[]
  absent: number
  late: number
  grade: string | null
}
export type Watchlist = { query: WatchlistQuery; from: string; classes: { id: string; name: string; total: number; students: WatchStudent[] }[] }
