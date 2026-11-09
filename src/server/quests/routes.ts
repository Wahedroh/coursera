import { Hono } from 'hono'
import { requireStudent } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { claimQuest, weeklyQuests } from './service'

export const studentQuestRoutes = new Hono<AppEnv>()
studentQuestRoutes.use('*', requireStudent)
const me = (c: { get(k: 'session'): AppEnv['Variables']['session'] }) => c.get('session') as Extract<SessionInfo, { kind: 'student' }>

studentQuestRoutes.get('/', async (c) => c.json(await weeklyQuests(getDb(c.env), me(c).studentId, me(c).classId, now())))
studentQuestRoutes.post('/:id/claim', async (c) => c.json(await claimQuest(getDb(c.env), me(c).studentId, me(c).classId, c.req.param('id'), now())))
