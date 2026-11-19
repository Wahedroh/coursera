import { Hono } from 'hono'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { teacherInsights } from './service'

export const teacherInsightsRoutes = new Hono<AppEnv>()
teacherInsightsRoutes.use('*', requireTeacher)
teacherInsightsRoutes.get('/home-insights', async (c) => c.json(await teacherInsights(getDb(c.env), now())))
