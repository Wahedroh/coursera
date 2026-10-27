import { Hono } from 'hono'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { classReport } from './service'

export const teacherReportRoutes = new Hono<AppEnv>()
teacherReportRoutes.use('*', requireTeacher)
teacherReportRoutes.get('/classes/:id/report', async (c) => c.json(await classReport(getDb(c.env), c.req.param('id'), now())))
