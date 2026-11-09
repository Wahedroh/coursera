import { sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import type { Env } from '../env'
import { termWindow } from '../terms/service'
import { drain, type PushSender } from './service'

const DAY = 86400_000

/** เตือนงานที่จะครบกำหนดใน 24 ชั่วโมง ให้คนที่ยังไม่ส่ง (ครั้งเดียวต่องานต่อคน) */
export async function enqueueDueReminders(env: Pick<Env, 'DB'>, t: number): Promise<number> {
  const db = getDb(env)
  const { start } = await termWindow(db)
  const res = await db.run(sql`
    INSERT INTO notifications (id, student_id, title, body, url, dedupe_key, created_at)
    SELECT lower(hex(randomblob(13))), st.id, '⏰ งานใกล้ครบกำหนด', a.title || ' · ครบกำหนดภายใน 24 ชั่วโมง', '/me/assignments/' || a.id, 'due:' || a.id || ':' || st.id, ${t}
    FROM assignments a JOIN students st ON st.class_id = a.class_id AND st.active = 1
    WHERE a.published = 1 AND a.created_at >= ${start} AND a.due_at > ${t} AND a.due_at <= ${t + DAY}
      AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = st.id AND s.status != 'returned')
    ON CONFLICT DO NOTHING`)
  return res.meta.changes ?? 0
}

/** งานตามเวลา (ทุก 30 นาที): เตือนงานใกล้ครบกำหนด แล้วส่ง push ที่ค้าง */
export async function runCron(env: Pick<Env, 'DB'>, t: number, send?: PushSender) {
  const reminders = await enqueueDueReminders(env, t)
  return { reminders, ...(await drain(getDb(env), t, send)) }
}
