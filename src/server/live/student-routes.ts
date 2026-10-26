import { Hono } from 'hono'
import { requireStudent } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { currentForStudent, publish, studentState, submitAnswer } from './service'

type StudentSession = Extract<SessionInfo, { kind: 'student' }>

export const studentLiveRoutes = new Hono<AppEnv>()
studentLiveRoutes.use('*', requireStudent)
const me = (c: { get(k: 'session'): AppEnv['Variables']['session'] }) => c.get('session') as StudentSession

studentLiveRoutes.get('/current', async (c) => c.json({ live: await currentForStudent(getDb(c.env), me(c).classId) }))

studentLiveRoutes.get('/:id', async (c) => c.json(await studentState(getDb(c.env), c.req.param('id'), me(c), now())))

studentLiveRoutes.post('/:id/answer', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    body = null
  }
  const db = getDb(c.env)
  await submitAnswer(db, c.req.param('id'), me(c), body, now())
  // อัปเดตจำนวนคนตอบบนจอ (publish ไม่โยน error)
  await publish(c.env, db, c.req.param('id'), now())
  return c.json({ ok: true })
})
