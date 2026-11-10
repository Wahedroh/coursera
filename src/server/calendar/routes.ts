import { Hono } from 'hono'
import { requireStudent, requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv, SessionInfo } from '../env'
import { apiError, parseBody } from '../http'
import { createEventsSchema, eventInputSchema, monthSchema } from '../../shared/calendar'
import { todayBangkok } from '../../shared/attendance'
import { createScoreItems } from '../scores/service'
import { enqueueForClasses } from '../push/service'
import { pushInBackground } from '../push/routes'
import { calendarMonth, createEvents, deleteEvent, eventNoticeTitle, updateEvent } from './service'

const month = (v: string | undefined) => {
  const m = v ?? todayBangkok().slice(0, 7)
  if (!monthSchema.safeParse(m).success) throw apiError('invalid_request', 'เดือนไม่ถูกต้อง', 400)
  return m
}

export const teacherCalendarRoutes = new Hono<AppEnv>()
teacherCalendarRoutes.use('*', requireTeacher)
teacherCalendarRoutes.get('/calendar', async (c) => c.json(await calendarMonth(getDb(c.env), month(c.req.query('month')), { classId: c.req.query('classId') || null })))
teacherCalendarRoutes.post('/events', async (c) => {
  const { classIds, scoreItem, ...input } = await parseBody(c, createEventsSchema)
  const db = getDb(c.env)
  const ids = await createEvents(db, classIds, input, now())
  if (input.kind === 'exam' && scoreItem) await createScoreItems(db, classIds, { title: input.title, category: scoreItem.category, maxScore: scoreItem.maxScore, takenOn: input.date })
  if (input.date >= todayBangkok()) await pushInBackground(c, (d) => enqueueForClasses(d, classIds, { title: eventNoticeTitle(input.kind, input.title, input.date), body: [input.period, input.detail].filter(Boolean).join(' · '), url: '/me/calendar' }, now()))
  return c.json({ ids })
})
teacherCalendarRoutes.put('/events/:id', async (c) => {
  await updateEvent(getDb(c.env), c.req.param('id'), await parseBody(c, eventInputSchema))
  return c.json({ ok: true })
})
teacherCalendarRoutes.delete('/events/:id', async (c) => {
  await deleteEvent(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})

export const studentCalendarRoutes = new Hono<AppEnv>()
studentCalendarRoutes.use('*', requireStudent)
studentCalendarRoutes.get('/', async (c) => {
  const s = c.get('session') as Extract<SessionInfo, { kind: 'student' }>
  return c.json(await calendarMonth(getDb(c.env), month(c.req.query('month')), { classId: s.classId, studentId: s.studentId }))
})
