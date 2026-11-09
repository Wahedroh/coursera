import { Hono } from 'hono'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { classInsights, compareClasses } from './service'

export const teacherInsightRoutes = new Hono<AppEnv>()
teacherInsightRoutes.use('*', requireTeacher)
teacherInsightRoutes.get('/insights', async (c) => c.json(await compareClasses(getDb(c.env), now())))
teacherInsightRoutes.get('/classes/:id/insights', async (c) => c.json(await classInsights(getDb(c.env), c.req.param('id'), now(), c.req.query('term') || undefined)))
