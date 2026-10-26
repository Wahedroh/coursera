import { Hono } from 'hono'
import { requireStudent } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { videoForStudent, videosForStudent } from './service'

type StudentSession = Extract<SessionInfo, { kind: 'student' }>

export const studentVideoRoutes = new Hono<AppEnv>()
studentVideoRoutes.use('*', requireStudent)
const me = (c: { get(k: 'session'): AppEnv['Variables']['session'] }) => c.get('session') as StudentSession

studentVideoRoutes.get('/', async (c) => c.json(await videosForStudent(getDb(c.env), me(c).classId)))
studentVideoRoutes.get('/:id', async (c) => c.json(await videoForStudent(getDb(c.env), c.req.param('id'), me(c).classId)))
