import { Hono } from 'hono'
import { dateSchema, todayBangkok } from '../../shared/attendance'
import { z } from 'zod'
import { appointmentInputSchema, closureInputSchema, makeupInputSchema, schoolCountingSchema, placeInputSchema, slotPeriodsSchema, weeklyPeriodsSchema } from '../../shared/workload'
import { requireTeacher } from '../auth/middleware'
import { getDb, now } from '../db/client'
import type { AppEnv } from '../env'
import { apiError, parseBody } from '../http'
import {
  createAppointment,
  createMakeups,
  deleteMakeup,
  listMakeups,
  makeupSummary,
  setMakeupNeeded,
  createClosure,
  dayPlan,
  deleteAppointment,
  deleteClosure,
  listAppointments,
  listClosures,
  listPlaces,
  setSchoolCounting,
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
teacherWorkloadRoutes.put('/schools/:id/counting', async (c) => {
  await setSchoolCounting(getDb(c.env), c.req.param('id'), await parseBody(c, schoolCountingSchema))
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

teacherWorkloadRoutes.get('/workload/makeup', async (c) => {
  const today = todayBangkok(now())
  return c.json(await makeupSummary(getDb(c.env), date(c.req.query('from'), `${today.slice(0, 7)}-01`), date(c.req.query('to'), today)))
})
teacherWorkloadRoutes.put('/closures/:id/makeup', async (c) => {
  const { needed } = await parseBody(c, z.object({ needed: z.boolean() }))
  await setMakeupNeeded(getDb(c.env), c.req.param('id'), needed)
  return c.json({ ok: true })
})
teacherWorkloadRoutes.get('/makeups', async (c) => c.json(await listMakeups(getDb(c.env), date(c.req.query('from'), todayBangkok(now() - 60 * 86400_000)))))
teacherWorkloadRoutes.post('/makeups', async (c) => c.json({ ids: await createMakeups(getDb(c.env), await parseBody(c, makeupInputSchema), now()) }))
teacherWorkloadRoutes.delete('/makeups/:id', async (c) => {
  await deleteMakeup(getDb(c.env), c.req.param('id'))
  return c.json({ ok: true })
})
