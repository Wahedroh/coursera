import { Hono } from 'hono'
import { announcementInputSchema, createAnnouncementsSchema } from '../../shared/announcements'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { announcementsForStudent, createAnnouncements, deleteAnnouncement, listAnnouncements, markRead, updateAnnouncement } from './service'

export const teacherAnnouncementRoutes = new Hono<AppEnv>()
teacherAnnouncementRoutes.use('*', requireTeacher)

teacherAnnouncementRoutes.post('/announcements', async (c) => {
  const { classIds, ...input } = await parseBody(c, createAnnouncementsSchema)
  return c.json({ ids: await createAnnouncements(getDb(c.env), classIds, input, now()) })
})
teacherAnnouncementRoutes.get('/classes/:id/announcements', async (c) => c.json(await listAnnouncements(getDb(c.env), c.req.param('id'), now())))
teacherAnnouncementRoutes.put('/announcements/:id', async (c) => {
  await updateAnnouncement(getDb(c.env), c.req.param('id'), await parseBody(c, announcementInputSchema))
  return c.json({ ok: true })
})
teacherAnnouncementRoutes.delete('/announcements/:id', async (c) => {
  await deleteAnnouncement(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})

type StudentSession = Extract<SessionInfo, { kind: 'student' }>
export const studentAnnouncementRoutes = new Hono<AppEnv>()
studentAnnouncementRoutes.use('*', requireStudent)
studentAnnouncementRoutes.get('/', async (c) => {
  const s = c.get('session') as StudentSession
  return c.json(await announcementsForStudent(getDb(c.env), s.studentId, s.classId, now()))
})
studentAnnouncementRoutes.post('/:id/read', async (c) => {
  const s = c.get('session') as StudentSession
  await markRead(getDb(c.env), c.req.param('id'), s.studentId, s.classId, now())
  return c.json({ ok: true })
})
