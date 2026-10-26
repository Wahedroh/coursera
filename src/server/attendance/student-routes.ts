import { Hono } from 'hono'
import { z } from 'zod'
import { requireStudent } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { studentCheckin } from './service'

export const studentCheckinRoutes = new Hono<AppEnv>()
studentCheckinRoutes.use('*', requireStudent)

studentCheckinRoutes.post('/', async (c) => {
  const { dayId, token } = await parseBody(c, z.object({ dayId: z.string().max(64), token: z.string().max(64) }))
  const s = c.get('session') as Extract<SessionInfo, { kind: 'student' }>
  return c.json(await studentCheckin(getDb(c.env), c.env.SESSION_SECRET, { dayId, token, studentId: s.studentId, classId: s.classId }))
})
