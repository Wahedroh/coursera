import { Hono } from 'hono'
import { z } from 'zod'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { apiError, parseBody } from '../http'
import { purgeCandidates, purgeGraded, purgeOrphans, syncFromBucket, usage } from './service'

export const teacherStorageRoutes = new Hono<AppEnv>()
teacherStorageRoutes.use('*', requireTeacher)

teacherStorageRoutes.get('/storage', async (c) => {
  const db = getDb(c.env)
  let u = await usage(db)
  // ครั้งแรก: นับไฟล์ที่มีอยู่ก่อนระบบนับพื้นที่
  if (u.syncedAt === null) u = await syncFromBucket(db, c.env.BUCKET, now())
  return c.json({ usage: u, candidates: await purgeCandidates(db) })
})
teacherStorageRoutes.get('/storage/usage', async (c) => c.json(await usage(getDb(c.env))))
teacherStorageRoutes.post('/storage/sync', async (c) => c.json(await syncFromBucket(getDb(c.env), c.env.BUCKET, now())))

const purgeSchema = z.union([z.object({ assignmentId: z.string().min(1) }), z.object({ olderThanDays: z.number().int().min(0).max(3650) })])
teacherStorageRoutes.post('/storage/purge', async (c) => {
  const body = await parseBody(c, purgeSchema)
  const t = now()
  const scope = 'assignmentId' in body ? { assignmentId: body.assignmentId } : { gradedBefore: t - body.olderThanDays * 24 * 3600_000 }
  return c.json(await purgeGraded(getDb(c.env), c.env.BUCKET, scope, t))
})
teacherStorageRoutes.post('/storage/purge-orphans', async (c) => c.json(await purgeOrphans(getDb(c.env), c.env.BUCKET, now())))

/** ไฟล์สำรองฐานข้อมูล (ใหม่สุดก่อน) — สร้างทุกสัปดาห์โดย GitHub Actions */
teacherStorageRoutes.get('/backups', async (c) => {
  const out: { name: string; size: number; uploadedAt: number }[] = []
  let cursor: string | undefined
  do {
    const page = await c.env.BACKUPS.list({ prefix: 'db/', cursor, limit: 1000 })
    for (const o of page.objects) out.push({ name: o.key.slice(3), size: o.size, uploadedAt: o.uploaded.getTime() })
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return c.json(out.sort((a, b) => b.uploadedAt - a.uploadedAt))
})
teacherStorageRoutes.get('/backups/:name', async (c) => {
  const name = c.req.param('name')
  if (!/^[\w.-]+\.sql\.gz$/.test(name)) throw apiError('not_found', 'ไม่พบไฟล์สำรอง', 404)
  const obj = await c.env.BACKUPS.get(`db/${name}`)
  if (!obj) throw apiError('not_found', 'ไม่พบไฟล์สำรอง', 404)
  return new Response(obj.body, {
    headers: { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="classroom-${name}"`, 'cache-control': 'private, no-store' },
  })
})
