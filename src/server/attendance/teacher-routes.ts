import { Hono } from 'hono'
import { dateSchema, statusInputSchema } from '../../shared/attendance'
import { requireTeacher } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv } from '../env'
import { apiError, parseBody } from '../http'
import { z } from 'zod'
import { todayBangkok } from '../../shared/attendance'
import { attendanceRange, currentQr, getDay, getDayByDate, openDay, setSelfCheckin, setStatus } from './service'

export const teacherAttendanceRoutes = new Hono<AppEnv>()
teacherAttendanceRoutes.use('*', requireTeacher)

const date = (v: string | undefined) => {
  const r = dateSchema.safeParse(v)
  if (!r.success) throw apiError('invalid_request', 'วันที่ไม่ถูกต้อง', 400)
  return r.data
}

teacherAttendanceRoutes.get('/classes/:id/attendance', async (c) => c.json(await getDayByDate(getDb(c.env), c.req.param('id'), date(c.req.query('date')))))

teacherAttendanceRoutes.post('/classes/:id/attendance', async (c) => {
  const body = await parseBody(c, z.object({ date: z.string() }))
  const d = date(body.date)
  if (d > todayBangkok()) throw apiError('future_date', 'เช็กชื่อล่วงหน้าไม่ได้', 400)
  return c.json(await openDay(getDb(c.env), c.req.param('id'), d))
})

teacherAttendanceRoutes.put('/attendance/:dayId/records/:studentId', async (c) => {
  const { status } = await parseBody(c, statusInputSchema)
  await setStatus(getDb(c.env), c.req.param('dayId'), c.req.param('studentId'), status, 'teacher')
  return c.json({ ok: true })
})

teacherAttendanceRoutes.get('/classes/:id/attendance-range', async (c) =>
  c.json(await attendanceRange(getDb(c.env), c.req.param('id'), date(c.req.query('from')), date(c.req.query('to')))),
)

teacherAttendanceRoutes.put('/attendance/:dayId/self-checkin', async (c) => {
  const { open } = await parseBody(c, z.object({ open: z.boolean() }))
  await setSelfCheckin(getDb(c.env), c.req.param('dayId'), open)
  return c.json({ ok: true })
})

teacherAttendanceRoutes.get('/attendance/:dayId/qr', async (c) => c.json(await currentQr(getDb(c.env), c.env.SESSION_SECRET, c.req.param('dayId'))))

teacherAttendanceRoutes.get('/attendance/:dayId', async (c) => c.json(await getDay(getDb(c.env), c.req.param('dayId'))))
