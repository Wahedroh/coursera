import { Hono } from 'hono'
import { requireStudent } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { studentHomeCards } from './service'

type StudentSession = Extract<SessionInfo, { kind: 'student' }>
export const studentHomeRoutes = new Hono<AppEnv>()
studentHomeRoutes.use('*', requireStudent)
studentHomeRoutes.get('/', async (c) => {
  const s = c.get('session') as StudentSession
  return c.json(await studentHomeCards(getDb(c.env), s.studentId, s.classId, now()))
})
