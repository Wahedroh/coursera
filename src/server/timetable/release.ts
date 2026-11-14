import { sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { enqueueForClasses } from '../push/service'
import { notifyReleased } from '../teacherNotify/service'

/** แคชต่อ isolate: เวลาที่จะมีของถึงกำหนดเผยแพร่ครั้งถัดไป (ตรวจฐานข้อมูลไม่เกินนาทีละครั้ง) */
let nextAt: number | null = null
let checkedAt = 0
const CHECK_EVERY = 60_000

/** ครูตั้งเวลา/แก้เวลาเผยแพร่ → ให้ตรวจใหม่ทันทีในคำขอถัดไป */
export function invalidateRelease() {
  checkedAt = 0
}

/**
 * เปิดเผยแพร่ของที่ถึงเวลาแล้ว (งาน · คลิป · เอกสาร · ประกาศ) และแจ้งเตือนนักเรียน (งาน/ประกาศ)
 * เรียกก่อนคำขอของนักเรียนและในงานตามเวลา · คืนจำนวนที่เปิด
 */
export async function releaseDue(db: Db, t: number, force = false): Promise<number> {
  if (!force && t - checkedAt < CHECK_EVERY && (nextAt === null || t < nextAt)) return 0
  checkedAt = t
  const [row] = await db.all<{ at: number | null }>(sql`
    SELECT min(at) AS at FROM (
      SELECT min(publish_at) AS at FROM assignments WHERE published = 0 AND publish_at IS NOT NULL
      UNION ALL SELECT min(publish_at) FROM videos WHERE published = 0 AND publish_at IS NOT NULL
      UNION ALL SELECT min(publish_at) FROM materials WHERE published = 0 AND publish_at IS NOT NULL
      UNION ALL SELECT min(publish_at) FROM announcements WHERE published = 0 AND publish_at IS NOT NULL)`)
  nextAt = row?.at ?? null
  if (nextAt === null || nextAt > t) return 0
  const asg = await db.all<{ id: string; classId: string; title: string }>(sql`
    UPDATE assignments SET published = 1, publish_at = NULL WHERE published = 0 AND publish_at IS NOT NULL AND publish_at <= ${t}
    RETURNING id, class_id AS classId, title`)
  const ann = await db.all<{ id: string; classId: string; title: string; body: string }>(sql`
    UPDATE announcements SET published = 1, publish_at = NULL WHERE published = 0 AND publish_at IS NOT NULL AND publish_at <= ${t}
    RETURNING id, class_id AS classId, title, body`)
  const vid = await db.all<{ id: string; title: string }>(sql`
    UPDATE videos SET published = 1, publish_at = NULL WHERE published = 0 AND publish_at IS NOT NULL AND publish_at <= ${t} RETURNING id, title`)
  const mat = await db.all<{ id: string; title: string }>(sql`
    UPDATE materials SET published = 1, publish_at = NULL WHERE published = 0 AND publish_at IS NOT NULL AND publish_at <= ${t} RETURNING id, title`)
  await notifyReleased(db, [...asg, ...ann, ...vid, ...mat], t)
  for (const a of asg) await enqueueForClasses(db, [a.classId], { title: '📝 งานใหม่', body: a.title, url: '/me?sheet=pending', dedupeKey: `pub:a:${a.id}` }, t)
  for (const a of ann) await enqueueForClasses(db, [a.classId], { title: `📢 ${a.title}`, body: a.body, url: '/me', dedupeKey: `pub:n:${a.id}` }, t)
  checkedAt = 0
  return asg.length + ann.length + vid.length + mat.length
}
