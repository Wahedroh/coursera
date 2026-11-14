import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { slotInputSchema } from '../../shared/timetable'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { apiError, parseBody } from '../http'
import { enqueueForClasses } from '../push/service'
import { pushInBackground } from '../push/routes'
import { invalidateRelease } from './release'
import { addSlot, deleteSlot, isPaused, listSlots, setPaused, timetableNow } from './service'

export const teacherTimetableRoutes = new Hono<AppEnv>()
teacherTimetableRoutes.use('*', requireTeacher)

teacherTimetableRoutes.get('/timetable', async (c) => {
  const db = getDb(c.env)
  return c.json({ slots: await listSlots(db), paused: await isPaused(db) })
})
teacherTimetableRoutes.post('/timetable', async (c) => c.json({ id: await addSlot(getDb(c.env), await parseBody(c, slotInputSchema), now()) }))
teacherTimetableRoutes.delete('/timetable/:id', async (c) => {
  await deleteSlot(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})
teacherTimetableRoutes.put('/timetable/paused', async (c) => {
  const { paused } = await parseBody(c, z.object({ paused: z.boolean() }))
  await setPaused(getDb(c.env), paused)
  return c.json({ ok: true })
})
teacherTimetableRoutes.get('/timetable/now', async (c) => c.json(await timetableNow(getDb(c.env), now())))

// ---- รายการที่รอเผยแพร่ (ตั้งเวลา/ร่าง) ทุกประเภท ----
const TABLES = { assignment: 'assignments', video: 'videos', material: 'materials', announcement: 'announcements' } as const
type ScheduledType = keyof typeof TABLES
export type ScheduledItem = { type: ScheduledType; id: string; classId: string; title: string; publishAt: number | null; createdAt: number }

teacherTimetableRoutes.get('/scheduled', async (c) => {
  const db = getDb(c.env)
  const rows = await db.all<ScheduledItem>(sql`
    SELECT * FROM (
    SELECT 'assignment' AS type, id, class_id AS classId, title, publish_at AS publishAt, created_at AS createdAt FROM assignments WHERE published = 0
    UNION ALL SELECT 'video', id, class_id, title, publish_at, created_at FROM videos WHERE published = 0 AND publish_at IS NOT NULL
    UNION ALL SELECT 'material', id, class_id, title, publish_at, created_at FROM materials WHERE published = 0 AND publish_at IS NOT NULL
    UNION ALL SELECT 'announcement', id, class_id, title, publish_at, created_at FROM announcements WHERE published = 0)
    ORDER BY publishAt IS NULL, publishAt, createdAt DESC`)
  return c.json(rows)
})

/** เผยแพร่ตอนนี้ (publishAt = null) หรือเลื่อนเวลา */
teacherTimetableRoutes.put('/scheduled/:type/:id', async (c) => {
  const type = c.req.param('type') as ScheduledType
  if (!(type in TABLES)) throw apiError('not_found', 'ไม่พบรายการนี้', 404)
  const { publishAt } = await parseBody(c, z.object({ publishAt: z.number().int().nullable() }))
  const db = getDb(c.env)
  const t = now()
  const table = sql.raw(TABLES[type])
  const id = c.req.param('id')
  const publishNow = publishAt === null || publishAt <= t
  const [row] = await db.all<{ classId: string; title: string; body: string | null }>(
    publishNow
      ? sql`UPDATE ${table} SET published = 1, publish_at = NULL WHERE id = ${id} AND published = 0 RETURNING class_id AS classId, title, ${type === 'announcement' ? sql`body` : sql`NULL`} AS body`
      : sql`UPDATE ${table} SET publish_at = ${publishAt} WHERE id = ${id} AND published = 0 RETURNING class_id AS classId, title, NULL AS body`,
  )
  if (!row) throw apiError('not_found', 'ไม่พบรายการที่รอเผยแพร่นี้', 404)
  invalidateRelease()
  if (publishNow && (type === 'assignment' || type === 'announcement')) {
    const n = type === 'assignment' ? { title: '📝 งานใหม่', body: row.title, url: '/me?sheet=pending' } : { title: `📢 ${row.title}`, body: row.body ?? '', url: '/me' }
    await pushInBackground(c, (d) => enqueueForClasses(d, [row.classId], { ...n, dedupeKey: `pub:${type === 'assignment' ? 'a' : 'n'}:${id}` }, t))
  }
  return c.json({ ok: true })
})
