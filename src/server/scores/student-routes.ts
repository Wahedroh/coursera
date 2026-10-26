import { Hono } from 'hono'
import { requireStudent } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { scoresForStudent } from './service'

type StudentSession = Extract<SessionInfo, { kind: 'student' }>

export const studentScoreRoutes = new Hono<AppEnv>()
studentScoreRoutes.use('*', requireStudent)

studentScoreRoutes.get('/', async (c) => {
  const s = c.get('session') as StudentSession
  return c.json(await scoresForStudent(getDb(c.env), s.studentId, s.classId))
})
