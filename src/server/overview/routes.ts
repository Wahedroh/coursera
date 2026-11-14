import { Hono } from 'hono'
import { isOverviewKind } from '../../shared/overview'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { apiError } from '../http'
import { overview } from './service'

export const teacherOverviewRoutes = new Hono<AppEnv>()
teacherOverviewRoutes.use('*', requireTeacher)

/** ภาพรวมทุกห้องของเมนูนั้น (แยกโรงเรียน/ชั้นที่ฝั่งหน้าเว็บ) */
teacherOverviewRoutes.get('/overview/:kind', async (c) => {
  const kind = c.req.param('kind')
  if (!isOverviewKind(kind)) throw apiError('not_found', 'ไม่พบเมนูนี้', 404)
  return c.json(await overview(getDb(c.env), kind, now()))
})
