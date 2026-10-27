import { Hono } from 'hono'
import { watchlistQuerySchema } from '../../shared/watchlist'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { apiError } from '../http'
import { watchlist } from './service'

export const teacherWatchlistRoutes = new Hono<AppEnv>()
teacherWatchlistRoutes.use('*', requireTeacher)
teacherWatchlistRoutes.get('/watchlist', async (c) => {
  const q = watchlistQuerySchema.safeParse(c.req.query())
  if (!q.success) throw apiError('invalid_request', 'เงื่อนไขไม่ถูกต้อง', 400)
  return c.json(await watchlist(getDb(c.env), q.data, now()))
})
