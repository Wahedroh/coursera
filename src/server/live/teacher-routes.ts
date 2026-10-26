import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { activityInputSchema, liveTitleSchema } from '../../shared/live'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import {
  addActivity,
  createLive,
  deleteActivity,
  deleteLive,
  endLive,
  gotoActivity,
  listLive,
  moveActivity,
  publish,
  renameLive,
  setAccepting,
  setShowResults,
  startLive,
  teacherState,
  updateActivity,
} from './service'

export const teacherLiveRoutes = new Hono<AppEnv>()
teacherLiveRoutes.use('*', requireTeacher)

/** เปลี่ยนแปลงแล้วส่ง state ใหม่ให้ทุกจอ แล้วคืน state ให้ครู */
async function done(c: Context<AppEnv>, id: string) {
  const db = getDb(c.env)
  const t = now()
  await publish(c.env, db, id, t)
  return c.json(await teacherState(db, id, t))
}

teacherLiveRoutes.post('/classes/:id/live', async (c) => {
  const { title } = await parseBody(c, liveTitleSchema)
  return c.json({ id: await createLive(getDb(c.env), c.req.param('id'), title, now()) })
})
teacherLiveRoutes.get('/classes/:id/live', async (c) => c.json(await listLive(getDb(c.env), c.req.param('id'))))

teacherLiveRoutes.get('/live/:id', async (c) => c.json(await teacherState(getDb(c.env), c.req.param('id'), now())))
teacherLiveRoutes.put('/live/:id', async (c) => {
  const { title } = await parseBody(c, liveTitleSchema)
  await renameLive(getDb(c.env), c.req.param('id'), title)
  return done(c, c.req.param('id'))
})
teacherLiveRoutes.delete('/live/:id', async (c) => {
  await deleteLive(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})

teacherLiveRoutes.post('/live/:id/activities', async (c) => {
  await addActivity(getDb(c.env), c.req.param('id'), await parseBody(c, activityInputSchema), now())
  return done(c, c.req.param('id'))
})
teacherLiveRoutes.put('/live/activities/:aid', async (c) => done(c, await updateActivity(getDb(c.env), c.req.param('aid'), await parseBody(c, activityInputSchema))))
teacherLiveRoutes.delete('/live/activities/:aid', async (c) => done(c, await deleteActivity(getDb(c.env), c.req.param('aid'))))
teacherLiveRoutes.post('/live/activities/:aid/move', async (c) => {
  const { dir } = await parseBody(c, z.object({ dir: z.union([z.literal(-1), z.literal(1)]) }))
  return done(c, await moveActivity(getDb(c.env), c.req.param('aid'), dir))
})

teacherLiveRoutes.post('/live/:id/start', async (c) => {
  const db = getDb(c.env)
  const ended = await startLive(db, c.req.param('id'), now())
  for (const o of ended) await publish(c.env, db, o, now())
  return done(c, c.req.param('id'))
})
teacherLiveRoutes.post('/live/:id/end', async (c) => {
  await endLive(getDb(c.env), c.req.param('id'), now())
  return done(c, c.req.param('id'))
})
teacherLiveRoutes.post('/live/:id/goto', async (c) => {
  const { index } = await parseBody(c, z.object({ index: z.number().int().min(0) }))
  await gotoActivity(getDb(c.env), c.req.param('id'), index, now())
  return done(c, c.req.param('id'))
})
teacherLiveRoutes.post('/live/:id/accepting', async (c) => {
  const { open } = await parseBody(c, z.object({ open: z.boolean() }))
  await setAccepting(getDb(c.env), c.req.param('id'), open, now())
  return done(c, c.req.param('id'))
})
teacherLiveRoutes.post('/live/:id/show-results', async (c) => {
  const { show } = await parseBody(c, z.object({ show: z.boolean() }))
  await setShowResults(getDb(c.env), c.req.param('id'), show)
  return done(c, c.req.param('id'))
})
