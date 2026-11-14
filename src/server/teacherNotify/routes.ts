import { Hono } from 'hono'
import { z } from 'zod'
import { teacherNotifySchema } from '../../shared/teacherNotify'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import { vapidKeys } from '../push/vapid'
import {
  getNotifySettings,
  markSelfieDone,
  markTeacherRead,
  saveNotifySettings,
  subscribeTeacher,
  takeTeacherUnshown,
  teacherInbox,
  unsubscribeTeacher,
} from './service'

export const teacherNotifyRoutes = new Hono<AppEnv>()
teacherNotifyRoutes.use('*', requireTeacher)

const endpointSchema = z.object({ endpoint: z.string().url().max(1000) })
teacherNotifyRoutes.get('/push/key', async (c) => c.json({ publicKey: (await vapidKeys(getDb(c.env))).publicKey }))
teacherNotifyRoutes.post('/push/subscribe', async (c) => {
  await subscribeTeacher(getDb(c.env), (await parseBody(c, endpointSchema)).endpoint, now())
  return c.json({ ok: true })
})
teacherNotifyRoutes.post('/push/unsubscribe', async (c) => {
  await unsubscribeTeacher(getDb(c.env), (await parseBody(c, endpointSchema)).endpoint)
  return c.json({ ok: true })
})
teacherNotifyRoutes.post('/push/take', async (c) => c.json(await takeTeacherUnshown(getDb(c.env), now())))
teacherNotifyRoutes.get('/notifications', async (c) => c.json(await teacherInbox(getDb(c.env), now())))
teacherNotifyRoutes.post('/notifications/read', async (c) => {
  await markTeacherRead(getDb(c.env), now())
  return c.json({ ok: true })
})
teacherNotifyRoutes.get('/notify-settings', async (c) => c.json(await getNotifySettings(getDb(c.env))))
teacherNotifyRoutes.put('/notify-settings', async (c) => {
  const s = await parseBody(c, teacherNotifySchema)
  await saveNotifySettings(getDb(c.env), s)
  return c.json(s)
})
teacherNotifyRoutes.put('/selfie-done', async (c) => {
  const { slotId, date, done } = await parseBody(c, z.object({ slotId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), done: z.boolean() }))
  await markSelfieDone(getDb(c.env), slotId, date, done)
  return c.json({ ok: true })
})
