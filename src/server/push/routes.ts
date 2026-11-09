import type { Context } from 'hono'
import { Hono } from 'hono'
import { requireStudent } from '../auth/middleware'
import { getDb, now, type Db } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { pushSubscribeSchema } from '../../shared/push'
import { drain, recentNotifications, subscribe, takeUnshown, unsubscribe } from './service'
import { vapidKeys } from './vapid'

export const studentPushRoutes = new Hono<AppEnv>()
studentPushRoutes.use('*', requireStudent)
const me = (c: { get(k: 'session'): AppEnv['Variables']['session'] }) => c.get('session') as Extract<SessionInfo, { kind: 'student' }>

studentPushRoutes.get('/key', async (c) => c.json({ publicKey: (await vapidKeys(getDb(c.env))).publicKey }))
studentPushRoutes.post('/subscribe', async (c) => {
  const { endpoint } = await parseBody(c, pushSubscribeSchema)
  await subscribe(getDb(c.env), me(c).studentId, endpoint, now())
  return c.json({ ok: true })
})
studentPushRoutes.post('/unsubscribe', async (c) => {
  const { endpoint } = await parseBody(c, pushSubscribeSchema)
  await unsubscribe(getDb(c.env), me(c).studentId, endpoint)
  return c.json({ ok: true })
})
/** service worker เรียกเมื่อได้ push */
studentPushRoutes.post('/take', async (c) => c.json(await takeUnshown(getDb(c.env), me(c).studentId, now())))
studentPushRoutes.get('/notifications', async (c) => c.json(await recentNotifications(getDb(c.env), me(c).studentId, now())))

/** หลังสร้างการแจ้งเตือนในคำขอของครู: ส่ง push ต่อหลังตอบกลับแล้ว (ไม่ทำให้ครูรอ) */
export function pushInBackground(c: Context<AppEnv>, work: (db: Db) => Promise<unknown>): Promise<void> {
  const db = getDb(c.env)
  const p = work(db)
    .then(() => drain(db, now()))
    .then(() => undefined)
    .catch((e) => console.error('push failed', e))
  try {
    c.executionCtx.waitUntil(p)
    return Promise.resolve()
  } catch {
    return p
  }
}
