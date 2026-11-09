import { Hono } from 'hono'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { teacherToday } from './service'

export const teacherTodayRoutes = new Hono<AppEnv>()
teacherTodayRoutes.use('*', requireTeacher)
teacherTodayRoutes.get('/today', async (c) => c.json(await teacherToday(getDb(c.env), now())))
