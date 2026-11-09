import { Hono } from 'hono'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import { newTermSchema } from '../../shared/terms'
import { listTerms, startNewTerm } from './service'

export const teacherTermRoutes = new Hono<AppEnv>()
teacherTermRoutes.use('*', requireTeacher)
teacherTermRoutes.get('/terms', async (c) => c.json(await listTerms(getDb(c.env))))
teacherTermRoutes.post('/terms', async (c) => {
  const { name } = await parseBody(c, newTermSchema)
  return c.json(await startNewTerm(getDb(c.env), name, now()))
})
