import { Hono } from 'hono'
import { announcementInputSchema, createAnnouncementsSchema } from '../../shared/announcements'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { parseBody } from '../http'
import { publishSchema } from '../../shared/timetable'
import { resolvePublish } from '../timetable/service'
import { invalidateRelease } from '../timetable/release'
import { enqueueForClasses } from '../push/service'
import { pushInBackground } from '../push/routes'
import { announcementsForStudent, createAnnouncements, deleteAnnouncement, listAnnouncements, markRead, updateAnnouncement } from './service'

export const teacherAnnouncementRoutes = new Hono<AppEnv>()
teacherAnnouncementRoutes.use('*', requireTeacher)

teacherAnnouncementRoutes.post('/announcements', async (c) => {
  const { classIds, publishMode, publishAt, ...input } = await parseBody(c, createAnnouncementsSchema.extend(publishSchema.shape))
  const db = getDb(c.env)
  const sched = await resolvePublish(db, classIds, { publishMode, publishAt }, now())
  const ids = await createAnnouncements(db, classIds, input, now(), sched)
  const nowIds = classIds.filter((id) => sched.get(id)?.published)
  if (nowIds.length < classIds.length) invalidateRelease()
  if (nowIds.length) await pushInBackground(c, (d) => enqueueForClasses(d, nowIds, { title: `📢 ${input.title}`, body: input.body, url: '/me' }, now()))
  return c.json({ ids })
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
