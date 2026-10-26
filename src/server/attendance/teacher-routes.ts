import { Hono } from 'hono'
import { dateSchema, statusInputSchema } from '../../shared/attendance'
import { requireTeacher } from '../auth/middleware'
import { getDb } from '../db/client'
import type { AppEnv } from '../env'
import { apiError, parseBody } from '../http'
import { attendanceRange, openDay, setStatus } from './service'

export const teacherAttendanceRoutes = new Hono<AppEnv>()
teacherAttendanceRoutes.use('*', requireTeacher)

const date = (v: string | undefined) => {
  const r = dateSchema.safeParse(v)
  if (!r.success) throw apiError('invalid_request', 'วันที่ไม่ถูกต้อง', 400)
  return r.data
}

teacherAttendanceRoutes.get('/classes/:id/attendance', async (c) => c.json(await openDay(getDb(c.env), c.req.param('id'), date(c.req.query('date')))))

teacherAttendanceRoutes.put('/attendance/:dayId/records/:studentId', async (c) => {
  const { status } = await parseBody(c, statusInputSchema)
  await setStatus(getDb(c.env), c.req.param('dayId'), c.req.param('studentId'), status, 'teacher')
  return c.json({ ok: true })
})

teacherAttendanceRoutes.get('/classes/:id/attendance-range', async (c) =>
  c.json(await attendanceRange(getDb(c.env), c.req.param('id'), date(c.req.query('from')), date(c.req.query('to')))),
)
