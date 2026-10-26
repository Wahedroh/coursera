import { sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { now } from '../db/client'

/** นับครั้ง (fixed window) แล้วคืน true ถ้าเกิน limit แล้ว */
export async function hitRateLimit(db: Db, key: string, limit: number, windowMs: number): Promise<boolean> {
  const t = now()
  const expired = t - windowMs
  const row = await db.get<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${t}, 1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN window_start <= ${expired} THEN 1 ELSE count + 1 END,
      window_start = CASE WHEN window_start <= ${expired} THEN ${t} ELSE window_start END
    RETURNING count`)
  return row.count > limit
}

/** ตรวจอย่างเดียว ไม่นับเพิ่ม: true ถ้าในหน้าต่างปัจจุบันนับครบ limit แล้ว */
export async function isRateLimited(db: Db, key: string, limit: number, windowMs: number): Promise<boolean> {
  const row = await db.get<{ count: number } | undefined>(
    sql`SELECT count FROM rate_limits WHERE key = ${key} AND window_start > ${now() - windowMs}`,
  )
  return (row?.count ?? 0) >= limit
}

/** คืนสิทธิ์ 1 ครั้ง (ใช้กับแบบ "จองก่อน ตรวจทีหลัง" เมื่อผลออกมาว่าสำเร็จ) */
export async function refundRateLimit(db: Db, key: string): Promise<void> {
  await db.run(sql`UPDATE rate_limits SET count = max(count - 1, 0) WHERE key = ${key}`)
}
