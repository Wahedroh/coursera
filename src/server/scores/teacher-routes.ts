import { Hono } from 'hono'
import { createScoreItemsSchema, publishInputSchema, scoreInputSchema, scoreItemInputSchema } from '../../shared/scores'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import { createScoreItems, deleteScoreItem, getScoreSheet, listScoreItems, saveScore, scoreBook, setPublished, updateScoreItem } from './service'

export const teacherScoreRoutes = new Hono<AppEnv>()
teacherScoreRoutes.use('*', requireTeacher)

teacherScoreRoutes.post('/score-items', async (c) => {
  const { classIds, ...input } = await parseBody(c, createScoreItemsSchema)
  return c.json({ ids: await createScoreItems(getDb(c.env), classIds, input) })
})

teacherScoreRoutes.get('/classes/:id/score-items', async (c) => c.json(await listScoreItems(getDb(c.env), c.req.param('id'))))

teacherScoreRoutes.get('/classes/:id/score-book', async (c) => c.json(await scoreBook(getDb(c.env), c.req.param('id'))))

teacherScoreRoutes.get('/score-items/:id', async (c) => c.json(await getScoreSheet(getDb(c.env), c.req.param('id'))))

teacherScoreRoutes.put('/score-items/:id', async (c) => {
  await updateScoreItem(getDb(c.env), c.req.param('id'), await parseBody(c, scoreItemInputSchema))
  return c.json({ ok: true })
})

teacherScoreRoutes.put('/score-items/:id/published', async (c) => {
  const { published } = await parseBody(c, publishInputSchema)
  await setPublished(getDb(c.env), c.req.param('id'), published)
  return c.json({ ok: true })
})

teacherScoreRoutes.delete('/score-items/:id', async (c) => {
  await deleteScoreItem(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})

teacherScoreRoutes.put('/score-items/:id/scores/:studentId', async (c) => {
  await saveScore(getDb(c.env), c.req.param('id'), c.req.param('studentId'), await parseBody(c, scoreInputSchema), now())
  return c.json({ ok: true })
})
