import { Hono } from 'hono'
import { z } from 'zod'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { battleEnabled, examBattles, setBattle } from './service'

export const teacherBattleRoutes = new Hono<AppEnv>()
teacherBattleRoutes.use('*', requireTeacher)
teacherBattleRoutes.get('/battles', async (c) => c.json(await examBattles(getDb(c.env))))
teacherBattleRoutes.get('/classes/:id/settings/battle', async (c) => c.json({ enabled: await battleEnabled(getDb(c.env), c.req.param('id')) }))
teacherBattleRoutes.put('/classes/:id/settings/battle', async (c) => {
  const { enabled } = await parseBody(c, z.object({ enabled: z.boolean() }))
  await setBattle(getDb(c.env), c.req.param('id'), enabled)
  return c.json({ ok: true })
})

export const studentBattleRoutes = new Hono<AppEnv>()
studentBattleRoutes.use('*', requireStudent)
studentBattleRoutes.get('/', async (c) => {
  const s = c.get('session') as Extract<SessionInfo, { kind: 'student' }>
  return c.json(await examBattles(getDb(c.env), s.classId))
})
