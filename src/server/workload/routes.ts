import { Hono } from 'hono'
import { z } from 'zod'
import { dateSchema, todayBangkok } from '../../shared/attendance'
import { appointmentInputSchema, closureInputSchema, placeInputSchema, slotPeriodsSchema, weeklyPeriodsSchema } from '../../shared/workload'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { apiError, parseBody } from '../http'
import {
  checkNavToken,
  createAppointment,
  createClosure,
  dayPlan,
  deleteAppointment,
  deleteClosure,
  getNavToken,
  listAppointments,
  listClosures,
  listPlaces,
  navCalendar,
  nextStop,
  rotateNavToken,
  setSchoolPlace,
  setSlotPeriods,
  setWeeklyPeriods,
  workloadRange,
  workloadTargets,
} from './service'

export const teacherWorkloadRoutes = new Hono<AppEnv>()
teacherWorkloadRoutes.use('*', requireTeacher)

const date = (v: string | undefined, fallback: string) => {
  const r = dateSchema.safeParse(v ?? fallback)
  if (!r.success) throw apiError('invalid_date', 'วันที่ไม่ถูกต้อง', 400)
  return r.data
}

teacherWorkloadRoutes.get('/workload/targets', async (c) => c.json(await workloadTargets(getDb(c.env))))
teacherWorkloadRoutes.get('/workload', async (c) => {
  const t = now()
  const today = todayBangkok(t)
  const from = date(c.req.query('from'), `${today.slice(0, 7)}-01`)
  const to = date(c.req.query('to'), today)
  return c.json(await workloadRange(getDb(c.env), from, to, t))
})
teacherWorkloadRoutes.put('/classes/:id/weekly-periods', async (c) => {
  const { weeklyPeriods } = await parseBody(c, weeklyPeriodsSchema)
  await setWeeklyPeriods(getDb(c.env), c.req.param('id'), weeklyPeriods)
  return c.json({ ok: true })
})
teacherWorkloadRoutes.put('/timetable/:id/periods', async (c) => {
  const { periods } = await parseBody(c, slotPeriodsSchema)
  await setSlotPeriods(getDb(c.env), c.req.param('id'), periods)
  return c.json({ ok: true })
})

teacherWorkloadRoutes.get('/route/day', async (c) => c.json(await dayPlan(getDb(c.env), date(c.req.query('date'), todayBangkok(now())))))

teacherWorkloadRoutes.get('/closures', async (c) => c.json(await listClosures(getDb(c.env), date(c.req.query('from'), todayBangkok(now() - 30 * 86400_000)))))
teacherWorkloadRoutes.post('/closures', async (c) => c.json({ id: await createClosure(getDb(c.env), await parseBody(c, closureInputSchema), now()) }))
teacherWorkloadRoutes.delete('/closures/:id', async (c) => {
  await deleteClosure(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})

teacherWorkloadRoutes.get('/places', async (c) => c.json(await listPlaces(getDb(c.env))))
teacherWorkloadRoutes.put('/places/:schoolId', async (c) => c.json(await setSchoolPlace(getDb(c.env), c.req.param('schoolId'), (await parseBody(c, placeInputSchema)).mapUrl)))

teacherWorkloadRoutes.get('/appointments', async (c) => c.json(await listAppointments(getDb(c.env), todayBangkok(now()))))
teacherWorkloadRoutes.post('/appointments', async (c) => c.json({ id: await createAppointment(getDb(c.env), await parseBody(c, appointmentInputSchema), now()) }))
teacherWorkloadRoutes.delete('/appointments/:id', async (c) => {
  await deleteAppointment(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})

teacherWorkloadRoutes.get('/nav-token', async (c) => c.json({ token: await getNavToken(getDb(c.env)) }))
teacherWorkloadRoutes.post('/nav-token', async (c) => c.json({ token: await rotateNavToken(getDb(c.env)) }))

/** สำหรับคำสั่งลัดบน iPhone (ไม่มีคุกกี้): ใช้ลิงก์ลับ · เห็นแค่ปลายทาง ไม่มีข้อมูลนักเรียน */
export const navRoutes = new Hono<AppEnv>()
const guard = async (c: { env: AppEnv['Bindings']; req: { param: (k: 'token') => string } }) => {
  const token = c.req.param('token')
  if (!z.string().min(20).max(64).safeParse(token).success || !(await checkNavToken(getDb(c.env), token))) throw apiError('not_found', 'ไม่พบ', 404)
}
/** ข้อความล้วน: ลิงก์ Apple Maps ไปจุดถัดไปของวันนี้ · ไม่มี = ข้อความว่าง (คำสั่งลัดจะไม่ทำอะไร) */
navRoutes.get('/:token/next', async (c) => {
  await guard(c)
  const s = await nextStop(getDb(c.env), now())
  return c.text(s ? s.nav : '', 200, { 'cache-control': 'no-store' })
})
navRoutes.get('/:token/next.json', async (c) => {
  await guard(c)
  const s = await nextStop(getDb(c.env), now())
  return c.json(s ? { name: s.name, start: s.start, periods: s.periods, nav: s.nav } : null, 200, { 'cache-control': 'no-store' })
})
navRoutes.get('/:token/calendar.ics', async (c) => {
  await guard(c)
  return c.body(await navCalendar(getDb(c.env), now()), 200, { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' })
})
