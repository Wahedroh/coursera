import { Hono } from 'hono'
import { createVideosSchema, videoInputSchema, videoPublishSchema } from '../../shared/videos'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { parseBody } from '../http'
import { createVideos, deleteVideo, listVideos, setVideoPublished, updateVideo } from './service'

export const teacherVideoRoutes = new Hono<AppEnv>()
teacherVideoRoutes.use('*', requireTeacher)

teacherVideoRoutes.post('/videos', async (c) => {
  const { classIds, ...input } = await parseBody(c, createVideosSchema)
  return c.json({ ids: await createVideos(getDb(c.env), classIds, input, now()) })
})
teacherVideoRoutes.get('/classes/:id/videos', async (c) => c.json(await listVideos(getDb(c.env), c.req.param('id'))))
teacherVideoRoutes.put('/videos/:id', async (c) => {
  await updateVideo(getDb(c.env), c.req.param('id'), await parseBody(c, videoInputSchema))
  return c.json({ ok: true })
})
teacherVideoRoutes.put('/videos/:id/published', async (c) => {
  const { published } = await parseBody(c, videoPublishSchema)
  await setVideoPublished(getDb(c.env), c.req.param('id'), published)
  return c.json({ ok: true })
})
teacherVideoRoutes.delete('/videos/:id', async (c) => {
  await deleteVideo(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})
