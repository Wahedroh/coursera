import { Hono } from 'hono'
import { z } from 'zod'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
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
