import { Hono } from 'hono'
import { getDb } from '../db/client'
import type { AppEnv } from '../env'
import { apiError } from '../http'
import { canJoin } from './service'
import { liveSessions } from '../db/schema'
import { eq } from 'drizzle-orm'

/** GET /api/live/:id/ws — ตรวจสิทธิ์จาก session cookie แล้วส่งต่อให้ LiveRoom พร้อม role */
export const liveWsRoutes = new Hono<AppEnv>()

liveWsRoutes.get('/:id/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') throw apiError('upgrade_required', 'ต้องเชื่อมต่อแบบ WebSocket', 426)
  const s = c.get('session')
  if (!s) throw apiError('unauthorized', 'กรุณาเข้าสู่ระบบ', 401)
  const id = c.req.param('id')
  const db = getDb(c.env)
  let role: 'teacher' | 'student'
  if (s.kind === 'teacher') {
    const [live] = await db.select({ id: liveSessions.id }).from(liveSessions).where(eq(liveSessions.id, id))
    if (!live) throw apiError('live_not_found', 'ไม่พบไลฟ์นี้', 404)
    role = 'teacher'
  } else {
    if (!(await canJoin(db, id, s))) throw apiError('forbidden', 'เข้าไลฟ์นี้ไม่ได้', 403)
    role = 'student'
  }
  const stub = c.env.LIVE.get(c.env.LIVE.idFromName(`live:${id}`))
  return stub.fetch(new Request(`https://live/ws?role=${role}`, { headers: c.req.raw.headers }))
})
